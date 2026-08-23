const logger = require('../utils/logger');
const { normalizeRole } = require('./rbac');

// 内存计数：{ openid: { date: '2026-08-15', count: 5 } }
const dailyCounts = new Map();
const MAX_DAILY = 20;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时清理一次过期 key

/**
 * 定期清理过期 key，防止内存泄漏
 * 每天凌晨自动清理前一天的计数
 */
function cleanupExpiredKeys() {
  const today = new Date().toISOString().slice(0, 10);
  for (const [key, value] of dailyCounts.entries()) {
    if (value.date !== today) {
      dailyCounts.delete(key);
    }
  }
  logger.info('限流计数清理完成', { remainingKeys: dailyCounts.size });
}

// 启动定时清理（生产环境建议使用 Redis 替代内存计数）
setInterval(cleanupExpiredKeys, CLEANUP_INTERVAL);
// 进程退出时清理定时器
process.on('SIGINT', () => { process.exit(); });

/**
 * 限流中间件 - 小学生每日20次调用限制
 * 通过 openid 识别用户，student 角色生效
 *
 * 注意：内存计数在 PM2 多进程模式下不共享，
 * 生产环境多进程部署时应改用 Redis 或云数据库计数器。
 */
function rateLimitMiddleware(req, res, next) {
  // 仅对小学生限流；若 req.user 不存在则跳过（防御性编程）
  if (!req.user || normalizeRole(req.user.role) !== 'student') {
    return next();
  }

  const openid = req.user.openid;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${openid}_${today}`;

  let current = dailyCounts.get(key);
  if (!current || current.date !== today) {
    current = { date: today, count: 0 };
    dailyCounts.set(key, current);
  }

  if (current.count >= MAX_DAILY) {
    logger.warn('限流触发', { openid, count: current.count });
    return res.status(429).json({
      code: 429,
      message: `今日练习次数已达上限（${MAX_DAILY}次），明天再来吧！`,
      data: null,
    });
  }

  current.count++;

  // 响应头返回剩余次数
  res.setHeader('X-RateLimit-Remaining', MAX_DAILY - current.count);
  next();
}

module.exports = rateLimitMiddleware;
