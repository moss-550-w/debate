const logger = require('../utils/logger');

/**
 * 语音评测服务
 * 调用百度智能云语音评测API
 * 支持Base64音频直传，评测后立即销毁临时文件
 */

/**
 * 获取百度API访问令牌
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('百度API Key未配置');
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;

  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`获取百度token失败: ${JSON.stringify(data)}`);
  }

  return data.access_token;
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
    throw new Error(`百度评测API错误: ${data.err_msg}`);
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