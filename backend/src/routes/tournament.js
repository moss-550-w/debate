const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

// 内存存储
const tournaments = new Map(); // key: tournamentId
const registrations = new Map(); // key: tournamentId -> array of registration

// 自增 ID 计数器
let tournamentIdCounter = 0;
let teamIdCounter = 0;

// 有效的赛事格式
const VALID_FORMATS = ['round_robin', 'points'];

/**
 * POST /api/tournament/create
 * 创建赛事
 */
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { name, format, topic_ids, judge_ids, max_teams, team_size, registration_deadline, rules } = req.body;

    // 校验必填参数
    if (!name) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: name', data: null });
    }
    if (!format || !VALID_FORMATS.includes(format)) {
      return res.status(400).json({
        code: 400,
        message: `无效的 format，可选值: ${VALID_FORMATS.join(', ')}`,
        data: null,
      });
    }
    if (!topic_ids || !Array.isArray(topic_ids) || topic_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: topic_ids', data: null });
    }
    if (!judge_ids || !Array.isArray(judge_ids) || judge_ids.length === 0) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: judge_ids', data: null });
    }
    if (!max_teams || typeof max_teams !== 'number' || max_teams < 2) {
      return res.status(400).json({ code: 400, message: 'max_teams 至少为 2', data: null });
    }
    if (!team_size || typeof team_size !== 'number' || team_size < 1) {
      return res.status(400).json({ code: 400, message: 'team_size 至少为 1', data: null });
    }

    tournamentIdCounter++;
    const tournamentId = `tournament_${tournamentIdCounter}`;

    const tournament = {
      _id: tournamentId,
      name,
      format,
      topic_ids,
      judge_ids,
      max_teams,
      team_size,
      registration_deadline: registration_deadline || null,
      rules: rules || '',
      created_by: req.user.userId || req.user.openid,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    tournaments.set(tournamentId, tournament);
    registrations.set(tournamentId, []);

    logger.info('赛事创建成功', { tournamentId, name });

    res.json({
      code: 200,
      message: 'ok',
      data: tournament,
    });
  } catch (err) {
    logger.error('创建赛事失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '创建赛事失败',
      data: null,
    });
  }
});

/**
 * POST /api/tournament/:id/register
 * 报名参赛
 */
router.post('/:id/register', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { team_name, members, member_styles } = req.body;

    const tournament = tournaments.get(id);
    if (!tournament) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    // 检查报名截止日期
    if (tournament.registration_deadline) {
      const deadline = new Date(tournament.registration_deadline);
      if (deadline < new Date()) {
        return res.status(400).json({ code: 400, message: '报名已截止', data: null });
      }
    }

    // 检查必填参数
    if (!team_name) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: team_name', data: null });
    }
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: members', data: null });
    }
    if (!member_styles || !Array.isArray(member_styles) || member_styles.length === 0) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: member_styles', data: null });
    }

    // 检查人数限制
    const teamList = registrations.get(id) || [];
    if (teamList.length >= tournament.max_teams) {
      return res.status(400).json({ code: 400, message: '参赛队伍已满', data: null });
    }
    if (members.length !== tournament.team_size) {
      return res.status(400).json({ code: 400, message: `队伍成员数量必须为 ${tournament.team_size}`, data: null });
    }
    if (member_styles.length !== members.length) {
      return res.status(400).json({ code: 400, message: 'member_styles 数量必须与 members 一致', data: null });
    }

    // 调用 AI 分析队员互补性
    let compatibilityAnalysis;
    try {
      compatibilityAnalysis = await aiService.analyzeTeamCompatibility(members, member_styles);
      logger.info('AI 队伍互补性分析成功', { team_name, members });
    } catch (err) {
      logger.warn('AI 队伍互补性分析失败，使用预设分析', { error: err.message });
      compatibilityAnalysis = getDefaultCompatibility(member_styles);
    }

    teamIdCounter++;
    const team = {
      _id: `team_${teamIdCounter}`,
      tournament_id: id,
      team_name,
      members,
      member_styles,
      compatibility: compatibilityAnalysis,
      created_by: req.user.userId || req.user.openid,
      created_at: new Date().toISOString(),
    };

    teamList.push(team);

    logger.info('队伍报名成功', { tournamentId: id, team_name });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        team,
        compatibility: compatibilityAnalysis,
      },
    });
  } catch (err) {
    logger.error('报名参赛失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '报名参赛失败',
      data: null,
    });
  }
});

/**
 * GET /api/tournament/:id/teams
 * 查看所有参赛队伍
 */
router.get('/:id/teams', async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = tournaments.get(id);
    if (!tournament) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    const teamList = registrations.get(id) || [];

    logger.info('获取参赛队伍列表成功', { tournamentId: id, total: teamList.length });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        tournament: tournament.name,
        total: teamList.length,
        teams: teamList,
      },
    });
  } catch (err) {
    logger.error('获取参赛队伍列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取参赛队伍列表失败',
      data: null,
    });
  }
});

/**
 * GET /api/tournament/list
 * 获取赛事列表（支持分页）
 */
