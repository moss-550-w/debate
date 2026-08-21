const logger = require('./logger');

let db = null;

/**
 * 初始化云数据库连接
 * - 云托管容器内（TENCENTCLOUD_RUNENV 已注入）：使用 DYNAMIC_CURRENT_ENV，
 *   由平台免密钥注入凭据，直连当前环境的云开发数据库
 * - 本地/其他环境：使用显式 env；wx-server-sdk 未安装或无凭据时 db=null，
 *   由上层（如 authStore）回退到本地存储
 * @param {string} env - 云环境ID
 */
function init(env) {
  try {
    const cloud = require('wx-server-sdk');
    const credentials = {};
    if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
      credentials.secretId = process.env.TENCENTCLOUD_SECRETID;
      credentials.secretKey = process.env.TENCENTCLOUD_SECRETKEY;
    }
    if (process.env.TENCENTCLOUD_RUNENV && cloud.DYNAMIC_CURRENT_ENV) {
      // 云托管必须使用动态环境，平台才能注入当前环境的服务身份。
      cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, ...credentials });
      db = cloud.database();
      logger.info('数据库初始化完成', { env: 'DYNAMIC_CURRENT_ENV(云托管)' });
    } else {
      cloud.init({ env, ...credentials });
      db = cloud.database();
      logger.info('数据库初始化完成', { env });
    }
  } catch (err) {
    logger.warn('wx-server-sdk 不可用，数据库操作将不可用', { error: err.message });
    db = null;
  }
}

/**
 * 探测云数据库是否真实可用（init 成功不代表能连通）
 * 结果缓存；5 秒超时防止本地无凭据时阻塞启动
 * 注意：仅集合不存在视为"可用"（连接正常），其余错误视为不可用
 * @returns {Promise<boolean>}
 */
let availableCache = null;
const DB_OPERATION_TIMEOUT_MS = 8000;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}超时`)), DB_OPERATION_TIMEOUT_MS)),
  ]);
}

function isProductionEnvironment() {
  return process.env.CLOUD_FUNCTION === '1'
    || process.env.TENCENTCLOUD_RUNENV === '1'
    || process.env.NODE_ENV === 'production';
}

async function isAvailable() {
  if (availableCache !== null) return availableCache;
  if (!db) {
    availableCache = false;
    return availableCache;
  }
  try {
    await Promise.race([
      db.collection('users').limit(1).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('数据库探测超时')), 5000)),
    ]);
    availableCache = true;
  } catch (err) {
    const msg = (err && (err.errMsg || err.message)) || String(err);
    const code = err && (err.code || err.errCode);
    // 仅"集合不存在"视为连接正常（wx-server-sdk 错误码 -502001 或消息含 collection not exist）
    // 环境不存在、鉴权失败、网络错误等都判定为不可用
    if ((code === -502001 || /collection\s+not\s+exist|集合不存在/i.test(msg))
        && !/env\s+not\s+exist|INVALID_ENV|环境不存在/i.test(msg)) {
      availableCache = true;
    } else {
      logger.warn('云数据库不可用', { error: msg });
      availableCache = false;
    }
  }
  return availableCache;
}

async function requireAvailable() {
  if (await isAvailable()) return true;
  throw new Error('CloudBase 数据库不可用，生产环境已禁止使用本地回退存储');
}

/**
 * 获取数据库实例
 */
function getDB() {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 init()');
  }
  return db;
}

/**
 * 获取集合引用
 * @param {string} collectionName - 集合名
 */
function collection(name) {
  return getDB().collection(name);
}

/**
 * 查询单条记录
 * @param {string} collection - 集合名
 * @param {string} id - 记录ID
 */
async function getById(collectionName, id) {
  try {
    const res = await withTimeout(collection(collectionName).doc(id).get(), `数据库查询 [${collectionName}]`);
    return res.data;
  } catch (err) {
    logger.error(`数据库查询失败 [${collectionName}]`, { id, error: err.message });
    const message = String(err && (err.errMsg || err.message) || '');
    if (/document.*not exist|doc.*not exist|记录不存在|文档不存在/i.test(message)) return null;
    throw err;
  }
}

/**
 * 条件查询
 * @param {string} collectionName - 集合名
 * @param {object} where - 查询条件
 * @param {object} options - { orderBy, order, limit, skip }
 */
async function query(collectionName, where = {}, options = {}) {
  try {
    let q = collection(collectionName).where(where);
    if (options.orderBy && options.order) {
      q = q.orderBy(options.orderBy, options.order);
    }
    if (options.skip) {
      q = q.skip(options.skip);
    }
    const limit = options.limit || 20;
    q = q.limit(limit);
    const res = await withTimeout(q.get(), `数据库查询 [${collectionName}]`);
    return res.data;
  } catch (err) {
    logger.error(`数据库查询失败 [${collectionName}]`, { where, error: err.message });
    throw err;
  }
}

/**
 * 新增记录
 * @param {string} collectionName
 * @param {object} data
 */
async function add(collectionName, data) {
  try {
    const insertData = { ...data };
    if (!('created_at' in insertData)) {
      insertData.created_at = getDB().serverDate();
    }
    const res = await collection(collectionName).add({ data: insertData });
    return res._id || (data._id || null);
  } catch (err) {
    logger.error(`数据库新增失败 [${collectionName}]`, { error: err.message });
    throw err;
  }
}

/**
 * 更新记录
 * @param {string} collectionName
 * @param {string} id
 * @param {object} data
 */
async function update(collectionName, id, data) {
  try {
    const updateData = { ...data };
    if (!('updated_at' in updateData)) {
      updateData.updated_at = getDB().serverDate();
    }
    await collection(collectionName).doc(id).update({ data: updateData });
    return true;
  } catch (err) {
    logger.error(`数据库更新失败 [${collectionName}]`, { id, error: err.message });
    throw err;
  }
}

/**
 * 按 _id 新增或整体覆盖记录（upsert）
 * @param {string} collectionName
 * @param {string} id - 文档 _id，不存在则创建
 * @param {object} data
 */
async function set(collectionName, id, data) {
  try {
    const setData = { ...data };
    delete setData._id;
    if (!('updated_at' in setData)) {
      setData.updated_at = getDB().serverDate();
    }
    await collection(collectionName).doc(id).set({ data: setData });
    return true;
  } catch (err) {
    logger.error(`数据库写入失败 [${collectionName}]`, { id, error: err.message });
    throw err;
  }
}

/**
 * 删除记录
 * @param {string} collectionName
 * @param {string} id
 */
async function remove(collectionName, id) {
  try {
    await collection(collectionName).doc(id).remove();
    return true;
  } catch (err) {
    logger.error(`数据库删除失败 [${collectionName}]`, { id, error: err.message });
    throw err;
  }
}

module.exports = {
  init,
  isAvailable,
  isProductionEnvironment,
  requireAvailable,
  getDB,
  collection,
  getById,
  query,
  add,
  update,
  set,
  remove,
};
