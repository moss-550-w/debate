const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// 语音评测（Sprint 2 接入百度API）
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { audio_base64, ref_text } = req.body;

    if (!audio_base64 || !ref_text) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: audio_base64, ref_text',
        data: null,
      });
    }

    // 校验音频大小（<1MB）
    const audioSize = Buffer.byteLength(audio_base64, 'base64');
    if (audioSize > 1 * 1024 * 1024) {
      return res.status(400).json({
        code: 400,
        message: '音频文件过大，请控制在1MB以内',
        data: null,
      });
    }

    // TODO: Sprint 2 接入百度语音评测API
    // 当前返回占位数据
    const mockScore = {
      pronunciation: Math.floor(Math.random() * 30) + 70,
      fluency: Math.floor(Math.random() * 30) + 70,
      integrity: Math.floor(Math.random() * 20) + 80,
      overall: 0,
    };
    mockScore.overall = Math.round(
      (mockScore.pronunciation + mockScore.fluency + mockScore.integrity) / 3
    );

    logger.info('语音评测成功', { audioSize, overall: mockScore.overall });

    res.json({
      code: 200,
      message: 'ok',
      data: mockScore,
    });
  } catch (err) {
    logger.error('语音评测失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '语音评测失败',
      data: null,
    });
  }
});

module.exports = router;