const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

const { OPPONENT_STYLES } = aiService;

// 内存存储：key = sessionId, value = { userId, topic, position, style, history, stats, ... }
const debateSessions = new Map();

/**
 * 生成唯一 session ID
 */
function generateSessionId() {
  return 'session_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * 校验对手风格是否合法
 */
function isValidStyle(styleId) {
  return OPPONENT_STYLES[styleId] !== undefined;
}

/**
 * 校验立场是否合法
 */
function isValidPosition(position) {
  return position === 'pro' || position === 'con';
}

// ===== 1.1 POST /api/debate — 发送消息 =====
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { topic_id, topic_title, position, user_speech, opponent_style, session_id, response_time_ms } = req.body;

    // 校验必填参数
    if (!topic_id || !user_speech || !opponent_style) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, user_speech, opponent_style',
        data: null,
      });
    }

    if (!isValidStyle(opponent_style)) {
      return res.status(400).json({
        code: 400,
        message: '无效的对手风格',
        data: null,
      });
    }

    // 获取 session；不存在时自动创建（兼容后端重启/本地mock会话）
    let session = session_id ? debateSessions.get(session_id) : null;
    let sessionId = session_id;
    if (!session) {
      sessionId = generateSessionId();
      session = {
        userId: req.user.userId,
        topic: topic_title || 'General debate topic',
        topic_id,
        position: isValidPosition(position) ? position : 'pro',
        style: opponent_style,
        history: [],
        stats: {
          total_rounds: 0,
          effective_count: 0,
          rebuttal_score_sum: 0,
          stall_count: 0,
        },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      };
      debateSessions.set(sessionId, session);
      logger.info('对练会话自动重建', { session_id: sessionId, reason: session_id ? '原会话不存在' : '未提供session_id' });
    }

    // 权限校验：只能操作自己的 session
    if (session.userId !== req.user.userId && req.user.userId) {
      return res.status(403).json({
        code: 403,
        message: '无权操作其他用户的对练会话',
        data: null,
      });
    }

    // 获取对话历史
    const history = session.history || [];

    // 调用 AI 回复
    const aiResult = await aiService.debateReply(
      topic_title || session.topic,
      position || session.position,
      user_speech,
      opponent_style,
      history
    );

    // 计算卡壳（响应时间超过 10 秒）
    const isStall = typeof response_time_ms === 'number' && response_time_ms > 10000;
    if (isStall) {
      session.stats.stall_count = (session.stats.stall_count || 0) + 1;
    }

    // 更新有效反驳统计
    session.stats.total_rounds = (session.stats.total_rounds || 0) + 1;
    session.stats.effective_count = (session.stats.effective_count || 0) + (aiResult.is_rebuttal_effective ? 1 : 0);
    session.stats.rebuttal_score_sum = (session.stats.rebuttal_score_sum || 0) + aiResult.rebuttal_quality_score;

    // 计算有效反驳率
    const effectiveRate = session.stats.total_rounds > 0
      ? session.stats.effective_count / session.stats.total_rounds
      : 0;

    // 更新对话历史（保留最近 10 轮）
    history.push({ role: 'user', content: user_speech });
    history.push({ role: 'ai', content: aiResult.reply, style: opponent_style });
    if (history.length > 20) {
      session.history = history.slice(-20); // 10轮对话 = 20条消息
    } else {
      session.history = history;
    }

    // 更新 session 其他字段
    session.lastActivity = new Date().toISOString();

    logger.info('辩论对练回复成功', {
      session_id: sessionId,
      round: session.stats.total_rounds,
      opponent_style,
    });

    res.json({
      code: 200,
      data: {
        session_id: sessionId,
        ai_reply: aiResult.reply,
        reply_style: opponent_style,
        round: session.stats.total_rounds,
        stats: {
          effective_rebuttal_rate: Math.round(effectiveRate * 100) / 100,
          stall_count: session.stats.stall_count || 0,
          total_rounds: session.stats.total_rounds || 0,
        },
      },
    });
  } catch (err) {
    logger.error('辩论对练回复失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '对练回复失败',
      data: null,
    });
  }
});

