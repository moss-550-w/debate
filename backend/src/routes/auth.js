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
const { normalizeRole } = require('../middleware/rbac');
const { requestTencentSms } = require('../services/smsService');

// ===== 常量 =====
const CODE_TTL_MS = 5 * 60 * 1000;            // 验证码有效期 5 分钟
const CODE_RESEND_MS = 60 * 1000;             // 重发间隔 60 秒
const CODE_MAX_ATTEMPTS = 5;                  // 单个验证码最多尝试 5 次
const DAILY_SEND_LIMIT = 10;                  // 单手机号每日发送上限
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Token 有效期 7 天
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.TENCENTCLOUD_RUNENV === '1';
const DEV_CODE_RETURN = !IS_PRODUCTION && process.env.AUTH_DEV_CODE !== '0';
const developerKeyFailures = new Map();
const DEVELOPER_KEY_WINDOW_MS = 15 * 60 * 1000;
const DEVELOPER_KEY_MAX_FAILURES = 5;

// ===== 工具函数 =====
function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function matchesConfiguredHash(value, configuredHash) {
  const actualHash = sha256(value);
  const expectedHash = String(configuredHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function sendAuthInfrastructureError(res, err, fallbackMessage) {
  const message = String(err && err.message || '');
  if (/认证数据库|认证集合|CloudBase|数据库|集合|权限|未初始化/i.test(message)) {
    return res.status(503).json({ code: 503, message: '认证服务未就绪，请检查 CloudBase 认证集合和权限', data: null });
  }
  return res.status(500).json({ code: 500, message: fallbackMessage, data: null });
}

function publicUser(user) {
  const role = normalizeRole(user.role);
  return {
    _id: user._id,
    phone: user.phone,
    role,
    role_label: { developer: '开发者', teacher: '教师', student: '学生' }[role],
    nickname: user.nickname || '',
    avatar_url: user.avatar_url || '',
    gender: user.gender || '',
    birth_date: user.birth_date || '',
    school: user.school || '',
    class_name: user.class_name || '',
    bio: user.bio || '',
    phone_verified: Boolean(user.phone_verified),
    source: user.source || 'miniprogram',
    created_at: user.created_at,
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

    let smsResult;
    try {
      smsResult = await requestTencentSms({ phone, code });
    } catch (err) {
      await authStore.deleteCode(phone).catch(() => {});
      logger.error('短信发送失败', { phone, error: err.message });
      return res.status(502).json({ code: 502, message: '短信发送失败，请稍后重试', data: null });
    }
    if (!smsResult.configured && IS_PRODUCTION) {
      await authStore.deleteCode(phone).catch(() => {});
      return res.status(503).json({ code: 503, message: '短信服务未配置，请联系管理员', data: null });
    }
    logger.info(`[auth] 验证码已生成 手机号=${phone} (今日第 ${sendCount} 次, sms=${smsResult.configured ? 'sent' : 'dev'})`);

    res.json({
      code: 200,
      message: '验证码已发送',
      data: {
        expire_seconds: CODE_TTL_MS / 1000,
        resend_after_seconds: CODE_RESEND_MS / 1000,
        // 未接入短信渠道时回显验证码，接入后设 AUTH_DEV_CODE=0 关闭
        ...(!smsResult.configured && DEV_CODE_RETURN ? { dev_code: code, dev_note: '短信渠道未接入，当前为开发回显模式' } : {}),
      },
    });
  } catch (err) {
    logger.error('发送验证码失败', { error: err.message });
    sendAuthInfrastructureError(res, err, '验证码发送失败，请稍后重试');
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

    // PC 登录只允许已有管理账号，避免任意手机号获得后台权限。
    let user = await authStore.findUserByPhone(phone);
    let isNew = false;
    if (!user) {
      const developerPhones = String(process.env.DEVELOPER_PHONES || '').split(',').map(item => item.trim()).filter(Boolean);
      const teacherPhones = String(process.env.TEACHER_PHONES || '').split(',').map(item => item.trim()).filter(Boolean);
      const role = developerPhones.includes(phone) ? 'developer' : teacherPhones.includes(phone) ? 'teacher' : null;
      if (!role) {
        return res.status(403).json({ code: 403, message: '该手机号未被授权进入管理端，请联系开发者分配教师权限', data: null });
      }
      isNew = true;
      user = {
        _id: `user_${phone}_${crypto.randomBytes(4).toString('hex')}`,
        phone,
        role,
        nickname: '',
        phone_verified: true,
        source: 'pc',
        status: 'active',
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        login_count: 1,
      };
      await authStore.createUser(user);
      logger.info(`[auth] 管理员账号初始化: ${phone}, role=${role}`);
    } else {
      if (user.status === 'disabled') return res.status(403).json({ code: 403, message: '账号已停用', data: null });
      if (!['developer', 'teacher', 'admin'].includes(user.role)) {
        return res.status(403).json({ code: 403, message: '该账号没有管理端权限', data: null });
      }
      user.last_login_at = new Date().toISOString();
      user.login_count = (user.login_count || 0) + 1;
      await authStore.updateUser(user._id, {
        last_login_at: user.last_login_at,
        login_count: user.login_count,
        phone_verified: true,
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
    sendAuthInfrastructureError(res, err, '登录失败，请稍后重试');
  }
});

/**
 * POST /api/auth/mini-login
 * 小程序手机号短信登录：首次登录自动创建学生账号，并绑定当前微信 openid。
 */
router.post('/mini-login', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const code = String(req.body.code || '').trim();
    const openid = String(req.headers['x-cloud-function-openid'] || '').trim();
    if (!isValidPhone(phone) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ code: 400, message: '手机号或验证码格式不正确', data: null });
    }
    if (!openid) return res.status(401).json({ code: 401, message: '缺少微信身份，请从小程序发起登录', data: null });
    const record = await authStore.getCode(phone);
    if (!record || Date.now() > record.expires_at) {
      if (record) await authStore.deleteCode(phone);
      return res.status(400).json({ code: 400, message: '验证码不存在或已过期', data: null });
    }
    if (sha256(code + phone) !== record.hash) {
      await authStore.saveCode(phone, { ...record, attempts: (record.attempts || 0) + 1 });
      return res.status(400).json({ code: 400, message: '验证码错误', data: null });
    }
    await authStore.deleteCode(phone);
    let user = await authStore.findUserByPhone(phone);
    const now = new Date().toISOString();
    if (user && user.status === 'disabled') return res.status(403).json({ code: 403, message: '账号已停用', data: null });
    if (!user) {
      user = { _id: `user_${openid}_${crypto.randomBytes(4).toString('hex')}`, openid, phone, phone_verified: true, role: 'student', nickname: '小辩手', grade: 'G5', source: 'miniprogram', status: 'active', created_at: now, last_login_at: now, login_count: 1 };
      await authStore.createUser(user);
    } else {
      await authStore.updateUser(user._id, { openid, phone_verified: true, last_login_at: now, login_count: (user.login_count || 0) + 1, source: 'miniprogram' });
      user = { ...user, openid, last_login_at: now, login_count: (user.login_count || 0) + 1 };
    }
    const token = `tk_${crypto.randomBytes(24).toString('hex')}`;
    await authStore.saveToken(token, { phone, user_id: user._id, created_at: Date.now(), expires_at: Date.now() + TOKEN_TTL_MS });
    return res.json({ code: 200, message: '登录成功', data: { token, expires_in: TOKEN_TTL_MS / 1000, user: publicUser(user) } });
  } catch (err) {
    logger.error('小程序短信登录失败', { error: err.message });
    return sendAuthInfrastructureError(res, err, '登录失败，请稍后重试');
  }
});

