const fs = require('fs');
const path = require('path');
const db = require('../utils/db');
const logger = require('../utils/logger');

const localPath = path.join(__dirname, '../../runtime-store.json');
let localData = {};
let storageMode = null;

try {
  if (fs.existsSync(localPath)) localData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
} catch (err) {
  logger.warn('读取本地业务存储失败，将使用空存储', { error: err.message });
}

function saveLocal() {
  fs.writeFileSync(localPath, JSON.stringify(localData, null, 2), 'utf-8');
}

async function getMode() {
  if (storageMode) return storageMode;
  storageMode = await db.isAvailable() ? 'cloud' : 'local';
  logger.info('业务数据存储模式', { mode: storageMode });
  return storageMode;
}

function localCollection(name) {
  if (!localData[name]) localData[name] = {};
  return localData[name];
}

async function get(collection, id) {
  if ((await getMode()) === 'cloud') return db.getById(collection, id);
  return localCollection(collection)[id] || null;
}

async function list(collection, where = {}, options = {}) {
  if ((await getMode()) === 'cloud') return db.query(collection, where, options);
  const records = Object.values(localCollection(collection));
  const filtered = records.filter(record => Object.entries(where).every(([key, value]) => record[key] === value));
  const ordered = options.orderBy
    ? filtered.sort((left, right) => String(right[options.orderBy] || '').localeCompare(String(left[options.orderBy] || '')))
    : filtered;
  const start = options.skip || 0;
  return ordered.slice(start, start + (options.limit || 100));
}

async function set(collection, id, record) {
  const value = { ...record, _id: id, updated_at: new Date().toISOString() };
  if ((await getMode()) === 'cloud') return db.set(collection, id, value);
  localCollection(collection)[id] = value;
  saveLocal();
  return true;
}

async function remove(collection, id) {
  if ((await getMode()) === 'cloud') return db.remove(collection, id);
  delete localCollection(collection)[id];
  saveLocal();
  return true;
}

module.exports = { get, list, set, remove };
