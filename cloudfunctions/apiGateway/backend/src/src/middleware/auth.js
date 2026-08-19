const logger = require('../utils/logger');
const db = require('../utils/db');
const authStore = require('../services/authStore');

/**
 * Token 校验中间件
 * 从 Authorization header 提取 openid，从数据库查询用户信息并注入到 req.user
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      message: '未授权，缺少有效 Token',
      data: null,
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '未授权，Token 为空',
      data: null,
    });
  }

  const session = await authStore.getToken(token);
  if (session && session.expires_at > Date.now()) {
    const user = await authStore.findUserById(session.user_id);
    if (user) {
      req.user = {
        openid: user.openid || user._id,
        role: user.role,
        userId: user._id,
        nickname: user.nickname,
      };
      return next();
    }
  }

  const openid = token;

  // 从数据库查询用户信息，获取 role 等字段
  // 这是限流和权限判断的前置条件
  try {
    const users = await db.query('users', { openid }, { limit: 1 });
    if (users.length > 0) {
      const user = users[0];
      req.user = {
        openid: user.openid,
        role: user.role,
        userId: user._id,
        nickname: user.nickname,
      };
    } else if (openid.startsWith('mp_user_')) {
      const userId = await authStore.createUser({
        openid,
        role: 'pupil',
        nickname: '小辩手',
        grade: 'G5',
        source: 'miniprogram',
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      });
      req.user = { openid, role: 'pupil', userId, nickname: '小辩手' };
      logger.info('小程序用户已登记', { openid, userId });
    } else {
      return res.status(401).json({ code: 401, message: '未授权，Token 无效', data: null });
    }
  } catch (err) {
    logger.error('查询用户信息失败，使用默认角色', { openid, error: err.message });
    req.user = { openid, role: 'pupil' };
  }

  logger.info('请求鉴权通过', { openid, role: req.user.role });
  next();
}

module.exports = authMiddleware;
