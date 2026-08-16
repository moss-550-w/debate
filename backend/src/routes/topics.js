/**
 * 辩题列表路由
 * 从 seed JSON 提供辩题数据，支持完整 CRUD
 * 云数据库未连接时，修改会持久化到 topics-seed.json 文件
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

const seedPath = path.join(__dirname, '../../topics-seed.json');
let topics = [];
let nextSeq = 100; // 新增辩题的自增序号

// 读取 seed 数据
try {
  if (fs.existsSync(seedPath)) {
    topics = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    // 计算最大序号
    topics.forEach(t => {
      const match = t._id && t._id.match(/topic_.*_(\d+)$/);
      if (match) {
        nextSeq = Math.max(nextSeq, parseInt(match[1]) + 1);
      }
    });
  }
} catch (err) {
  console.error('读取辩题种子数据失败:', err.message);
}

/**
 * 持久化到文件
 */
function saveTopics() {
  try {
    fs.writeFileSync(seedPath, JSON.stringify(topics, null, 2), 'utf-8');
  } catch (err) {
    console.error('保存辩题数据失败:', err.message);
  }
}

/**
 * GET /api/topics?admin=1
 * 查询辩题列表（管理员模式返回全部含下架，普通模式仅返回上架）
 * 查询参数: ?category=&difficulty=&page=1&size=10&keyword=&admin=1
 */
router.get('/', (req, res) => {
  try {
    let { category, difficulty, page, size, keyword, admin } = req.query;
    page = parseInt(page) || 1;
    size = Math.min(parseInt(size) || 50, 100);
    keyword = (keyword || '').toLowerCase().trim();

    let filtered = [...topics];

    if (category && category !== 'all') {
      filtered = filtered.filter(t => t.category === category);
    }

    if (difficulty && difficulty !== 'all') {
      filtered = filtered.filter(t => t.difficulty === difficulty);
    }

    if (keyword) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(keyword) ||
        (t.background && t.background.toLowerCase().includes(keyword))
      );
    }

    // 非管理员模式只返回上架的
    if (admin !== '1') {
      filtered = filtered.filter(t => t.status === 1);
    }

    const total = filtered.length;
    const start = (page - 1) * size;
    const list = filtered.slice(start, start + size);

    res.json({
      code: 200,
      message: 'ok',
      data: { total, page, size, list },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询辩题失败', data: null });
  }
});

/**
 * GET /api/topics/:id
 * 获取单个辩题详情
 */
router.get('/:id', (req, res) => {
  const topic = topics.find(t => t._id === req.params.id);
  if (!topic) {
    return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
  }
  res.json({ code: 200, message: 'ok', data: topic });
});

/**
 * POST /api/topics
 * 创建新辩题（需鉴权）
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const { title, category, difficulty, background, vocab_list } = req.body;

    if (!title || !category || !difficulty) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填字段: title, category, difficulty',
        data: null,
      });
    }

    const validCategories = ['society', 'education', 'tech', 'environment'];
    const validDifficulties = ['easy', 'medium', 'hard'];

    if (!validCategories.includes(category)) {
      return res.status(400).json({ code: 400, message: '无效的分类', data: null });
    }
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({ code: 400, message: '无效的难度', data: null });
    }

    const newTopic = {
      _id: `topic_custom_${nextSeq++}`,
      title,
      category,
      difficulty,
      vocab_list: vocab_list || [],
      background: background || '',
      status: 1,
      created_at: new Date().toISOString(),
    };

    topics.push(newTopic);
    saveTopics();

    res.json({ code: 200, message: '辩题创建成功', data: newTopic });
  } catch (err) {
    res.status(500).json({ code: 500, message: '创建辩题失败', data: null });
  }
});

/**
 * PUT /api/topics/:id
 * 更新辩题（需鉴权）
 */
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const idx = topics.findIndex(t => t._id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    }

    const { title, category, difficulty, background, vocab_list } = req.body;
    const validCategories = ['society', 'education', 'tech', 'environment'];
    const validDifficulties = ['easy', 'medium', 'hard'];

    if (category && !validCategories.includes(category)) {
      return res.status(400).json({ code: 400, message: '无效的分类', data: null });
    }
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({ code: 400, message: '无效的难度', data: null });
    }

    const updated = {
      ...topics[idx],
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category }),
      ...(difficulty !== undefined && { difficulty }),
      ...(background !== undefined && { background }),
      ...(vocab_list !== undefined && { vocab_list }),
      updated_at: new Date().toISOString(),
    };

    topics[idx] = updated;
    saveTopics();

    res.json({ code: 200, message: '辩题更新成功', data: updated });
  } catch (err) {
    res.status(500).json({ code: 500, message: '更新辩题失败', data: null });
  }
});

/**
 * DELETE /api/topics/:id
 * 删除辩题（需鉴权）
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const idx = topics.findIndex(t => t._id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    }

    const removed = topics.splice(idx, 1)[0];
    saveTopics();

    res.json({ code: 200, message: '辩题已删除', data: { _id: removed._id } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除辩题失败', data: null });
  }
});

/**
 * PATCH /api/topics/:id/status
 * 上下架辩题（需鉴权）
 * body: { status: 1 } 上架 / { status: 0 } 下架
 */
router.patch('/:id/status', authMiddleware, (req, res) => {
  try {
    const idx = topics.findIndex(t => t._id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ code: 404, message: '辩题不存在', data: null });
    }

    const newStatus = req.body.status === 0 ? 0 : 1;
    topics[idx].status = newStatus;
    saveTopics();

    res.json({
      code: 200,
      message: newStatus === 1 ? '辩题已上架' : '辩题已下架',
      data: topics[idx],
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '操作失败', data: null });
  }
});

module.exports = router;