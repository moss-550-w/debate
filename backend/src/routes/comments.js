const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');
const persistentStore = require('../services/persistentStore');
const db = require('../utils/db');
const { requireManagement } = require('../middleware/rbac');

const ASSIGNMENT_COLLECTION = 'teacher_assignments';
const SUBMISSION_COLLECTION = 'assignment_submissions';

// 有效的评论类型
const VALID_COMMENT_TYPES = ['peer', 'teacher'];

/**
 * POST /api/comments
 * 提交评论/点评
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { record_id, content, comment_type, teacher_id } = req.body;

    // 校验必填参数
    if (!record_id) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: record_id', data: null });
    }
    if (!content) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: content', data: null });
    }
    if (!comment_type || !VALID_COMMENT_TYPES.includes(comment_type)) {
      return res.status(400).json({
        code: 400,
        message: `无效的 comment_type，可选值: ${VALID_COMMENT_TYPES.join(', ')}`,
        data: null,
      });
    }
    if (comment_type === 'teacher' && !teacher_id) {
      return res.status(400).json({ code: 400, message: '导师点评需要提供 teacher_id', data: null });
    }

    const comment = {
      _id: `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      record_id,
      content,
      comment_type,
      teacher_id: comment_type === 'teacher' ? teacher_id : null,
      user_id: req.user.userId || req.user.openid,
      nickname: req.user.nickname || '',
      created_at: new Date().toISOString(),
    };

    await persistentStore.set('comments', comment._id, comment);

    logger.info('评论提交成功', { record_id, comment_type, commentId: comment._id });

    res.json({
      code: 200,
      message: 'ok',
      data: comment,
    });
  } catch (err) {
    logger.error('提交评论失败', { error: err.message });
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '提交评论失败';
    res.status(500).json({
      code: 500,
      message,
      data: null,
    });
  }
});

/**
 * GET /api/comments/assignments
 * 获取议题列表（学生端）
 * 注意：必须注册在 GET /:recordId 之前，否则 /assignments 会被当作 recordId 吞掉
 */
router.get('/assignments', async (req, res) => {
  try {
    const allAssignments = await persistentStore.list(ASSIGNMENT_COLLECTION, {}, { orderBy: 'created_at', order: 'desc', limit: 1000 });

    // 按创建时间倒序排列
    allAssignments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 标记当前可提交的议题
    const now = new Date();
    const result = allAssignments.map(a => ({
      ...a,
      is_open: a.status === 'open' && (!a.deadline || new Date(a.deadline) >= now),
    }));

    logger.info('获取议题列表成功', { total: result.length });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        total: result.length,
        assignments: result,
      },
    });
  } catch (err) {
    logger.error('获取议题列表失败', { error: err.message });
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '获取议题列表失败';
    res.status(500).json({
      code: 500,
      message,
      data: null,
    });
  }
});

/**
 * GET /api/comments/:recordId
 * 获取某条记录的评论列表
 */
router.get('/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;

    const commentList = await persistentStore.list(
      'comments',
      { record_id: recordId },
      { limit: 100 },
    );

    // 按时间排序
    commentList.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // 标记每条评论的类型
    const result = commentList.map(c => ({
      ...c,
      is_teacher_review: c.comment_type === 'teacher',
    }));

    logger.info('获取评论列表成功', { recordId, total: result.length });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        record_id: recordId,
        total: result.length,
        comments: result,
      },
    });
  } catch (err) {
    logger.error('获取评论列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取评论列表失败',
      data: null,
    });
  }
});

/**
 * POST /api/comments/teacher-assignment
 * 导师发布议题
 */
