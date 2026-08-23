/**
 * 辩题列表路由
 * 云数据库优先使用条件查询和分页；本地开发时回退到 seed JSON。
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { requireManagement } = require('../middleware/rbac');

const COLLECTION = 'topics';
const seedPath = path.join(__dirname, '../../topics-seed.json');
const VALID_CATEGORIES = ['society', 'education', 'tech', 'environment', 'china'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
let topics = [];

try {
  if (fs.existsSync(seedPath)) topics = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
} catch (err) {
  console.error('读取辩题种子数据失败:', err.message);
}

const adminOnly = requireManagement;

function adminQueryAuth(req, res, next) {
  if (req.query.admin !== '1') return next();
  return authMiddleware(req, res, () => adminOnly(req, res, next));
}

function parsePage(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  // 默认分页保持轻量；兼容思辨中国一次加载 300 条的历史客户端请求。
  const size = Math.min(500, Math.max(1, Number.parseInt(query.size, 10) || 50));
  return { page, size, skip: (page - 1) * size };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function buildCloudWhere({ category, difficulty, keyword, admin }) {
  const conditions = [];
  if (category && category !== 'all') conditions.push({ category });
  if (difficulty && difficulty !== 'all') conditions.push({ difficulty });
  if (admin !== '1') conditions.push({ status: 1 });

  if (keyword) {
    const regexp = db.getDB().RegExp({ regexp: escapeRegExp(keyword), options: 'i' });
    conditions.push(db.getDB().command.or({ title: regexp }, { background: regexp }));
  }

  if (!conditions.length) return {};
  if (conditions.length === 1 && !keyword) return conditions[0];
  return db.getDB().command.and(...conditions);
}

function filterLocalTopics({ category, difficulty, keyword, admin }) {
  const normalizedKeyword = keyword.toLowerCase();
  return topics.filter(topic => {
    if (category && category !== 'all' && topic.category !== category) return false;
    if (difficulty && difficulty !== 'all' && topic.difficulty !== difficulty) return false;
    if (admin !== '1' && topic.status !== 1) return false;
    if (normalizedKeyword && !`${topic.title || ''} ${topic.background || ''}`.toLowerCase().includes(normalizedKeyword)) return false;
    return true;
  });
}

async function isCloudTopicsAvailable() {
  return db.isAvailable();
}

function saveTopics() {
  try {
    fs.writeFileSync(seedPath, JSON.stringify(topics, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存辩题数据失败:', err.message);
  }
}

async function persistTopic(topic) {
  if (await isCloudTopicsAvailable()) return db.set(COLLECTION, topic._id, topic);
  if (db.isProductionEnvironment()) throw new Error('辩题保存失败：生产环境无法连接 CloudBase 数据库');
  saveTopics();
  return true;
}

async function removePersistedTopic(id) {
  if (await isCloudTopicsAvailable()) return db.remove(COLLECTION, id);
  if (db.isProductionEnvironment()) throw new Error('辩题删除失败：生产环境无法连接 CloudBase 数据库');
  saveTopics();
  return true;
}

function topicError(err, fallback) {
  return db.isProductionEnvironment() && /CloudBase|存储初始化|数据库/.test(err.message || '')
    ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
    : fallback;
}

router.get('/', adminQueryAuth, async (req, res) => {
  try {
    const { category, difficulty, keyword = '', admin } = req.query;
    const { page, size, skip } = parsePage(req.query);
    const normalizedKeyword = keyword.trim();

    if (await isCloudTopicsAvailable()) {
      const where = buildCloudWhere({ category, difficulty, keyword: normalizedKeyword, admin });
      const [list, total] = await Promise.all([
        db.query(COLLECTION, where, { orderBy: 'created_at', order: 'desc', skip, limit: size }),
        db.count(COLLECTION, where),
      ]);
      return res.json({ code: 200, message: 'ok', data: { total, page, size, list } });
    }

    if (db.isProductionEnvironment()) throw new Error('CloudBase 数据库不可用');
    const filtered = filterLocalTopics({ category, difficulty, keyword: normalizedKeyword, admin });
    return res.json({ code: 200, message: 'ok', data: { total: filtered.length, page, size, list: filtered.slice(skip, skip + size) } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '查询辩题失败'), data: null });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const topic = await isCloudTopicsAvailable()
      ? await db.getById(COLLECTION, req.params.id)
      : topics.find(item => item._id === req.params.id);
    if (!topic) return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    return res.json({ code: 200, message: 'ok', data: topic });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '查询辩题失败'), data: null });
  }
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { title, category, difficulty, background, vocab_list } = req.body;
    if (!title || !category || !difficulty) return res.status(400).json({ code: 400, message: '缺少必填字段: title, category, difficulty', data: null });
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ code: 400, message: '无效的分类', data: null });
    if (!VALID_DIFFICULTIES.includes(difficulty)) return res.status(400).json({ code: 400, message: '无效的难度', data: null });

    const newTopic = {
      _id: `topic_custom_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      title, category, difficulty, vocab_list: vocab_list || [], background: background || '',
      status: 1, created_at: new Date().toISOString(),
    };
    if (!(await isCloudTopicsAvailable())) topics.push(newTopic);
    await persistTopic(newTopic);
    return res.json({ code: 200, message: '辩题创建成功', data: newTopic });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '创建辩题失败'), data: null });
  }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cloud = await isCloudTopicsAvailable();
    const current = cloud ? await db.getById(COLLECTION, req.params.id) : topics.find(item => item._id === req.params.id);
    if (!current) return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    const { title, category, difficulty, background, vocab_list } = req.body;
    if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ code: 400, message: '无效的分类', data: null });
    if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) return res.status(400).json({ code: 400, message: '无效的难度', data: null });
    const updated = {
      ...current,
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category }),
      ...(difficulty !== undefined && { difficulty }),
      ...(background !== undefined && { background }),
      ...(vocab_list !== undefined && { vocab_list }),
      updated_at: new Date().toISOString(),
    };
    if (cloud) await db.set(COLLECTION, updated._id, updated);
    else {
      topics[topics.findIndex(item => item._id === updated._id)] = updated;
      saveTopics();
    }
    return res.json({ code: 200, message: '辩题更新成功', data: updated });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '更新辩题失败'), data: null });
  }
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cloud = await isCloudTopicsAvailable();
    const current = cloud ? await db.getById(COLLECTION, req.params.id) : topics.find(item => item._id === req.params.id);
    if (!current) return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    if (!cloud) {
      topics = topics.filter(item => item._id !== req.params.id);
      saveTopics();
    }
    await removePersistedTopic(req.params.id);
    return res.json({ code: 200, message: '辩题已删除', data: { _id: req.params.id } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '删除辩题失败'), data: null });
  }
});

router.patch('/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cloud = await isCloudTopicsAvailable();
    const current = cloud ? await db.getById(COLLECTION, req.params.id) : topics.find(item => item._id === req.params.id);
    if (!current) return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    const updated = { ...current, status: req.body.status === 0 ? 0 : 1, updated_at: new Date().toISOString() };
    if (cloud) await db.set(COLLECTION, updated._id, updated);
    else {
      topics[topics.findIndex(item => item._id === updated._id)] = updated;
      saveTopics();
    }
    return res.json({ code: 200, message: updated.status === 1 ? '辩题已上架' : '辩题已下架', data: updated });
  } catch (err) {
    return res.status(500).json({ code: 500, message: topicError(err, '操作失败'), data: null });
  }
});

module.exports = router;
