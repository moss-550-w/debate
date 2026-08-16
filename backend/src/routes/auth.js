/**
 * 认证路由：手机号 + 验证码 登录（首次登录自动注册）
 *
 * 真实有效性保障：
 * - 验证码由服务端 crypto 随机生成，仅存哈希，5 分钟有效、一次性使用
 * - 60 秒重发间隔、每日每号发送上限、验证尝试次数上限
 * - 登录成功由服务端签发随机 Token（7 天有效），启动时可通过 /verify 校验
 *
 * 验证码送达渠道：当前未接入短信。默认（AUTH_DEV_CODE != 0）验证码
 * 通过接口 data.dev_code 返回并打印到后端日志；接入短信后设置
 * AUTH_DEV_CODE=0 关闭回显即可，校验逻辑无需改动。
 *
 * 存储：services/authStore.js 适配层
 * - 云托管环境 → 云开发数据库（users / auth_codes / auth_tokens）
 * - 本地开发   → auth-store.json 自动回退
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const authStore = require('../services/authStore');
const authMiddleware = require('../middleware/auth');

// ===== 常量 =====
const CODE_TTL_MS = 5 * 60 * 1000;            // 验证码有效期 5 分钟
const CODE_RESEND_MS = 60 * 1000;             // 重发间隔 60 秒
const CODE_MAX_ATTEMPTS = 5;                  // 单个验证码最多尝试 5 次
const DAILY_SEND_LIMIT = 10;                  // 单手机号每日发送上限
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Token 有效期 7 天
const DEV_CODE_RETURN = process.env.AUTH_DEV_CODE !== '0';

// ===== 工具函数 =====
function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function publicUser(user) {
  return {
    _id: user._id,
    phone: user.phone,
    role: user.role,
    nickname: user.nickname || '',
    last_login_at: user.last_login_at,
  };
}

// 定期清理过期验证码与 Token，避免存储无限膨胀
setInterval(() => {
  authStore.cleanup(DAY_MS).catch(err => {
    logger.error('认证数据清理失败', { error: err.message });
  });
}, 10 * 60 * 1000).unref();

/**
 * POST /api/auth/send-code
 * 发送验证码 body: { phone }
 */
router.post('/send-code', async (req, res) => {
  try {
    const phone = (req.body.phone || '').trim();
    if (!isValidPhone(phone)) {
      return res.status(400).json({ code: 400, message: '请输入正确的11位手机号', data: null });
    }

    const now = Date.now();
    const prev = await authStore.getCode(phone);

    if (prev && now - prev.created_at < CODE_RESEND_MS) {
      const wait = Math.ceil((CODE_RESEND_MS - (now - prev.created_at)) / 1000);
      return res.status(429).json({ code: 429, message: `发送过于频繁，请 ${wait} 秒后重试`, data: null });
    }

    let sendCount = 1;
    let dayStart = now;
    if (prev) {
      if (now - prev.day_start > DAY_MS) {
        // 跨天，重置每日计数
        sendCount = 1;
        dayStart = now;
      } else {
        if (prev.send_count >= DAILY_SEND_LIMIT) {
          return res.status(429).json({ code: 429, message: '今日发送次数已达上限，请明天再试', data: null });
        }
        sendCount = prev.send_count + 1;
        dayStart = prev.day_start;
      }
    }

    // 服务端随机生成 6 位验证码（仅存哈希）
    const code = String(crypto.randomInt(100000, 1000000));
    await authStore.saveCode(phone, {
      hash: sha256(code + phone),
      created_at: now,
      expires_at: now + CODE_TTL_MS,
      attempts: 0,
      send_count: sendCount,
      day_start: dayStart,
    });

    logger.info(`[auth] 验证码已生成 手机号=${phone} 验证码=${code} (今日第 ${sendCount} 次)`);

    res.json({
      code: 200,
      message: '验证码已发送',
      data: {
        expire_seconds: CODE_TTL_MS / 1000,
        resend_after_seconds: CODE_RESEND_MS / 1000,
        // 未接入短信渠道时回显验证码，接入后设 AUTH_DEV_CODE=0 关闭
        ...(DEV_CODE_RETURN ? { dev_code: code, dev_note: '短信渠道未接入，验证码直接返回；接入短信后此字段关闭' } : {}),
      },
    });
  } catch (err) {
    logger.error('发送验证码失败', { error: err.message });
    res.status(500).json({ code: 500, message: '验证码发送失败，请稍后重试', data: null });
  }
});

