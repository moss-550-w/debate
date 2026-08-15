const logger = require('../utils/logger');

/**
 * Token 校验中间件
 * 从 Authorization header 提取 openid，挂载到 req.user
 */
function authMiddleware(req, res, next) {
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
  req.user = { openid: token };
  logger.info('请求鉴权通过', { openid: token });
  next();
}

module.exports = authMiddleware;