const logger = require('../utils/logger');

// 内存计数：{ openid: { date: '2026-08-15', count: 5 } }
const dailyCounts = new Map();

/**
 * 限流中间件 - 小学生每日20次调用限制
 * 通过 openid 识别用户，role 为 pupil 时生效
 */
function rateLimitMiddleware(req, res, next) {
  // 仅对小学生限流
  if (req.user?.role !== 'pupil') {
    return next();
  }

  const openid = req.user.openid;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${openid}_${today}`;

  const current = dailyCounts.get(key) || { date: today, count: 0 };

  // 跨天重置
  if (current.date !== today) {
    current.date = today;
    current.count = 0;
  }

  const MAX_DAILY = 20;
  if (current.count >= MAX_DAILY) {
    logger.warn('限流触发', { openid, count: current.count });
    return res.status(429).json({
      code: 429,
      message: `今日练习次数已达上限（${MAX_DAILY}次），明天再来吧！`,
      data: null,
    });
  }

  current.count++;
  dailyCounts.set(key, current);

  // 响应头返回剩余次数
  res.setHeader('X-RateLimit-Remaining', MAX_DAILY - current.count);
  next();
}

module.exports = rateLimitMiddleware;