router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const size = parseInt(req.query.size, 10) || 10;

    const allTournaments = Array.from(tournaments.values());

    // 按创建时间倒序排列
    allTournaments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = allTournaments.length;
    const totalPages = Math.ceil(total / size);
    const startIdx = (page - 1) * size;
    const paginatedTournaments = allTournaments.slice(startIdx, startIdx + size);

    logger.info('获取赛事列表成功', { total, page, size });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        tournaments: paginatedTournaments,
        pagination: {
          page,
          size,
          total,
          totalPages,
        },
      },
    });
  } catch (err) {
    logger.error('获取赛事列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取赛事列表失败',
      data: null,
    });
  }
});

/**
 * GET /api/tournament/:id
 * 获取赛事详情（含队伍列表）
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = tournaments.get(id);
    if (!tournament) {
      return res.status(404).json({ code: 404, message: '赛事不存在', data: null });
    }

    const teamList = registrations.get(id) || [];

    logger.info('获取赛事详情成功', { tournamentId: id });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        ...tournament,
        teams: teamList,
        team_count: teamList.length,
      },
    });
  } catch (err) {
    logger.error('获取赛事详情失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取赛事详情失败',
      data: null,
    });
  }
});

/**
 * POST /api/tournament/auto-match
 * 智能组队推荐
 */
router.post('/auto-match', authMiddleware, async (req, res) => {
  try {
    const { user_id, preferred_styles } = req.body;
    const userId = user_id || req.user.userId || req.user.openid;

    if (!preferred_styles || !Array.isArray(preferred_styles) || preferred_styles.length === 0) {
      return res.status(400).json({ code: 400, message: '请提供 preferred_styles', data: null });
    }

    // 从 portfolio 分析中获取用户风格（简化处理）
    // 实际项目中会从 portfolio 数据中分析，这里基于偏好风格模拟
    const yourStyle = {
      type: preferred_styles[0],
      label: getStyleLabel(preferred_styles[0]),
    };

    // 查找互补风格的推荐
    const complementaryStyles = getComplementaryStyles(preferred_styles[0]);
    const recommendations = complementaryStyles.map((style, index) => ({
      user_id: `recommended_user_${index + 1}`,
      style: style.type,
      compatibility_score: style.score,
      reason: style.reason,
    }));

    logger.info('智能组队推荐成功', { userId, style: yourStyle.type });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        your_style: yourStyle,
        recommendations,
      },
    });
  } catch (err) {
    logger.error('智能组队推荐失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '智能组队推荐失败',
      data: null,
    });
  }
});

/**
 * 获取风格的中文标签
 */
function getStyleLabel(type) {
  const labels = {
    data_driven: '数据驱动型',
    value_driven: '价值驱动型',
    logic_focused: '逻辑导向型',
    balanced: '均衡型',
  };
  return labels[type] || '未知风格';
}

/**
 * 获取互补风格及评分
 */
function getComplementaryStyles(style) {
  const complementaryMap = {
    data_driven: [
      { type: 'value_driven', score: 85, reason: '数据型+价值型是最经典的辩论搭档组合' },
      { type: 'logic_focused', score: 70, reason: '数据型+逻辑型可以构建严密的论证体系' },
    ],
    value_driven: [
      { type: 'data_driven', score: 85, reason: '价值型+数据型，情感与数据双管齐下' },
      { type: 'logic_focused', score: 75, reason: '价值型+逻辑型，论证既有深度又有温度' },
    ],
    logic_focused: [
      { type: 'data_driven', score: 70, reason: '逻辑型+数据型，论证严谨且有理有据' },
      { type: 'value_driven', score: 75, reason: '逻辑型+价值型，理性与感性完美结合' },
    ],
    balanced: [
      { type: 'data_driven', score: 65, reason: '均衡型+数据型，可以增强论证的实证力度' },
      { type: 'value_driven', score: 65, reason: '均衡型+价值型，可以提升论证的价值高度' },
    ],
  };
  return complementaryMap[style] || complementaryMap.balanced;
}

/**
 * 默认互补性分析（AI 不可用时）
 */
function getDefaultCompatibility(styles) {
  const uniqueStyles = [...new Set(styles)];

  let score = 50;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (uniqueStyles.includes('data_driven') && uniqueStyles.includes('value_driven')) {
    score = 85;
    strengths.push('数据与价值双维度覆盖');
    weaknesses.push('可能在中段论证环节有重叠');
    suggestions.push('建议由数据型选手负责首轮立论，价值型选手负责总结陈词');
  } else if (uniqueStyles.includes('data_driven') && uniqueStyles.includes('logic_focused')) {
    score = 75;
    strengths.push('数据与逻辑双重保障');
    weaknesses.push('可能缺乏情感层面的感染力');
    suggestions.push('建议在论证中加入价值层面的升华');
  } else if (uniqueStyles.includes('value_driven') && uniqueStyles.includes('logic_focused')) {
    score = 75;
    strengths.push('价值高度与逻辑严谨兼备');
    weaknesses.push('可能缺乏具体数据支撑');
    suggestions.push('建议在准备阶段收集更多实证数据');
  } else {
    strengths.push('团队成员风格一致，配合默契度高');
    weaknesses.push('风格单一，可能缺乏多维度的论证视角');
    suggestions.push('建议引入不同风格的队员以丰富论证层次');
  }

  return {
    compatibility_score: score,
    strengths,
    weaknesses,
    suggestions,
  };
}

module.exports = router;