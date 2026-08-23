const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const aiService = require('../services/aiService');
const store = require('../services/persistentStore');
const logger = require('../utils/logger');
const { requireManagement } = require('../middleware/rbac');

const TOURNAMENTS = 'tournaments';
const TEAMS = 'tournament_teams';
const VALID_FORMATS = ['round_robin', 'points'];

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function getTeams(tournamentId) {
  return store.list(TEAMS, { tournament_id: tournamentId }, { orderBy: 'created_at', order: 'desc', limit: 100 });
}

function isRegistrationExpired(deadline) {
  if (!deadline) return false;
  const value = String(deadline).trim();
  const deadlineDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999+08:00`)
    : new Date(value);
  return !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now();
}

router.post('/create', authMiddleware, requireManagement, async (req, res) => {
  try {
    const { name, format, topic_ids, judge_ids, max_teams, team_size, registration_deadline, rules } = req.body;
    if (!name || !VALID_FORMATS.includes(format) || !Array.isArray(topic_ids) || topic_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '请填写赛事名称、赛制和至少一个辩题', data: null });
    }
    if (!Number.isInteger(max_teams) || max_teams < 2) {
      return res.status(400).json({ code: 400, message: 'max_teams 至少为 2', data: null });
    }
    const teamSize = Number.isInteger(team_size) && team_size >= 1 ? team_size : 2;
    const now = new Date().toISOString();
    const tournament = {
      _id: createId('tournament'),
      name: name.trim(),
      format,
      topic_ids,
      judge_ids: Array.isArray(judge_ids) && judge_ids.length ? judge_ids : [req.user.userId || req.user.openid],
      max_teams,
      team_size: teamSize,
      registration_deadline: registration_deadline || null,
      rules: rules || '',
      created_by: req.user.userId || req.user.openid,
      status: 'registering',
      created_at: now,
      updated_at: now,
    };
    await store.set(TOURNAMENTS, tournament._id, tournament);
    logger.info('赛事创建成功', { tournamentId: tournament._id, name: tournament.name });
    return res.json({ code: 200, message: 'ok', data: tournament });
  } catch (err) {
    logger.error('创建赛事失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '创建赛事失败', data: null });
  }
});

router.get('/list', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 10, 1), 100);
    const allTournaments = await store.list(TOURNAMENTS, {}, { orderBy: 'created_at', order: 'desc', limit: 1000 });
    const withCounts = await Promise.all(allTournaments.map(async tournament => ({
      ...tournament,
      team_count: (await getTeams(tournament._id)).length,
    })));
    const total = withCounts.length;
    return res.json({
      code: 200,
      message: 'ok',
      data: {
        tournaments: withCounts.slice((page - 1) * size, page * size),
        pagination: { page, size, total, totalPages: Math.ceil(total / size) },
      },
    });
  } catch (err) {
    logger.error('获取赛事列表失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '获取赛事列表失败', data: null });
  }
});

router.post('/:id/register', authMiddleware, async (req, res) => {
  try {
    const tournament = await store.get(TOURNAMENTS, req.params.id);
    const { team_name, members, member_styles } = req.body;
    if (!tournament) return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    if (tournament.status !== 'registering') return res.status(400).json({ code: 400, message: '赛事当前未开放报名', data: null });
    if (isRegistrationExpired(tournament.registration_deadline)) {
      return res.status(400).json({ code: 400, message: '报名已截止', data: null });
    }
    const normalizedTeamName = String(team_name || '').trim();
    const normalizedMembers = Array.isArray(members) ? members.map(member => String(member || '').trim()) : [];
    const normalizedStyles = Array.isArray(member_styles) ? member_styles.map(style => String(style || '').trim()) : [];
    const validStyles = ['data_driven', 'value_driven', 'logic_focused', 'balanced'];
    if (!normalizedTeamName || normalizedMembers.length !== tournament.team_size || normalizedMembers.some(member => !member) || normalizedStyles.length !== normalizedMembers.length || normalizedStyles.some(style => !validStyles.includes(style))) {
      return res.status(400).json({ code: 400, message: `请填写 ${tournament.team_size} 名队员及对应风格`, data: null });
    }
    const teams = await getTeams(tournament._id);
    if (teams.length >= tournament.max_teams) return res.status(400).json({ code: 400, message: '参赛队伍已满', data: null });
    let compatibility;
    try {
      compatibility = await aiService.analyzeTeamCompatibility(normalizedMembers, normalizedStyles);
    } catch (err) {
      compatibility = getDefaultCompatibility(normalizedStyles);
    }
    const team = {
      _id: createId('team'),
      tournament_id: tournament._id,
      team_name: normalizedTeamName,
      members: normalizedMembers,
      member_styles: normalizedStyles,
      compatibility,
      created_by: req.user.userId || req.user.openid,
      created_at: new Date().toISOString(),
    };
    await store.set(TEAMS, team._id, team);
    return res.json({ code: 200, message: 'ok', data: { team, compatibility } });
  } catch (err) {
    logger.error('报名参赛失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '报名参赛失败', data: null });
  }
});

router.delete('/:id', authMiddleware, requireManagement, async (req, res) => {
  try {
    const tournament = await store.get(TOURNAMENTS, req.params.id);
    if (!tournament) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    const teams = await getTeams(tournament._id);
    await Promise.all(teams.map(team => store.remove(TEAMS, team._id)));
    await store.remove(TOURNAMENTS, tournament._id);

    logger.info('赛事删除成功', {
      tournamentId: tournament._id,
      teamCount: teams.length,
    });
    return res.json({
      code: 200,
      message: '赛事已删除',
      data: { _id: tournament._id, deleted_team_count: teams.length },
    });
  } catch (err) {
    logger.error('删除赛事失败', { error: err.message, tournamentId: req.params.id });
    return res.status(500).json({ code: 500, message: '删除赛事失败', data: null });
  }
});

router.get('/:id/teams', async (req, res) => {
  try {
    const tournament = await store.get(TOURNAMENTS, req.params.id);
    if (!tournament) return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    const teams = await getTeams(tournament._id);
    return res.json({ code: 200, message: 'ok', data: { tournament: tournament.name, total: teams.length, teams } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '获取参赛队伍列表失败', data: null });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tournament = await store.get(TOURNAMENTS, req.params.id);
    if (!tournament) return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    const teams = await getTeams(tournament._id);
    return res.json({ code: 200, message: 'ok', data: { ...tournament, teams, team_count: teams.length } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '获取赛事详情失败', data: null });
  }
});

router.post('/auto-match', authMiddleware, async (req, res) => {
  const styles = req.body.preferred_styles;
  if (!Array.isArray(styles) || !styles.length) return res.status(400).json({ code: 400, message: '请提供 preferred_styles', data: null });
  const type = styles[0];
  return res.json({
    code: 200,
    message: 'ok',
    data: {
      your_style: { type, label: getStyleLabel(type) },
      recommendations: getComplementaryStyles(type).map((style, index) => ({ user_id: `recommended_${index + 1}`, style: style.type, compatibility_score: style.score, reason: style.reason })),
    },
  });
});

function getStyleLabel(type) {
  return { data_driven: '数据驱动型', value_driven: '价值驱动型', logic_focused: '逻辑导向型', balanced: '均衡型' }[type] || '未知风格';
}

function getComplementaryStyles(style) {
  const map = {
    data_driven: [{ type: 'value_driven', score: 85, reason: '数据与价值互补' }, { type: 'logic_focused', score: 70, reason: '数据与逻辑互补' }],
    value_driven: [{ type: 'data_driven', score: 85, reason: '价值与数据互补' }, { type: 'logic_focused', score: 75, reason: '价值与逻辑互补' }],
    logic_focused: [{ type: 'data_driven', score: 70, reason: '逻辑与数据互补' }, { type: 'value_driven', score: 75, reason: '逻辑与价值互补' }],
    balanced: [{ type: 'data_driven', score: 65, reason: '增强实证论证' }, { type: 'value_driven', score: 65, reason: '增强价值论证' }],
  };
  return map[style] || map.balanced;
}

function getDefaultCompatibility(styles) {
  return { compatibility_score: 60, strengths: ['队伍信息已记录'], weaknesses: [], suggestions: [`成员风格：${styles.join('、')}`] };
}

module.exports = router;
