const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const aiService = require('../services/aiService');
const security = require('../services/security');
const logger = require('../utils/logger');

/**
 * POST /api/generate
 * 生成立论框架
 * 调用链：豆包API → 降级通义千问 → 本地预设模板 → 内容安全检测
 */
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { topic_id, topic_title, position, user_role } = req.body;

    if (!topic_id || !position) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, position',
        data: null,
      });
    }

    if (!['pro', 'con'].includes(position)) {
      return res.status(400).json({
        code: 400,
        message: 'position 必须为 pro 或 con',
        data: null,
      });
    }

    // 获取辩题文本：优先使用客户端传入的 topic_title
    // 若未传入，尝试从数据库查询（数据库不可用时回退到 topic_id）
    let topic = topic_title || topic_id;

    // 调用 AI 服务生成立论（内置双模型降级 + 预设模板兜底）
    const argument = await aiService.generateArgument(topic, position, user_role || 'pupil');

    // 内容安全检测：对完整文本进行安全过滤
    const safeFullText = await security.safeFilter(argument.full_text);

    // 若安全检测替换了文本，同步更新结论
    const isSafe = safeFullText === argument.full_text;
    const safeConclusion = isSafe
      ? argument.conclusion
      : '让我们换个角度思考这个问题吧！';

    logger.info('立论生成成功', {
      topic_id,
      position,
      user_role,
      isSafe,
      pointsCount: argument.points?.length || 0,
    });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        points: argument.points || [],
        conclusion: safeConclusion,
        full_text: safeFullText,
        china_elements: argument.china_elements || null,
        china_story: argument.china_story || null,
      },
    });
  } catch (err) {
    logger.error('立论生成失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '立论生成失败',
      data: null,
    });
  }
});

module.exports = router;
