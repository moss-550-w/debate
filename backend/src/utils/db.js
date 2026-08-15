const logger = require('./logger');

let db = null;

/**
 * 初始化云数据库连接
 * 注意：wx-server-sdk 仅在云函数环境可用。
 * 在轻量服务器上运行时，需要先通过云函数代理数据库操作，
 * 或使用云开发 HTTP API。
 * @param {string} env - 云环境ID
 */
function init(env) {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env });
    db = cloud.database();
    logger.info('数据库初始化完成', { env });
  } catch (err) {
    logger.warn('wx-server-sdk 不可用，数据库操作将通过云函数代理', { error: err.message });
    db = null;
  }
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
    const res = await collection(collectionName).doc(id).get();
    return res.data;
  } catch (err) {
    logger.error(`数据库查询失败 [${collectionName}]`, { id, error: err.message });
    return null;
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
    const res = await q.get();
    return res.data;
  } catch (err) {
    logger.error(`数据库查询失败 [${collectionName}]`, { where, error: err.message });
    return [];
  }
}

/**
 * 新增记录
 * @param {string} collectionName
 * @param {object} data
 */
async function add(collectionName, data) {
  try {
    const res = await collection(collectionName).add({
      data: { ...data, created_at: getDB().serverDate() },
    });
    return res._id;
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
    await collection(collectionName).doc(id).update({
      data: { ...data, updated_at: getDB().serverDate() },
    });
    return true;
  } catch (err) {
    logger.error(`数据库更新失败 [${collectionName}]`, { id, error: err.message });
    throw err;
  }
}

module.exports = {
  init,
  getDB,
  collection,
  getById,
  query,
  add,
  update,
};