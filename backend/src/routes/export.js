const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authStore = require('../services/authStore');
const practiceStore = require('../services/practiceStore');
const portfolioStore = require('../services/portfolioStore');
const debateStore = require('../services/debateStore');
const { normalizeRole, requireManagement } = require('../middleware/rbac');

const DEBATE_DIMENSIONS = [
  { key: 'argument_structure', label: '论点结构', weight: 0.25 },
  { key: 'evidence_quality', label: '论据质量', weight: 0.2 },
  { key: 'logic', label: '逻辑推理', weight: 0.25 },
  { key: 'rebuttal', label: '反驳回应', weight: 0.2 },
  { key: 'expression', label: '表达组织', weight: 0.1 },
];

function requireAdmin(req, res, next) {
  return requireManagement(req, res, next);
}

function clampScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

function average(records, key) {
  const values = records
    .map(record => record[key])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

const typeBias = {
  case: { argument_structure: 1, evidence_quality: 0.9, logic: 0.95, rebuttal: 0.65, expression: 0.9 },
  argument: { argument_structure: 0.95, evidence_quality: 0.85, logic: 0.95, rebuttal: 0.7, expression: 0.9 },
  mechanism: { argument_structure: 0.85, evidence_quality: 0.85, logic: 1, rebuttal: 0.7, expression: 0.85 },
  clash: { argument_structure: 0.8, evidence_quality: 0.85, logic: 0.95, rebuttal: 1, expression: 0.85 },
  question: { argument_structure: 0.7, evidence_quality: 0.7, logic: 0.85, rebuttal: 0.6, expression: 0.8 },
};

function portfolioDimensions(record) {
  const feedback = record.ai_feedback || {};
  const score = clampScore(feedback.judge_score);
  const source = feedback.dimensions || feedback.scores || {};
  const bias = typeBias[record.content_type] || typeBias.argument;
  const result = {};
  DEBATE_DIMENSIONS.forEach(({ key }) => {
    const value = clampScore(source[key]);
    result[key] = value === null && score !== null ? Math.round(score * bias[key]) : value;
  });
  return result;
}

function weightedOverall(dimensions) {
  const valid = DEBATE_DIMENSIONS.filter(({ key }) => dimensions[key] !== null && dimensions[key] !== undefined);
  if (!valid.length) return 0;
  const weight = valid.reduce((sum, item) => sum + item.weight, 0);
  return Math.round(valid.reduce((sum, item) => sum + dimensions[item.key] * item.weight, 0) / weight);
}

function buildStudent(user, speechRecords, portfolios, turns) {
  const speech = speechRecords.filter(record => record.user_id === user._id || record.user_id === user.openid);
  const userPortfolios = portfolios.filter(record => record.user_id === user._id || record.user_id === user.openid);
  const userTurns = turns.filter(record => record.user_id === user._id || record.user_id === user.openid);
  const activities = userPortfolios.map(record => ({
    dimensions: portfolioDimensions(record),
    score: clampScore(record.ai_feedback?.judge_score),
  })).concat(userTurns.map(record => ({
    dimensions: { argument_structure: null, evidence_quality: null, logic: null, rebuttal: clampScore(record.rebuttal_score), expression: null },
    score: clampScore(record.rebuttal_score),
  })));

  const dimensions = {};
  DEBATE_DIMENSIONS.forEach(({ key }) => {
    const values = activities
      .map(activity => activity.dimensions[key])
      .filter(value => value !== null && value !== undefined);
    dimensions[key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  });
  const sessionCount = new Set(userTurns.map(record => record.session_id).filter(Boolean)).size;
  const durationSec = speech.reduce((sum, record) => sum + (Number(record.duration_sec) || 0), 0);
  const overall = weightedOverall(dimensions);
  const latestRecord = [...speech, ...userPortfolios, ...userTurns].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

  return {
    _id: user._id,
    name: user.nickname || '小辩手',
    grade: user.grade || '-',
    role: user.role,
    practice_count: speech.length + userPortfolios.length + sessionCount,
    portfolio_count: userPortfolios.length,
    sparring_sessions: sessionCount,
    sparring_rounds: userTurns.length,
    effective_rebuttal_rate: userTurns.length ? Math.round((userTurns.filter(record => record.is_rebuttal_effective).length / userTurns.length) * 100) : 0,
    avg_argument_structure: dimensions.argument_structure,
    avg_evidence_quality: dimensions.evidence_quality,
    avg_logic: dimensions.logic,
    avg_rebuttal: dimensions.rebuttal,
    avg_expression: dimensions.expression,
    avg_debate_score: overall,
    avg_pronunciation: average(speech, 'pronunciation'),
    avg_fluency: average(speech, 'fluency'),
    avg_integrity: average(speech, 'integrity'),
    avg_overall: average(speech, 'overall'),
    total_duration_min: Math.round(durationSec / 60),
    last_practice: latestRecord ? latestRecord.created_at : '',
    registered_at: user.created_at || '',
  };
}

async function buildClassData(actor) {
  const [users, speechRecords, portfolios, turns] = await Promise.all([
    authStore.listUsers(),
    practiceStore.list(),
    portfolioStore.list(),
    debateStore.list(),
  ]);
  const actorRole = normalizeRole(actor.role);
  const actorId = actor.userId || actor.openid;
  const pupils = users.filter(user => {
    if (normalizeRole(user.role) !== 'student') return false;
    if (actorRole === 'developer') return true;
    return user.teacher_id === actorId || user.teacherId === actorId;
  });
  const students = pupils.map(user => buildStudent(user, speechRecords, portfolios, turns));
  const classStats = {
    total_students: students.length,
    total_practices: students.reduce((sum, student) => sum + student.practice_count, 0),
    total_duration_min: students.reduce((sum, student) => sum + student.total_duration_min, 0),
    avg_argument_structure: average(students, 'avg_argument_structure'),
    avg_evidence_quality: average(students, 'avg_evidence_quality'),
    avg_logic: average(students, 'avg_logic'),
    avg_rebuttal: average(students, 'avg_rebuttal'),
    avg_expression: average(students, 'avg_expression'),
    avg_debate_score: average(students, 'avg_debate_score'),
    avg_pronunciation: average(students, 'avg_pronunciation'),
    avg_fluency: average(students, 'avg_fluency'),
    avg_integrity: average(students, 'avg_integrity'),
    avg_overall: average(students, 'avg_overall'),
    dimensions: DEBATE_DIMENSIONS,
    speech_dimensions: [
      { key: 'pronunciation', label: '发音' },
      { key: 'fluency', label: '流利度' },
      { key: 'integrity', label: '完整度' },
    ],
  };
  return { students, classStats };
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

router.get('/grades', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { students } = await buildClassData(req.user);
    const headers = ['昵称', '年级', '练习次数', '作品集', '对练场次', '有效反驳率', '论点结构', '论据质量', '逻辑推理', '反驳回应', '表达组织', '辩论总分', '发音', '流利度', '完整度', '累计时长(分钟)', '最近练习日期'];
    const rows = students.map(student => [
      student.name, student.grade, student.practice_count, student.portfolio_count, student.sparring_sessions,
      `${student.effective_rebuttal_rate}%`, student.avg_argument_structure, student.avg_evidence_quality,
      student.avg_logic, student.avg_rebuttal, student.avg_expression, student.avg_debate_score,
      student.avg_pronunciation, student.avg_fluency, student.avg_integrity, student.total_duration_min, student.last_practice,
    ].map(csvValue).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`学生能力_${new Date().toISOString().slice(0, 10)}`)}.csv"`);
    return res.send(`\uFEFF${[headers.join(','), ...rows].join('\n')}`);
  } catch (err) {
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

router.get('/grades-json', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { students, classStats } = await buildClassData(req.user);
    return res.json({ code: 200, message: 'ok', data: { students, class_stats: classStats } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '获取数据失败', data: null });
  }
});

module.exports = router;
