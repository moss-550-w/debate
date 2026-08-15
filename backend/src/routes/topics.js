/**
 * 辩题列表路由
 * 从 seed JSON 提供辩题数据（云数据库未连接时的 fallback）
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// 读取 seed 数据
const seedPath = path.join(__dirname, '../../topics-seed.json');
let topics = [];
try {
  if (fs.existsSync(seedPath)) {
    topics = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  }
} catch (err) {
  console.error('读取辩题种子数据失败:', err.message);
}

/**
 * GET /api/topics
 * 查询辩题列表，支持分页和筛选
 * 查询参数: ?category=&difficulty=&page=1&size=10&keyword=
 */
router.get('/', (req, res) => {
  try {
    let { category, difficulty, page, size, keyword } = req.query;
    page = parseInt(page) || 1;
    size = Math.min(parseInt(size) || 50, 100); // 默认全量，方便前端展示
    keyword = (keyword || '').toLowerCase().trim();

    let filtered = [...topics];

    // 按分类筛选
    if (category && category !== 'all') {
      filtered = filtered.filter(t => t.category === category);
    }

    // 按难度筛选
    if (difficulty && difficulty !== 'all') {
      filtered = filtered.filter(t => t.difficulty === difficulty);
    }

    // 按关键词搜索
    if (keyword) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(keyword) ||
        (t.background && t.background.toLowerCase().includes(keyword))
      );
    }

    // 只返回上架的
    filtered = filtered.filter(t => t.status === 1);

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

module.exports = router;