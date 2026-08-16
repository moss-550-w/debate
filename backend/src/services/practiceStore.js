const crypto = require('crypto');
const store = require('./persistentStore');

const COLLECTION = 'practice_records';

function createId() {
  return `practice_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function record(data) {
  const id = createId();
  const createdAt = new Date().toISOString();
  await store.set(COLLECTION, id, { _id: id, ...data, created_at: createdAt });
  return id;
}

async function list() {
  return store.list(COLLECTION, {}, { orderBy: 'created_at', limit: 1000 });
}

module.exports = { record, list };
