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

async function listByUser(userId) {
  return store.list(COLLECTION, { user_id: userId }, { orderBy: 'created_at', order: 'desc', limit: 500 });
}

module.exports = { record, listByUser };
