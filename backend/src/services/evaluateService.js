const logger = require('../utils/logger');

/**
 * 语音评测服务
 * 调用百度智能云语音评测API
 * 支持Base64音频直传，评测后立即销毁临时文件
 * Token 缓存（有效期约30天），减少重复请求
 */

// Token 缓存（进程级）
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 获取百度API访问令牌（带缓存）
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('百度API Key未配置，请在 .env 中设置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY');
  }

  // 缓存未过期（有效期减5分钟，留安全余量）
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    logger.debug('使用缓存的百度token');
    return cachedToken;
  }

  logger.info('正在获取新的百度token');
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`获取百度token失败: ${data.error_description || JSON.stringify(data)}`);
  }

  // 缓存token（有效期减去5分钟，避免边界过期）
  cachedToken = data.access_token;
  const expiresIn = (data.expires_in || 2592000) - 300; // 默认30天，减5分钟
  tokenExpiresAt = now + expiresIn * 1000;

  logger.info('百度token获取成功', { expiresIn: Math.round(expiresIn / 3600) + 'h' });
  return cachedToken;
}

/**
 * 调用百度语音评测API
 * @param {string} audioBase64 - Base64编码的音频数据
 * @param {string} refText - 参考文本
 * @returns {Promise<object>} 评测结果
 */
async function evaluate(audioBase64, refText) {
  const token = await getAccessToken();
  const url = `https://aip.baidubce.com/rpc/2.0/aasr/v1/evaluate?access_token=${token}`;

  const body = {
    audio: audioBase64,
    audio_format: 'mp3',
    rate: 16000,
    ref_text: refText,
    // 小学生的语音评测使用较低严格度
    strict: 0,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.err_no !== 0) {
    throw new Error(`百度评测API错误(${data.err_no}): ${data.err_msg}`);
  }

  // 映射百度返回字段到统一格式
  return {
    pronunciation: Math.round(data.pronunciation_score || 0),
    fluency: Math.round(data.fluency_score || 0),
    integrity: Math.round(data.integrity_score || 0),
    overall: Math.round(data.total_score || 0),
    word_scores: (data.words || []).map(w => ({
      word: w.word,
      score: Math.round(w.score),
    })),
  };
}

module.exports = {
  evaluate,
};