const logger = require('../utils/logger');

const SAFE_FALLBACK = '哇，这个问题好难，我们换个角度想想吧！';

/**
 * 内容安全检测服务
 * 调用微信 security.msgSecCheck 接口
 */

/**
 * 获取微信接口调用凭证（使用云开发环境）
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const appid = process.env.APPID;
  const secret = process.env.WX_SECRET;

  // 如果没有配置，走云开发内置鉴权
  if (!appid || !secret) {
    // 云开发环境下使用 cloud.getAccessToken
    try {
      const cloud = require('wx-server-sdk');
      const result = await cloud.getAccessToken({});
      return result.accessToken;
    } catch {
      logger.warn('无法获取微信accessToken，跳过安全检测');
      return null;
    }
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.access_token;
}

/**
 * 检测文本内容是否安全
 * @param {string} text - 待检测文本
 * @returns {Promise<boolean>} true=安全 false=违规
 */
async function checkText(text) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return true; // 无法检测时默认通过
    }

    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });

    const data = await response.json();

    if (data.errcode === 0) {
      return true;
    }

    logger.warn('内容安全检测未通过', { errcode: data.errcode, errmsg: data.errmsg });
    return false;
  } catch (err) {
    logger.error('内容安全检测异常', { error: err.message });
    return true; // 异常时默认通过，避免阻断正常服务
  }
}

/**
 * 安全过滤文本，违规时返回安全替代文案
 * @param {string} text - 原始文本
 * @returns {Promise<string>} 安全文本
 */
async function safeFilter(text) {
  const isSafe = await checkText(text);
  if (!isSafe) {
    logger.info('文本被安全过滤替换', { original: text.slice(0, 50) });
    return SAFE_FALLBACK;
  }
  return text;
}

module.exports = {
  checkText,
  safeFilter,
  SAFE_FALLBACK,
};