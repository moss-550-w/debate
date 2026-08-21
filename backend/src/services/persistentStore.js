const db = require('../utils/db');
const logger = require('../utils/logger');

let storageMode = null;

async function getMode() {
  if (storageMode) return storageMode;
  if (await db.isAvailable()) {
    storageMode = 'cloud';
  } else if (db.isProductionEnvironment()) {
    throw new Error('业务存储初始化失败：生产环境无法连接 CloudBase 数据库');
  } else {
    storageMode = 'local';
  }
  logger.info('业务数据存储模式', { mode: storageMode });
  return storageMode;
}

async function get(collection, id) {
  await getMode();
  return db.getById(collection, id);
}

async function list(collection, where = {}, options = {}) {
  await getMode();
  return db.query(collection, where, options);
}

async function set(collection, id, record) {
  const value = { ...record, _id: id, updated_at: new Date().toISOString() };
  await getMode();
  return db.set(collection, id, value);
}

async function remove(collection, id) {
  await getMode();
  return db.remove(collection, id);
}

module.exports = { get, list, set, remove };
