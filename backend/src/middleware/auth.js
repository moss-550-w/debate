const logger = require('../utils/logger');
const db = require('../utils/db');

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

  // MVP 阶段：直接将 openid 作为 Token 使用
  // 生产环境应使用 JWT 或云开发自定义登录
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
    } else {
      // 用户不存在，但 MVP 阶段仍允许通过（游客模式），仅注入 openid
      req.user = { openid, role: 'pupil' };
      logger.warn('未找到用户记录，使用默认角色', { openid });
    }
  } catch (err) {
    logger.error('查询用户信息失败，使用默认角色', { openid, error: err.message });
    req.user = { openid, role: 'pupil' };
  }

  logger.info('请求鉴权通过', { openid, role: req.user.role });
  next();
}

module.exports = authMiddleware;