/**
 * 任务发布路由
 * 教师发布/管理任务，学生获取当前任务
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { requireManagement } = require('../middleware/rbac');

// 内存存储
const assignments = new Map(); // key: assignmentId
let currentAssignment = { topicId: null, topicTitle: null, assignedAt: null };
let nextId = 1;

/**
 * POST /api/assignments/publish
 * 教师发布任务
 */
router.post('/publish', authMiddleware, requireManagement, (req, res) => {
  try {
    const { topic_id, topic_title } = req.body;

    if (!topic_id || !topic_title) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, topic_title',
        data: null,
      });
    }

    const assignmentId = String(nextId++);
    const assignedAt = new Date().toISOString();

    const assignment = {
      id: assignmentId,
      topic_id,
      topic_title,
      assigned_at: assignedAt,
      published_by: req.user ? req.user.openid : 'unknown',
    };

    assignments.set(assignmentId, assignment);
    currentAssignment = { topicId: topic_id, topicTitle: topic_title, assignedAt };

    res.json({
      code: 200,
      message: '任务发布成功',
      data: {
        topic_id,
        topic_title,
        assigned_at: assignedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '发布任务失败', data: null });
  }
});

/**
 * GET /api/assignments/current
 * 获取当前任务（无需鉴权）
 */
router.get('/current', (req, res) => {
  try {
    const isActive = currentAssignment.topicId !== null;

    res.json({
      code: 200,
      message: 'ok',
      data: {
        topic_id: currentAssignment.topicId,
        topic_title: currentAssignment.topicTitle,
        assigned_at: currentAssignment.assignedAt,
        is_active: isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取当前任务失败', data: null });
  }
});

/**
 * GET /api/assignments/history
 * 获取任务发布历史
 */
router.get('/history', authMiddleware, (req, res) => {
  try {
    const list = Array.from(assignments.values())
      .sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at));

    res.json({
      code: 200,
      message: 'ok',
      data: { total: list.length, list },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取历史记录失败', data: null });
  }
});

module.exports = router;