/**
 * POST /api/auth/developer-login
 * 开发者密钥登录。服务端只读取密钥哈希，不保存或返回明文密钥。
 */
router.post('/developer-login', async (req, res) => {
  try {
    const clientKey = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const failure = developerKeyFailures.get(clientKey);
    if (failure && Date.now() - failure.started_at < DEVELOPER_KEY_WINDOW_MS && failure.count >= DEVELOPER_KEY_MAX_FAILURES) {
      return res.status(429).json({ code: 429, message: '尝试次数过多，请 15 分钟后重试', data: null });
    }
    const key = String(req.body.key || '').trim();
    const configuredHash = process.env.DEVELOPER_LOGIN_KEY_HASH;
    if (!key || !matchesConfiguredHash(key, configuredHash)) {
      const current = failure && Date.now() - failure.started_at < DEVELOPER_KEY_WINDOW_MS
        ? failure
        : { started_at: Date.now(), count: 0 };
      current.count += 1;
      developerKeyFailures.set(clientKey, current);
      return res.status(403).json({ code: 403, message: '开发者密钥无效', data: null });
    }
    developerKeyFailures.delete(clientKey);

    const now = Date.now();
    const userId = 'developer_key_admin';
    let user = await authStore.findUserById(userId);
    const isNew = !user;
    const baseUser = {
      _id: userId,
      phone: '',
      nickname: '开发者',
      role: 'developer',
      source: 'pc',
      login_type: 'developer-key',
      status: 'active',
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      login_count: 0,
    };
    if (!user) {
      user = { ...baseUser, last_login_at: new Date(now).toISOString(), login_count: 1 };
      await authStore.createUser(user);
    } else {
      if (user.status === 'disabled') return res.status(403).json({ code: 403, message: '账号已停用', data: null });
      user = { ...user, role: 'developer', last_login_at: new Date(now).toISOString(), login_count: (user.login_count || 0) + 1 };
      await authStore.updateUser(userId, {
        role: user.role,
        last_login_at: user.last_login_at,
        login_count: user.login_count,
      });
    }

    const token = 'tk_' + crypto.randomBytes(24).toString('hex');
    await authStore.saveToken(token, {
      phone: '',
      user_id: userId,
      created_at: now,
      expires_at: now + TOKEN_TTL_MS,
    });
    logger.info('[auth] 开发者密钥登录成功');
    return res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        expires_in: TOKEN_TTL_MS / 1000,
        is_new_user: isNew,
        user: publicUser(user),
      },
    });
  } catch (err) {
    logger.error('开发者密钥登录失败', { error: err.message });
    return sendAuthInfrastructureError(res, err, '登录失败，请稍后重试');
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
    sendAuthInfrastructureError(res, err, '校验失败，请稍后重试');
  }
});

