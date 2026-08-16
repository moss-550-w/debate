/**
 * 认证存储适配层（云数据库优先 / 本地 JSON 回退）
 *
 * 云托管环境：wx-server-sdk 免密钥直连云开发数据库（users / auth_codes / auth_tokens）
 * 本地开发：wx-server-sdk 不可用时自动回退 auth-store.json，接口与行为完全一致
 * 强制指定：环境变量 AUTH_STORAGE=local 可锁定本地模式（回滚用）
 *
 * 集合设计：
 * - users        复用现有用户集合，PC 用户以 phone 关联，source='pc'；
 *                自定义 _id（user_<phone>_<rand>）保持两种模式下 ID 格式一致
 * - auth_codes   _id = phone（一手机号一条，重发覆盖），字段全为时间戳毫秒数
 * - auth_tokens  _id = token（天然唯一，主键查询）
 */
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const db = require('../utils/db');

const COL = {
  USERS: 'users',
  CODES: 'auth_codes',
  TOKENS: 'auth_tokens',
};

// ===== 本地 JSON 回退存储 =====
const storePath = path.join(__dirname, '../../auth-store.json');
let local = { users: [], codes: {}, tokens: {} };
try {
  if (fs.existsSync(storePath)) {
    local = { users: [], codes: {}, tokens: {}, ...JSON.parse(fs.readFileSync(storePath, 'utf-8')) };
  }
} catch (err) {
  logger.warn('读取认证存储失败，将使用空存储', { error: err.message });
}

function saveLocal() {
  try {
    fs.writeFileSync(storePath, JSON.stringify(local, null, 2), 'utf-8');
  } catch (err) {
    logger.error('保存认证存储失败', { error: err.message });
  }
}

// ===== 模式判定（首次调用时探测并缓存） =====
let mode = null;
let modePromise = null;

function getMode() {
  if (mode) return Promise.resolve(mode);
  if (!modePromise) {
    modePromise = (async () => {
      if (process.env.AUTH_STORAGE === 'local') {
        mode = 'local';
        logger.info('认证存储: 本地JSON（AUTH_STORAGE=local 强制指定）');
      } else if (await db.isAvailable()) {
        mode = 'cloud';
        logger.info('认证存储: 云数据库');
      } else {
        mode = 'local';
        logger.warn('认证存储: 本地JSON（云数据库不可用，仅限本地开发使用）');
      }
      return mode;
    })();
  }
  return modePromise;
}

/** 当前生效的存储模式（已探测后可用，用于日志/调试） */
function currentMode() {
  return mode;
}

// ===== 用户 =====
async function findUserByPhone(phone) {
  if ((await getMode()) === 'cloud') {
    const list = await db.query(COL.USERS, { phone }, { limit: 1 });
    return list[0] || null;
  }
  return local.users.find(u => u.phone === phone) || null;
}

async function findUserById(id) {
  if ((await getMode()) === 'cloud') {
    return db.getById(COL.USERS, id);
  }
  return local.users.find(u => u._id === id) || null;
}

/**
 * 创建用户记录
 * @returns {Promise<string>} 用户 _id
 */
async function createUser(user) {
  if ((await getMode()) === 'cloud') {
    // 云数据库 add 支持自定义 _id，保持与本地模式 ID 格式一致
    return db.add(COL.USERS, user);
  }
  local.users.push(user);
  saveLocal();
  return user._id;
}

async function updateUser(id, fields) {
  if ((await getMode()) === 'cloud') {
    return db.update(COL.USERS, id, fields);
  }
  const user = local.users.find(u => u._id === id);
  if (user) Object.assign(user, fields);
  saveLocal();
  return true;
}

// ===== 验证码（_id = phone，重发整体覆盖） =====
async function saveCode(phone, record) {
  if ((await getMode()) === 'cloud') {
    return db.set(COL.CODES, phone, record);
  }
  local.codes[phone] = record;
  saveLocal();
  return true;
}

async function getCode(phone) {
  if ((await getMode()) === 'cloud') {
    return db.getById(COL.CODES, phone);
  }
  return local.codes[phone] || null;
}

async function deleteCode(phone) {
  if ((await getMode()) === 'cloud') {
    return db.remove(COL.CODES, phone);
  }
  delete local.codes[phone];
  saveLocal();
  return true;
}

// ===== Token（_id = token） =====
async function saveToken(token, session) {
  if ((await getMode()) === 'cloud') {
    return db.set(COL.TOKENS, token, session);
  }
  local.tokens[token] = session;
  saveLocal();
  return true;
}

async function getToken(token) {
  if ((await getMode()) === 'cloud') {
    return db.getById(COL.TOKENS, token);
  }
  return local.tokens[token] || null;
}

async function deleteToken(token) {
  if ((await getMode()) === 'cloud') {
    return db.remove(COL.TOKENS, token);
  }
  delete local.tokens[token];
  saveLocal();
  return true;
}

// ===== 过期数据清理（惰性 + 定时兜底） =====
/**
 * 清理过期验证码与 Token
 * @param {number} maxCodeAgeMs - 验证码最长保留时长（毫秒）
 */
async function cleanup(maxCodeAgeMs) {
  const now = Date.now();
  if ((await getMode()) === 'cloud') {
    const _ = db.getDB().command;
    const expiredCodes = await db.query(COL.CODES, { created_at: _.lt(now - maxCodeAgeMs) }, { limit: 100 });
    for (const c of expiredCodes) {
      await db.remove(COL.CODES, c._id);
    }
    const expiredTokens = await db.query(COL.TOKENS, { expires_at: _.lt(now) }, { limit: 100 });
    for (const t of expiredTokens) {
      await db.remove(COL.TOKENS, t._id);
    }
    return { codes: expiredCodes.length, tokens: expiredTokens.length };
  }
  let codes = 0;
  for (const phone of Object.keys(local.codes)) {
    if (now - local.codes[phone].created_at > maxCodeAgeMs) {
      delete local.codes[phone];
      codes++;
    }
  }
  let tokens = 0;
  for (const token of Object.keys(local.tokens)) {
    if (local.tokens[token].expires_at < now) {
      delete local.tokens[token];
      tokens++;
    }
  }
  if (codes || tokens) saveLocal();
  return { codes, tokens };
}

module.exports = {
  getMode,
  currentMode,
  findUserByPhone,
  findUserById,
  createUser,
  updateUser,
  saveCode,
  getCode,
  deleteCode,
  saveToken,
  getToken,
  deleteToken,
  cleanup,
};
