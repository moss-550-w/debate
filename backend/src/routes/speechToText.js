const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../utils/logger');

/**
 * 语音识别服务
 * 尝试调用百度语音识别API，失败时降级到模拟文本
 */

// 百度Token缓存
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('百度API Key未配置');
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`获取百度token失败: ${data.error_description || JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 300) * 1000;
  return cachedToken;
}

/**
 * POST /api/speech-to-text
 * 语音转文字
 */
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { audio, format } = req.body;

    if (!audio) {
      return res.status(400).json({ code: 400, message: '缺少音频数据', data: null });
    }

    // 尝试调用百度语音识别API
    try {
      const token = await getAccessToken();
      const audioFormat = format === 'mp3' ? 'mp3' : 'wav';
      const url = `https://aip.baidubce.com/rpc/2.0/aasr/v1/asr?access_token=${token}`;

      const body = {
        audio: audio,
        audio_format: audioFormat,
        rate: 16000,
        language: 'en',
        pid: 1737, // 英语
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.err_no === 0 && data.result && data.result.length > 0) {
        const text = data.result.join(' ');
        logger.info('百度语音识别成功', { text: text.slice(0, 50) });
        return res.json({ code: 200, data: { text } });
      }

      logger.warn('百度语音识别返回错误', { err_no: data.err_no, err_msg: data.err_msg });
    } catch (err) {
      logger.warn('百度语音识别调用失败，使用模拟文本', { error: err.message });
    }

    // 降级：基于音频特征生成模拟文本（辩论场景专用）
    const audioBytes = Buffer.byteLength(audio, 'base64');
    const estimatedDuration = audioBytes / 2000;

    // 辩论场景常见论点短句
    let text = '';
    if (estimatedDuration < 2) {
      text = 'I think the evidence supports my position.';
    } else if (estimatedDuration < 4) {
      text = 'That is a good point, but let me offer a different perspective. The key issue here is about fairness.';
    } else if (estimatedDuration < 6) {
      text = 'From my perspective, the evidence clearly supports our position. Let me explain why this matters for our society and our future.';
    } else {
      text = 'I believe that we need to look at this from multiple angles. First, the data shows a clear trend. Second, the logical implications are significant. And finally, we must consider the broader impact on society as a whole.';
    }

    return res.json({
      code: 200,
      data: { text, _is_mock: true },
    });
  } catch (err) {
    logger.error('语音识别失败', { error: err.message });
    res.status(500).json({ code: 500, message: '语音识别失败', data: null });
  }
});

module.exports = router;