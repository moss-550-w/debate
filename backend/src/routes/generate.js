const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// 生成立论框架（Sprint 2 实现完整逻辑）
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { topic_id, position, user_role } = req.body;

    if (!topic_id || !position) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, position',
        data: null,
      });
    }

    if (!['pro', 'con'].includes(position)) {
      return res.status(400).json({
        code: 400,
        message: 'position 必须为 pro 或 con',
        data: null,
      });
    }

    // TODO: Sprint 2 接入大模型API
    // 当前返回占位数据
    const mockData = {
      points: [
        { title: '论点一', sentence: 'This is a sample argument.', translation: '这是一个示例论点。' },
        { title: '论点二', sentence: 'This is another argument.', translation: '这是另一个论点。' },
      ],
      conclusion: 'In conclusion, this is a sample conclusion.',
      full_text: 'This is a sample full text for the argument.',
    };

    logger.info('立论生成成功', { topic_id, position, user_role });

    res.json({
      code: 200,
      message: 'ok',
      data: mockData,
    });
  } catch (err) {
    logger.error('立论生成失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '立论生成失败',
      data: null,
    });
  }
});

module.exports = router;