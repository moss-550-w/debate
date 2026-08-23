const crypto = require('crypto');
const store = require('./persistentStore');

const COLLECTION = 'portfolio_records';

function createId() {
  return `portfolio_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function record(data) {
  const id = createId();
  const value = { _id: id, ...data, created_at: data.created_at || new Date().toISOString() };
  await store.set(COLLECTION, id, value);
  return value;
}

async function listByUser(userId, options = {}) {
  const where = { user_id: userId };
  if (options.contentType) {
    where.content_type = options.contentType;
  }
  return store.list(COLLECTION, where, {
    orderBy: 'created_at',
    order: 'desc',
    skip: Math.max(0, Number(options.skip) || 0),
    limit: Math.max(1, Number(options.limit) || 500),
  });
}

async function countByUser(userId, contentType) {
  const where = { user_id: userId };
  if (contentType) {
    where.content_type = contentType;
  }
  return store.count(COLLECTION, where);
}

async function list() {
  return store.list(COLLECTION, {}, { orderBy: 'created_at', order: 'desc', limit: 5000 });
}

module.exports = { record, listByUser, countByUser, list };
