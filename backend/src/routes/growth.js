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

    // 安全校验：只能查看自己的成长数据
    // 管理端可通过 userId 参数查看指定用户，但需额外权限校验
    if (req.user.userId && req.user.userId !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权访问其他用户的成长数据',
        data: null,
      });
    }

    // 生成 20 条 mock 历史记录，最近 20 天每天一条
    const history = [];
    for (let i = 0; i < 20; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (19 - i));
      const type = i % 2 === 0 ? 'argument' : 'speech';
      history.push({
        _id: String(i + 1),
        type,
        score: {
          pronunciation: Math.floor(Math.random() * 36) + 60,
          fluency: Math.floor(Math.random() * 36) + 60,
          logic: Math.floor(Math.random() * 36) + 60,
          vocabulary: Math.floor(Math.random() * 36) + 60,
          reaction: Math.floor(Math.random() * 36) + 60,
        },
        created_at: date.toISOString(),
      });
    }

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
      history,
      stats: {
        totalCount: 20,
        totalDuration: 1800,
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