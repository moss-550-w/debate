const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const evaluateService = require('../services/evaluateService');
const practiceStore = require('../services/practiceStore');
const logger = require('../utils/logger');

/**
 * POST /api/evaluate
 * 英语语音评测
 * 调用链：百度英文语音识别 → 参考文本逐词比对评分
 */
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { audio_base64, audio_base64s, ref_text, format, duration_sec } = req.body;
    const audioChunks = Array.isArray(audio_base64s) ? audio_base64s : [];

    if ((!audio_base64 && audioChunks.length === 0) || !ref_text) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: audio_base64 或 audio_base64s，以及 ref_text',
        data: null,
      });
    }

    const audioSize = audio_base64 ? Buffer.byteLength(audio_base64, 'base64') : 0;
    const chunkTooLarge = audioChunks.some(chunk => Buffer.byteLength(chunk, 'base64') > 1 * 1024 * 1024);
    if ((audio_base64 && audioSize > 1 * 1024 * 1024) || chunkTooLarge) {
      return res.status(400).json({ code: 400, message: '音频文件过大，请分段录制', data: null });
    }

    try {
      const score = audioChunks.length > 0
        ? await evaluateService.evaluateChunks(audioChunks, ref_text, format, duration_sec)
        : await evaluateService.evaluate(audio_base64, ref_text, format, duration_sec);
      const totalAudioSize = audioSize + audioChunks.reduce((total, chunk) => total + Buffer.byteLength(chunk, 'base64'), 0);
      const duration = Math.max(1, Number(duration_sec) || Math.round(totalAudioSize / 32000));
      try {
        await practiceStore.record({
          user_id: req.user.userId || req.user.openid,
          type: 'speech',
          duration_sec: duration,
          pronunciation: score.pronunciation,
          fluency: score.fluency,
          integrity: score.integrity,
          overall: score.overall,
        });
      } catch (recordError) {
        logger.warn('练习记录写入失败', { error: recordError.message });
      }
      logger.info('语音评测成功', { audioSize: totalAudioSize, chunks: audioChunks.length || 1, overall: score.overall });
      return res.json({
        code: 200,
        message: 'ok',
        data: score,
      });
    } catch (err) {
      const statusCode = err.statusCode || 503;
      logger.warn('语音评测失败', { error: err.message, statusCode });
      return res.status(statusCode).json({
        code: statusCode,
        message: err.message || '语音评测服务暂时不可用',
        data: null,
      });
    }
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