router.post('/bind-phone', authMiddleware, async (req, res) => {
  try {
    const phone = String(req.body.phone || '').trim();
    const code = String(req.body.code || '').trim();
    if (!isValidPhone(phone) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ code: 400, message: '手机号或验证码格式不正确', data: null });
    }
    const record = await authStore.getCode(phone);
    if (!record || Date.now() > record.expires_at) {
      if (record) await authStore.deleteCode(phone);
      return res.status(400).json({ code: 400, message: '验证码不存在或已过期', data: null });
    }
    if (sha256(code + phone) !== record.hash) {
      await authStore.saveCode(phone, { ...record, attempts: (record.attempts || 0) + 1 });
      return res.status(400).json({ code: 400, message: '验证码错误', data: null });
    }
    const existing = await authStore.findUserByPhone(phone);
    if (existing && existing._id !== req.user.userId) {
      return res.status(409).json({ code: 409, message: '该手机号已绑定其他账号', data: null });
    }
    await authStore.deleteCode(phone);
    await authStore.updateUser(req.user.userId, { phone, phone_verified: true, phone_bound_at: new Date().toISOString() });
    const user = await authStore.findUserById(req.user.userId);
    return res.json({ code: 200, message: '手机号绑定成功', data: { user: publicUser(user) } });
  } catch (err) {
    logger.error('手机号绑定失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '手机号绑定失败，请稍后重试', data: null });
  }
});

router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const allowed = ['nickname', 'avatar_url', 'gender', 'birth_date', 'school', 'class_name', 'grade', 'bio'];
    const fields = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) fields[key] = String(req.body[key]).trim().slice(0, key === 'bio' ? 300 : 64);
    }
    if (!Object.keys(fields).length) return res.status(400).json({ code: 400, message: '没有可更新的资料字段', data: null });
    fields.updated_at = new Date().toISOString();
    await authStore.updateUser(req.user.userId, fields);
    const user = await authStore.findUserById(req.user.userId);
    return res.json({ code: 200, message: '资料已更新', data: { user: publicUser(user) } });
  } catch (err) {
    logger.error('更新用户资料失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '更新资料失败，请稍后重试', data: null });
  }
});

router.post('/mini-profile', authMiddleware, async (req, res) => {
  try {
    let userId = req.user.userId;
    if (!userId) {
      return res.status(400).json({ code: 400, message: '用户资料不存在', data: null });
    }
    const { nickname, grade, avatar_url, gender, birth_date, school, class_name, bio } = req.body;
    await authStore.updateUser(userId, {
      nickname: String(nickname || '小辩手').slice(0, 32),
      grade: String(grade || 'G5').slice(0, 16),
      ...(avatar_url !== undefined ? { avatar_url: String(avatar_url).slice(0, 256) } : {}),
      ...(gender !== undefined ? { gender: String(gender).slice(0, 16) } : {}),
      ...(birth_date !== undefined ? { birth_date: String(birth_date).slice(0, 32) } : {}),
      ...(school !== undefined ? { school: String(school).slice(0, 64) } : {}),
      ...(class_name !== undefined ? { class_name: String(class_name).slice(0, 64) } : {}),
      ...(bio !== undefined ? { bio: String(bio).slice(0, 300) } : {}),
      source: 'miniprogram',
      last_login_at: new Date().toISOString(),
    });
    const user = await authStore.findUserById(userId);
    return res.json({
      code: 200,
      message: 'ok',
      data: { user_id: userId, openid: req.user.openid, user },
    });
  } catch (err) {
    logger.error('同步小程序用户失败', { error: err.message });
    return res.status(500).json({ code: 500, message: '同步用户失败', data: null });
  }
});

module.exports = router;
