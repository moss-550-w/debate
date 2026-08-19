const crypto = require('crypto');
const store = require('./persistentStore');

const COLLECTION = 'debate_turns';

function createId() {
  return `debate_turn_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

async function recordTurn(data) {
  const id = createId();
  await store.set(COLLECTION, id, { _id: id, ...data, created_at: data.created_at || new Date().toISOString() });
  return id;
}

async function listByUser(userId) {
  return store.list(COLLECTION, { user_id: userId }, { orderBy: 'created_at', order: 'desc', limit: 500 });
}

module.exports = { recordTurn, listByUser };
