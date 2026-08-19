const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const practiceStore = require('../services/practiceStore');
const portfolioStore = require('../services/portfolioStore');
const debateStore = require('../services/debateStore');
const logger = require('../utils/logger');

const DEBATE_DIMENSIONS = [
  { key: 'argument_structure', label: '论点结构', weight: 0.25 },
  { key: 'evidence_quality', label: '论据质量', weight: 0.2 },
  { key: 'logic', label: '逻辑推理', weight: 0.25 },
  { key: 'rebuttal', label: '反驳回应', weight: 0.2 },
  { key: 'expression', label: '表达组织', weight: 0.1 },
];

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreOf(record) {
  return {
    pronunciation: Number(record.pronunciation) || 0,
    fluency: Number(record.fluency) || 0,
    integrity: Number(record.integrity) || 0,
    overall: Number(record.overall) || 0,
  };
}

function average(records, key) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + (scoreOf(record)[key] || 0), 0) / records.length);
}

function buildSpeechData(records) {
  const ordered = [...records].sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  const latestRecord = ordered[0];
  const baselineRecord = ordered[ordered.length - 1];
  const activeDays = new Set(ordered.map(record => String(record.created_at || '').slice(0, 10)).filter(Boolean));
  const totalDuration = ordered.reduce((sum, record) => sum + (Number(record.duration_sec) || 0), 0);

  return {
    baseline: baselineRecord ? scoreOf(baselineRecord) : scoreOf({}),
    latest: latestRecord ? scoreOf(latestRecord) : scoreOf({}),
    history: ordered.slice(0, 10).map(record => ({
      _id: record._id,
      type: record.type || 'speech',
      score: scoreOf(record),
      created_at: record.created_at,
    })),
    stats: {
      totalCount: ordered.length,
      totalDuration,
      avgScore: average(ordered, 'overall'),
      daysActive: activeDays.size,
    },
  };
}

const typeDimensionBias = {
  case: { argument_structure: 1, evidence_quality: 0.9, logic: 0.95, rebuttal: 0.65, expression: 0.9 },
  argument: { argument_structure: 0.95, evidence_quality: 0.85, logic: 0.95, rebuttal: 0.7, expression: 0.9 },
  mechanism: { argument_structure: 0.85, evidence_quality: 0.85, logic: 1, rebuttal: 0.7, expression: 0.85 },
  clash: { argument_structure: 0.8, evidence_quality: 0.85, logic: 0.95, rebuttal: 1, expression: 0.85 },
  question: { argument_structure: 0.7, evidence_quality: 0.7, logic: 0.85, rebuttal: 0.6, expression: 0.8 },
};

function portfolioDimensions(record) {
  const feedback = record.ai_feedback || {};
  const source = feedback.dimensions || feedback.scores || {};
  const score = clampScore(feedback.judge_score);
  const bias = typeDimensionBias[record.content_type] || typeDimensionBias.argument;
  const dimensions = {};

  DEBATE_DIMENSIONS.forEach(({ key }) => {
    const value = clampScore(source[key]);
    dimensions[key] = value === null && score !== null ? Math.round(score * bias[key]) : value;
  });

  return { dimensions, overall: score };
}

function debateActivities(portfolios, turns) {
  const portfolioActivities = portfolios.map(record => {
    const result = portfolioDimensions(record);
    return {
      _id: record._id,
      type: 'portfolio',
      title: record.title || record.topic_title || '作品集记录',
      created_at: record.created_at,
      dimensions: result.dimensions,
      overall: result.overall,
    };
  });

  const turnActivities = turns.map(record => ({
    _id: record._id,
    type: 'debate',
    title: record.topic_title || 'AI 对练',
    created_at: record.created_at,
    dimensions: { rebuttal: clampScore(record.rebuttal_score) },
    overall: clampScore(record.rebuttal_score),
    is_rebuttal_effective: !!record.is_rebuttal_effective,
    session_id: record.session_id,
  }));

  return [...portfolioActivities, ...turnActivities]
    .filter(activity => activity.created_at)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
}

