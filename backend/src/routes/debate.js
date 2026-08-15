const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// 预设话术映射（关键词 → 反驳句）
const presetReplies = {
  'ai': [
    'That\'s an interesting point! However, AI also needs human guidance to work properly.',
    'While AI can process data quickly, it cannot replace human creativity and empathy.',
  ],
  'environment': [
    'Protecting the environment is important, but we also need to consider economic development.',
    'Every small action counts. Recycling one plastic bottle can save enough energy to power a light bulb for 3 hours!',
  ],
  'education': [
    'Education should be fun and engaging. Learning through games can be very effective!',
    'Practice makes perfect. The more you practice, the better you become!',
  ],
  'default': [
    'That\'s a great argument! Let me think about it from another perspective.',
    'I see your point! Here\'s something else to consider.',
  ],
};

// 模拟对辩（V1简化版，仅返回预设话术）
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { topic_id, position, user_speech } = req.body;

    if (!topic_id || !user_speech) {
      return res.status(400).json({
        code: 400,
        message: '缺少必填参数: topic_id, user_speech',
        data: null,
      });
    }

    // 根据用户输入关键词匹配预设回复
    let replies = presetReplies.default;
    for (const [keyword, replyList] of Object.entries(presetReplies)) {
      if (user_speech.toLowerCase().includes(keyword)) {
        replies = replyList;
        break;
      }
    }

    const aiReply = replies[Math.floor(Math.random() * replies.length)];

    logger.info('对辩回复生成', { topic_id, position });

    res.json({
      code: 200,
      message: 'ok',
      data: { ai_reply: aiReply },
    });
  } catch (err) {
    logger.error('对辩回复失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '对辩回复失败',
      data: null,
    });
  }
});

module.exports = router;