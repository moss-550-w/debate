/**
 * 任务发布路由
 * 教师发布/管理任务，学生获取当前任务
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const persistentStore = require('../services/persistentStore');
const db = require('../utils/db');
const { requireManagement } = require('../middleware/rbac');

const COLLECTION = 'assignments';

function createId() {
  return `assignment_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * POST /api/assignments/publish
 * 教师发布任务
 */
router.post('/publish', authMiddleware, requireManagement, async (req, res) => {
  try {
    const { topic_id, topic_title } = req.body;

    if (!topic_id || !topic_title) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, topic_title',
        data: null,
      });
    }

    const assignmentId = createId();
    const assignedAt = new Date().toISOString();

    const assignment = {
      id: assignmentId,
      topic_id,
      topic_title,
      assigned_at: assignedAt,
      is_active: true,
      published_by: req.user ? req.user.openid : 'unknown',
    };

    await persistentStore.set(COLLECTION, assignmentId, assignment);

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
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '发布任务失败';
    res.status(500).json({ code: 500, message, data: null });
  }
});

/**
 * POST /api/assignments/current/cancel
 * 管理员取消当前任务，保留任务历史记录
 */
router.post('/current/cancel', authMiddleware, requireManagement, async (req, res) => {
  try {
    const list = await persistentStore.list(COLLECTION, {}, { orderBy: 'assigned_at', order: 'desc', limit: 1 });
    const currentAssignment = list[0] || null;

    if (!currentAssignment || currentAssignment.is_active === false) {
      return res.status(400).json({ code: 400, message: '当前没有正在布置的任务', data: null });
    }

    const assignmentId = currentAssignment._id || currentAssignment.id;
    await persistentStore.set(COLLECTION, assignmentId, {
      ...currentAssignment,
      is_active: false,
      canceled_at: new Date().toISOString(),
      canceled_by: req.user ? (req.user.openid || req.user.userId) : 'unknown',
    });

    res.json({
      code: 200,
      message: '当前任务已取消',
      data: { assignment_id: assignmentId },
    });
  } catch (err) {
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '取消当前任务失败';
    res.status(500).json({ code: 500, message, data: null });
  }
});

/**
 * GET /api/assignments/current
 * 获取当前任务（无需鉴权）
 */
router.get('/current', async (req, res) => {
  try {
    const list = await persistentStore.list(COLLECTION, {}, { orderBy: 'assigned_at', order: 'desc', limit: 1 });
    const currentAssignment = list[0] || null;
    const isActive = Boolean(currentAssignment && currentAssignment.is_active !== false);

    res.json({
      code: 200,
      message: 'ok',
      data: {
        topic_id: isActive ? currentAssignment.topic_id : null,
        topic_title: isActive ? currentAssignment.topic_title : null,
        assigned_at: isActive ? currentAssignment.assigned_at : null,
        is_active: isActive,
      },
    });
  } catch (err) {
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '获取当前任务失败';
    res.status(500).json({ code: 500, message, data: null });
  }
});

/**
 * GET /api/assignments/history
 * 获取任务发布历史
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const list = await persistentStore.list(COLLECTION, {}, { orderBy: 'assigned_at', order: 'desc', limit: 1000 });

    res.json({
      code: 200,
      message: 'ok',
      data: { total: list.length, list },
    });
  } catch (err) {
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '获取历史记录失败';
    res.status(500).json({ code: 500, message, data: null });
  }
});

module.exports = router;