function averageDimension(activities, key) {
  const values = activities
    .map(activity => activity.dimensions[key])
    .filter(value => value !== null && value !== undefined);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function overallScore(dimensions, activities) {
  const weighted = DEBATE_DIMENSIONS.reduce((sum, item) => {
    return sum + (dimensions[item.key] ? dimensions[item.key] * item.weight : 0);
  }, 0);
  const weight = DEBATE_DIMENSIONS.reduce((sum, item) => sum + (dimensions[item.key] ? item.weight : 0), 0);
  if (weight > 0) return Math.round(weighted / weight);

  const scores = activities.map(activity => activity.overall).filter(value => value !== null && value !== undefined);
  return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
}

function buildDebateData(portfolios, turns) {
  const activities = debateActivities(portfolios, turns);
  const dimensions = {};
  DEBATE_DIMENSIONS.forEach(({ key }) => {
    dimensions[key] = averageDimension(activities, key);
  });

  const latest = activities[activities.length - 1];
  const baseline = activities[0];
  const sessions = new Set(turns.map(record => record.session_id).filter(Boolean));
  const activeDays = new Set(activities.map(activity => String(activity.created_at).slice(0, 10)).filter(Boolean));
  const effectiveTurns = turns.filter(record => typeof record.is_rebuttal_effective === 'boolean');
  const effectiveRebuttals = effectiveTurns.filter(record => record.is_rebuttal_effective).length;
  const recommendations = [...DEBATE_DIMENSIONS]
    .sort((left, right) => (dimensions[left.key] || 0) - (dimensions[right.key] || 0))
    .slice(0, 2)
    .map(item => ({
      dimension: item.key,
      title: `加强${item.label}`,
      description: `建议继续完成${item.label}相关练习，积累可评测的辩论记录。`,
    }));

  return {
    hasData: activities.length > 0,
    overall: overallScore(dimensions, activities),
    dimensions,
    dimensionLabels: DEBATE_DIMENSIONS.map(({ key, label }) => ({ key, label })),
    baseline: baseline ? baseline.dimensions : {},
    latest: latest ? latest.dimensions : {},
    stats: {
      practiceCount: portfolios.length + sessions.size,
      portfolioCount: portfolios.length,
      sparringSessions: sessions.size,
      sparringRounds: turns.length,
      effectiveRebuttalRate: effectiveTurns.length ? Math.round((effectiveRebuttals / effectiveTurns.length) * 100) : 0,
      avgScore: overallScore(dimensions, activities),
      daysActive: activeDays.size,
    },
    recommendations,
    history: activities.slice(-10).reverse().map(activity => ({
      _id: activity._id,
      type: activity.type,
      title: activity.title,
      score: activity.overall || 0,
      created_at: activity.created_at,
    })),
  };
}

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const isSelf = req.user.openid === userId || req.user.userId === userId;
    const isAdmin = req.user.role === 'coach' || req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ code: 403, message: 'Forbidden', data: null });
    }

    const userIds = [...new Set([userId, req.user.userId, req.user.openid].filter(Boolean))];
    const [speechGroups, portfolioGroups, debateGroups] = await Promise.all([
      Promise.all(userIds.map(id => practiceStore.listByUser(id))),
      Promise.all(userIds.map(id => portfolioStore.listByUser(id))),
      Promise.all(userIds.map(id => debateStore.listByUser(id))),
    ]);
    const mergeUnique = groups => groups.flat().filter((record, index, all) => all.findIndex(item => item._id === record._id) === index);
    const speech = buildSpeechData(mergeUnique(speechGroups));
    const portfolios = mergeUnique(portfolioGroups);
    const debate = buildDebateData(portfolios, mergeUnique(debateGroups));

    logger.info('Growth data retrieved', { userId, speechRecords: speech.history.length, debateActivities: debate.history.length });
    return res.json({
      code: 200,
      message: 'ok',
      data: {
        baseline: speech.baseline,
        latest: speech.latest,
        history: speech.history,
        stats: speech.stats,
        speech,
        debate,
      },
    });
  } catch (err) {
    logger.error('Growth data retrieval failed', { error: err.message });
    return res.status(500).json({ code: 500, message: 'Failed to load growth data', data: null });
  }
});

module.exports = router;