router.post('/teacher-assignment', authMiddleware, requireManagement, async (req, res) => {
  try {
    const { topic_id, title, description, deadline, requirements } = req.body;

    // 校验必填参数
    if (!topic_id) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: topic_id', data: null });
    }
    if (!title) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: title', data: null });
    }
    if (!description) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: description', data: null });
    }

    const assignment = {
      _id: `assignment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic_id,
      title,
      description,
      deadline: deadline || null,
      requirements: requirements || '',
      created_by: req.user.userId || req.user.openid,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await persistentStore.set(ASSIGNMENT_COLLECTION, assignment._id, assignment);

    logger.info('导师议题发布成功', { assignmentId: assignment._id, title });

    res.json({
      code: 200,
      message: 'ok',
      data: assignment,
    });
  } catch (err) {
    logger.error('发布议题失败', { error: err.message });
    const message = db.isProductionEnvironment() && /CloudBase|存储初始化/.test(err.message || '')
      ? 'CloudBase 数据库不可用，请检查云托管权限和环境变量'
      : '发布议题失败';
    res.status(500).json({
      code: 500,
      message,
      data: null,
    });
  }
});

/**
 * POST /api/comments/submit-assignment
 * 提交作业
 */
router.post('/submit-assignment', authMiddleware, async (req, res) => {
  try {
    const { assignment_id, record_id, notes } = req.body;

    // 校验必填参数
    if (!assignment_id) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: assignment_id', data: null });
    }
    if (!record_id) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: record_id', data: null });
    }

    // 检查作业是否存在
    const assignment = await persistentStore.get(ASSIGNMENT_COLLECTION, assignment_id);
    if (!assignment) {
      return res.status(404).json({ code: 404, message: '议题不存在', data: null });
    }

    // 检查截止日期
    if (assignment.deadline) {
      const deadline = new Date(assignment.deadline);
      if (deadline < new Date()) {
        return res.status(400).json({ code: 400, message: '议题已截止提交', data: null });
      }
    }

    // 调用 AI 自动分析
    let aiAnalysis;
    try {
      aiAnalysis = await aiService.analyzePortfolio(notes || '', 'argument', assignment.title);
      logger.info('AI 作业分析成功', { assignment_id, record_id });
    } catch (err) {
      logger.warn('AI 作业分析失败，使用预设分析', { error: err.message });
      aiAnalysis = {
        strengths: ['内容完整', '思路清晰'],
        weaknesses: ['可进一步深化论证'],
        suggestions: ['建议补充更多论据支撑'],
        judge_score: 70,
        judge_comment: '你的思考有一定深度，继续努力完善论证结构会更好。',
      };
    }

    const submission = {
      _id: `submission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assignment_id,
      record_id,
      notes: notes || '',
      user_id: req.user.userId || req.user.openid,
      nickname: req.user.nickname || '',
      ai_analysis,
      status: 'submitted',
      created_at: new Date().toISOString(),
    };

    await persistentStore.set(SUBMISSION_COLLECTION, submission._id, submission);

    logger.info('作业提交成功', { assignment_id, submissionId: submission._id });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        submission,
        ai_analysis: aiAnalysis,
      },
    });
  } catch (err) {
    logger.error('提交作业失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '提交作业失败',
      data: null,
    });
  }
});

/**
 * GET /api/comments/assignment/:id/submissions
 * 获取某议题的所有提交（导师端）
 */
router.get('/assignment/:id/submissions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await persistentStore.get(ASSIGNMENT_COLLECTION, id);
    if (!assignment) {
      return res.status(404).json({ code: 404, message: '议题不存在', data: null });
    }

    const submissionList = await persistentStore.list(SUBMISSION_COLLECTION, { assignment_id: id }, { orderBy: 'created_at', order: 'desc', limit: 1000 });

    // 按提交时间倒序排列
    submissionList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 检查每条提交是否有导师点评
    const result = await Promise.all(submissionList.map(async s => {
      const recordComments = await persistentStore.list(
        'comments',
        { record_id: s.record_id },
        { limit: 1 },
      );
      const hasTeacherReview = recordComments.some(c => c.comment_type === 'teacher');
      return {
        ...s,
        has_teacher_review: hasTeacherReview,
        review_status: hasTeacherReview ? '已点评' : '待点评',
      };
    }));

    logger.info('获取议题提交列表成功', { assignmentId: id, total: result.length });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        assignment: {
          _id: assignment._id,
          title: assignment.title,
          topic_id: assignment.topic_id,
        },
        total: result.length,
        submissions: result,
      },
    });
  } catch (err) {
    logger.error('获取议题提交列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取议题提交列表失败',
      data: null,
    });
  }
});

module.exports = router;
