const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const { transcribeEnglish, SpeechEvaluationError } = require('../services/evaluateService');
const logger = require('../utils/logger');

router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { audio, format = 'wav' } = req.body;

    if (!audio) {
      return res.status(400).json({ code: 400, message: '缺少音频数据', data: null });
    }

    const audioSize = Buffer.byteLength(audio, 'base64');
    if (audioSize > 1 * 1024 * 1024) {
      return res.status(400).json({ code: 400, message: '音频文件过大，请控制在 1MB 以内', data: null });
    }

    const text = await transcribeEnglish(audio, format);
    logger.info('对练语音识别成功', { audioSize, text: text.slice(0, 50) });
    return res.json({ code: 200, data: { text } });
  } catch (err) {
    const statusCode = err instanceof SpeechEvaluationError ? err.statusCode : 500;
    logger.warn('对练语音识别失败', { error: err.message, statusCode });
    return res.status(statusCode).json({
      code: statusCode,
      message: err.message || '语音识别失败',
      data: null,
    });
  }
});

module.exports = router;
