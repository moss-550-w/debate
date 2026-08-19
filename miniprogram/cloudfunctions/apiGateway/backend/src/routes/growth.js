const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const practiceStore = require('../services/practiceStore');
const logger = require('../utils/logger');

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
  return Math.round(records.reduce((sum, record) => sum + scoreOf(record)[key], 0) / records.length);
}

function buildGrowthData(records) {
  const latestRecord = records[0];
  const baselineRecord = records[records.length - 1];
  const activeDays = new Set(records.map(record => String(record.created_at || '').slice(0, 10)).filter(Boolean));
  const totalDuration = records.reduce((sum, record) => sum + (Number(record.duration_sec) || 0), 0);

  return {
    baseline: baselineRecord ? scoreOf(baselineRecord) : scoreOf({}),
    latest: latestRecord ? scoreOf(latestRecord) : scoreOf({}),
    history: records.slice(0, 10).map(record => ({
      _id: record._id,
      type: record.type || 'speech',
      score: scoreOf(record),
      created_at: record.created_at,
    })),
    stats: {
      totalCount: records.length,
      totalDuration,
      avgScore: average(records, 'overall'),
      daysActive: activeDays.size,
    },
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

    const userIds = [...new Set([req.user.userId, req.user.openid].filter(Boolean))];
    const recordGroups = await Promise.all(userIds.map(id => practiceStore.listByUser(id)));
    const records = recordGroups
      .flat()
      .filter((record, index, all) => all.findIndex(item => item._id === record._id) === index)
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));

    logger.info('Growth data retrieved', { userId, records: records.length });
    return res.json({ code: 200, message: 'ok', data: buildGrowthData(records) });
  } catch (err) {
    logger.error('Growth data retrieval failed', { error: err.message });
    return res.status(500).json({ code: 500, message: 'Failed to load growth data', data: null });
  }
});

module.exports = router;
