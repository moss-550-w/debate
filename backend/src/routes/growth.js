const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

// 获取成长数据（Sprint 3 完善聚合逻辑）
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: '缺少用户ID',
        data: null,
      });
    }

    // TODO: Sprint 3 从云数据库聚合 practice_records 和 assessments
    // 当前返回占位数据
    const mockData = {
      baseline: {
        pronunciation: 60,
        fluency: 55,
        logic: 50,
        vocabulary: 65,
        reaction: 45,
      },
      latest: {
        pronunciation: 78,
        fluency: 72,
        logic: 68,
        vocabulary: 80,
        reaction: 70,
      },
      history: [
        {
          _id: '1',
          type: 'argument',
          score: { pronunciation: 75, fluency: 70, logic: 65, vocabulary: 78, reaction: 60 },
          created_at: new Date().toISOString(),
        },
        {
          _id: '2',
          type: 'speech',
          score: { pronunciation: 80, fluency: 75, integrity: 85 },
          created_at: new Date().toISOString(),
        },
      ],
      stats: {
        totalCount: 15,
        totalDuration: 600,
      },
    };

    logger.info('成长数据获取成功', { userId });

    res.json({
      code: 200,
      message: 'ok',
      data: mockData,
    });
  } catch (err) {
    logger.error('成长数据获取失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取成长数据失败',
      data: null,
    });
  }
});

module.exports = router;