/**
 * POST /api/auth/login
 * 登录（首次自动注册）body: { phone, code }
 */
router.post('/login', async (req, res) => {
  try {
    const phone = (req.body.phone || '').trim();
    const code = (req.body.code || '').trim();

    if (!isValidPhone(phone)) {
      return res.status(400).json({ code: 400, message: '请输入正确的11位手机号', data: null });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ code: 400, message: '验证码为6位数字', data: null });
    }

    const now = Date.now();
    const record = await authStore.getCode(phone);

    if (!record) {
      return res.status(400).json({ code: 400, message: '验证码不存在或已使用，请重新获取', data: null });
    }
    if (now > record.expires_at) {
      await authStore.deleteCode(phone);
      return res.status(400).json({ code: 400, message: '验证码已过期，请重新获取', data: null });
    }
    if (record.attempts >= CODE_MAX_ATTEMPTS) {
      await authStore.deleteCode(phone);
      return res.status(429).json({ code: 429, message: '错误次数过多，验证码已作废，请重新获取', data: null });
    }

    if (sha256(code + phone) !== record.hash) {
      await authStore.saveCode(phone, { ...record, attempts: record.attempts + 1 });
      const left = CODE_MAX_ATTEMPTS - record.attempts - 1;
      return res.status(400).json({
        code: 400,
        message: left > 0 ? `验证码错误，还可尝试 ${left} 次` : '错误次数过多，验证码已作废，请重新获取',
        data: null,
      });
    }

    // 验证通过，验证码一次性作废
    await authStore.deleteCode(phone);

    // 查找用户，不存在则注册（登录即注册）
    let user = await authStore.findUserByPhone(phone);
    let isNew = false;
    if (!user) {
      isNew = true;
      user = {
        _id: `user_${phone}_${crypto.randomBytes(4).toString('hex')}`,
        phone,
        role: 'admin',
        nickname: '',
        source: 'pc',
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        login_count: 1,
      };
      await authStore.createUser(user);
      logger.info(`[auth] 新用户注册: ${phone}`);
    } else {
      user.last_login_at = new Date().toISOString();
      user.login_count = (user.login_count || 0) + 1;
      await authStore.updateUser(user._id, {
        last_login_at: user.last_login_at,
        login_count: user.login_count,
      });
    }

    // 服务端签发随机 Token
    const token = 'tk_' + crypto.randomBytes(24).toString('hex');
    await authStore.saveToken(token, {
      phone,
      user_id: user._id,
      created_at: now,
      expires_at: now + TOKEN_TTL_MS,
    });
    logger.info(`[auth] 登录成功: ${phone} (${isNew ? '新注册' : '老用户'})`);

    res.json({
      code: 200,
      message: isNew ? '注册成功' : '登录成功',
      data: {
        token,
        expires_in: TOKEN_TTL_MS / 1000,
        is_new_user: isNew,
        user: publicUser(user),
      },
    });
  } catch (err) {
    logger.error('登录失败', { error: err.message });
    res.status(500).json({ code: 500, message: '登录失败，请稍后重试', data: null });
  }
});

/**
 * GET /api/auth/verify
 * 校验 Token（Authorization: Bearer <token>），返回当前用户
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录', data: null });
    }
    const token = authHeader.slice(7).trim();
    const session = await authStore.getToken(token);

    if (!session || session.expires_at < Date.now()) {
      if (session) {
        await authStore.deleteToken(token);
      }
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录', data: null });
    }

    const user = await authStore.findUserById(session.user_id);
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在', data: null });
    }

    res.json({ code: 200, message: 'ok', data: { user: publicUser(user) } });
  } catch (err) {
    logger.error('Token校验失败', { error: err.message });
    res.status(500).json({ code: 500, message: '校验失败，请稍后重试', data: null });
  }
});

router.post('/mini-profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'pupil' || !req.user.userId) {
      return res.status(400).json({ code: 400, message: '仅支持小程序学生用户同步', data: null });
    }
    const { nickname, grade } = req.body;
    await authStore.updateUser(req.user.userId, {
      nickname: String(nickname || '小辩手').slice(0, 32),
      grade: String(grade || 'G5').slice(0, 16),
      source: 'miniprogram',
      last_login_at: new Date().toISOString(),
    });
    return res.json({ code: 200, message: 'ok', data: { user_id: req.user.userId } });
  } catch (err) {
    logger.error('同步小程序用户失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '同步用户失败', data: null });
  }
});

module.exports = router;