// ===== 1.2 POST /api/debate/start — 开始新对练 =====
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { topic_id, topic_title, position, opponent_style } = req.body;

    // 校验必填参数
    if (!topic_id || !topic_title || !position || !opponent_style) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, topic_title, position, opponent_style',
        data: null,
      });
    }

    if (!isValidPosition(position)) {
      return res.status(400).json({
        code: 400,
        message: '无效的立场，请使用 pro 或 con',
        data: null,
      });
    }

    if (!isValidStyle(opponent_style)) {
      return res.status(400).json({
        code: 400,
        message: '无效的对手风格',
        data: null,
      });
    }

    // 生成 session_id
    const sessionId = generateSessionId();

    // 生成开场白
    const opening = await aiService.generateDebateOpening(topic_title, position, opponent_style);

    // 初始化 session 数据
    const session = {
      userId: req.user.userId,
      topic: topic_title,
      topic_id,
      position,
      style: opponent_style,
      history: [{ role: 'ai', content: opening, style: opponent_style }],
      stats: {
        total_rounds: 1,
        effective_count: 0,
        rebuttal_score_sum: 0,
        stall_count: 0,
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    debateSessions.set(sessionId, session);

    logger.info('辩论对练会话创建成功', {
      session_id: sessionId,
      opponent_style,
      topic: topic_title,
    });

    res.json({
      code: 200,
      data: {
        session_id: sessionId,
        opponent: {
          name: OPPONENT_STYLES[opponent_style].name,
          icon: OPPONENT_STYLES[opponent_style].icon,
        },
        opening,
        round: 1,
      },
    });
  } catch (err) {
    logger.error('创建对练会话失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '创建对练会话失败',
      data: null,
    });
  }
});

// ===== 1.3 GET /api/debate/sessions/:userId — 获取对练历史列表 =====
router.get('/sessions/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    // 权限校验
    if (req.user.userId && req.user.userId !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权查看其他用户的对练历史',
        data: null,
      });
    }

    // 筛选该用户的所有 session
    const userSessions = [];
    for (const [sessionId, session] of debateSessions) {
      if (session.userId === userId) {
        userSessions.push({
          session_id: sessionId,
          topic: session.topic,
          position: session.position,
          style: session.style,
          rounds: session.stats.total_rounds,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          opponent: {
            name: OPPONENT_STYLES[session.style]?.name || session.style,
            icon: OPPONENT_STYLES[session.style]?.icon || '',
          },
          stats: {
            effective_rebuttal_rate: session.stats.total_rounds > 0
              ? Math.round((session.stats.effective_count / session.stats.total_rounds) * 100) / 100
              : 0,
            stall_count: session.stats.stall_count || 0,
            total_rounds: session.stats.total_rounds || 0,
          },
        });
      }
    }

    // 按最后活动时间倒序
    userSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    // 分页
    const total = userSessions.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const pagedSessions = userSessions.slice(start, start + limit);

    res.json({
      code: 200,
      data: {
        sessions: pagedSessions,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (err) {
    logger.error('获取对练历史列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取对练历史列表失败',
      data: null,
    });
  }
});

// ===== 1.4 GET /api/debate/session/:sessionId — 获取单次对练详情 =====
router.get('/session/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = debateSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        code: 404,
        message: '对练会话不存在或已过期',
        data: null,
      });
    }

    // 权限校验
    if (req.user.userId && req.user.userId !== session.userId) {
      return res.status(403).json({
        code: 403,
        message: '无权查看其他用户的对练详情',
        data: null,
      });
    }

    const effectiveRate = session.stats.total_rounds > 0
      ? Math.round((session.stats.effective_count / session.stats.total_rounds) * 100) / 100
      : 0;

    const avgScore = session.stats.total_rounds > 0
      ? Math.round(session.stats.rebuttal_score_sum / session.stats.total_rounds)
      : 0;

    res.json({
      code: 200,
      data: {
        session_id: sessionId,
        topic: session.topic,
        topic_id: session.topic_id,
        position: session.position,
        style: session.style,
        opponent: {
          name: OPPONENT_STYLES[session.style]?.name || session.style,
          icon: OPPONENT_STYLES[session.style]?.icon || '',
          description: OPPONENT_STYLES[session.style]?.description || '',
        },
        history: session.history,
        stats: {
          total_rounds: session.stats.total_rounds || 0,
          effective_rebuttal_rate: effectiveRate,
          avg_rebuttal_score: avgScore,
          stall_count: session.stats.stall_count || 0,
        },
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      },
    });
  } catch (err) {
    logger.error('获取对练详情失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取对练详情失败',
      data: null,
    });
  }
});

module.exports = router;