const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const rateLimitMiddleware = require('../middleware/rateLimit');
const aiService = require('../services/aiService');
const portfolioStore = require('../services/portfolioStore');
const logger = require('../utils/logger');

// 内容类型列表
const VALID_CONTENT_TYPES = ['case', 'argument', 'mechanism', 'clash', 'question'];
const VALID_POSITIONS = ['pro', 'con'];

/**
 * POST /api/portfolio
 * 提交思考记录
 */
router.post('/', authMiddleware, rateLimitMiddleware, async (req, res) => {
  try {
    const { content_type, title, content, position } = req.body;
    const topic_id = String(req.body.topic_id || '').trim() || 'general';
    const topic_title = String(req.body.topic_title || '').trim() || '自主思考';

    // 辩题关联可选，标题和内容必须提供。
    if (!content_type || !VALID_CONTENT_TYPES.includes(content_type)) {
      return res.status(400).json({
        code: 400,
        message: `无效的 content_type，可选值: ${VALID_CONTENT_TYPES.join(', ')}`,
        data: null,
      });
    }
    if (!title) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: title', data: null });
    }
    if (!content) {
      return res.status(400).json({ code: 400, message: '缺少必填参数: content', data: null });
    }
    if (!position || !VALID_POSITIONS.includes(position)) {
      return res.status(400).json({
        code: 400,
        message: `无效的 position，可选值: ${VALID_POSITIONS.join(', ')}`,
        data: null,
      });
    }

    // 调用 AI 分析用户的思考内容
    const userId = req.user.userId || req.user.openid;
    let aiFeedback;
    try {
      aiFeedback = await aiService.analyzePortfolio(content, content_type, topic_title);
      logger.info('AI 作品集分析成功', { userId, content_type });
    } catch (err) {
      logger.warn('AI 作品集分析失败，使用预设反馈', { error: err.message });
      aiFeedback = {
        strengths: ['内容完整', '思路清晰'],
        weaknesses: ['可进一步深化论证'],
        suggestions: ['建议补充更多论据支撑'],
        judge_score: 70,
        judge_comment: '你的思考有一定深度，继续努力完善论证结构会更好。',
      };
    }

    // 创建记录
    const record = {
      user_id: userId,
      topic_id,
      topic_title,
      content_type,
      title,
      content,
      position,
      ai_feedback: aiFeedback,
      created_at: new Date().toISOString(),
    };

    const savedRecord = await portfolioStore.record(record);

    logger.info('思考记录提交成功', { userId, recordId: savedRecord._id, content_type });

    res.json({
      code: 200,
      message: 'ok',
      data: savedRecord,
    });
  } catch (err) {
    logger.error('提交思考记录失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '提交思考记录失败',
      data: null,
    });
  }
});

/**
 * GET /api/portfolio/:userId
 * 获取作品集列表
 */
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const size = parseInt(req.query.size, 10) || 10;
    const contentType = req.query.content_type;

    // 安全校验：只能查看自己的作品集
    const currentUserId = req.user.userId || req.user.openid;
    if (currentUserId !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权访问其他用户的作品集',
        data: null,
      });
    }

    // 获取用户记录
    let records = await portfolioStore.listByUser(userId);

    // 内容类型筛选
    if (contentType && VALID_CONTENT_TYPES.includes(contentType)) {
      records = records.filter(r => r.content_type === contentType);
    }

    // 按时间倒序排列
    records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const total = records.length;
    const totalPages = Math.ceil(total / size);
    const startIdx = (page - 1) * size;
    const paginatedRecords = records.slice(startIdx, startIdx + size);

    logger.info('作品集列表获取成功', { userId, total, page, size });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        records: paginatedRecords,
        pagination: {
          page,
          size,
          total,
          totalPages,
        },
      },
    });
  } catch (err) {
    logger.error('获取作品集列表失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取作品集列表失败',
      data: null,
    });
  }
});

/**
 * GET /api/portfolio/:userId/analysis
 * 获取用户风格分析
 */
router.get('/:userId/analysis', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // 安全校验：只能查看自己的分析
    const currentUserId = req.user.userId || req.user.openid;
    if (currentUserId !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权访问其他用户的分析数据',
        data: null,
      });
    }

    const records = await portfolioStore.listByUser(userId);

    if (records.length === 0) {
      // 没有记录时返回默认分析
      return res.json({
        code: 200,
        message: 'ok',
        data: {
          preferred_style: { type: 'balanced', label: '均衡型', description: '暂无足够数据进行分析，继续提交思考记录吧' },
          strength_areas: [],
          weakness_areas: [],
          recommended_focus: '建议多提交不同类型的思考记录，以便获得更准确的分析',
          recommended_tasks: [
            { title: '尝试撰写完整论点', description: '选择一个辩题，撰写完整的 case 论点', type: 'case_practice' },
          ],
          stats: {
            total_records: 0,
            by_type: { case: 0, argument: 0, mechanism: 0, clash: 0, question: 0 },
            avg_score: 0,
          },
        },
      });
    }

    // 调用 AI 分析风格
    let styleAnalysis;
    try {
      styleAnalysis = await aiService.analyzeStyle(records);
      logger.info('AI 风格分析成功', { userId, recordCount: records.length });
    } catch (err) {
      logger.warn('AI 风格分析失败，使用规则分析', { error: err.message });
      styleAnalysis = analyzeStyleByRules(records);
    }

    // 统计信息
    const byType = { case: 0, argument: 0, mechanism: 0, clash: 0, question: 0 };
    let totalScore = 0;
    let scoreCount = 0;

    for (const r of records) {
      if (byType[r.content_type] !== undefined) {
        byType[r.content_type]++;
      }
      if (r.ai_feedback && typeof r.ai_feedback.judge_score === 'number') {
        totalScore += r.ai_feedback.judge_score;
        scoreCount++;
      }
    }

    const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

    const result = {
      ...styleAnalysis,
      stats: {
        total_records: records.length,
        by_type: byType,
        avg_score: avgScore,
      },
    };

    logger.info('风格分析获取成功', { userId });

    res.json({
      code: 200,
      message: 'ok',
      data: result,
    });
  } catch (err) {
    logger.error('获取风格分析失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取风格分析失败',
      data: null,
    });
  }
});

/**
 * GET /api/portfolio/:userId/stats
 * 获取详细统计数据
 */
router.get('/:userId/stats', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // 安全校验：只能查看自己的统计
    const currentUserId = req.user.userId || req.user.openid;
    if (currentUserId !== userId) {
      return res.status(403).json({
        code: 403,
        message: '无权访问其他用户的统计数据',
        data: null,
      });
    }

    const records = await portfolioStore.listByUser(userId);

    // 按时间倒序排列
    const sortedRecords = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // 各类型记录分布
    const byType = { case: 0, argument: 0, mechanism: 0, clash: 0, question: 0 };
    for (const r of records) {
      if (byType[r.content_type] !== undefined) {
        byType[r.content_type]++;
      }
    }

    // 评分趋势（按时间顺序）
    const scoredRecords = [...records]
      .filter(r => r.ai_feedback && typeof r.ai_feedback.judge_score === 'number')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const scoreTrend = scoredRecords.map(r => ({
      date: r.created_at,
      score: r.ai_feedback.judge_score,
      content_type: r.content_type,
      title: r.title,
    }));

    // 近7天/30天练习趋势
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const last7Days = sortedRecords.filter(r => new Date(r.created_at) >= sevenDaysAgo);
    const last30Days = sortedRecords.filter(r => new Date(r.created_at) >= thirtyDaysAgo);

    // 按日期聚合近7天/30天练习次数
    function aggregateByDate(recordsList, days) {
      const dailyCounts = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        dailyCounts[key] = 0;
      }
      for (const r of recordsList) {
        const key = r.created_at.slice(0, 10);
        if (dailyCounts[key] !== undefined) {
          dailyCounts[key]++;
        }
      }
      // 按日期升序排列
      return Object.entries(dailyCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    }

    // 平均分
    const totalScore = scoredRecords.reduce((sum, r) => sum + r.ai_feedback.judge_score, 0);
    const avgScore = scoredRecords.length > 0 ? Math.round(totalScore / scoredRecords.length) : 0;

    // 评分趋势统计
    const scoreStats = {
      avg_score: avgScore,
      max_score: scoredRecords.length > 0 ? Math.max(...scoredRecords.map(r => r.ai_feedback.judge_score)) : 0,
      min_score: scoredRecords.length > 0 ? Math.min(...scoredRecords.map(r => r.ai_feedback.judge_score)) : 0,
      trend: scoreTrend,
    };

    const result = {
      total_records: records.length,
      by_type: byType,
      practice_trend: {
        last_7_days: aggregateByDate(last7Days, 7),
        last_30_days: aggregateByDate(last30Days, 30),
      },
      scores: scoreStats,
    };

    logger.info('统计数据获取成功', { userId, totalRecords: records.length });

    res.json({
      code: 200,
      message: 'ok',
      data: result,
    });
  } catch (err) {
    logger.error('获取统计数据失败', { error: err.message });
    res.status(500).json({
      code: 500,
      message: '获取统计数据失败',
      data: null,
    });
  }
});

/**
 * 基于规则的风格分析（AI 不可用时的兜底）
 */
function analyzeStyleByRules(records) {
  if (!records || records.length === 0) {
    return {
      preferred_style: { type: 'balanced', label: '均衡型', description: '暂无足够数据进行分析' },
      strength_areas: [],
      weakness_areas: [],
      recommended_focus: '继续提交思考记录以获取分析',
      recommended_tasks: [],
    };
  }

  // 统计内容类型分布
  const typeCounts = { case: 0, argument: 0, mechanism: 0, clash: 0, question: 0 };
  let totalScore = 0;
  let scoreCount = 0;

  for (const r of records) {
    if (typeCounts[r.content_type] !== undefined) {
      typeCounts[r.content_type]++;
    }
    if (r.ai_feedback && typeof r.ai_feedback.judge_score === 'number') {
      totalScore += r.ai_feedback.judge_score;
      scoreCount++;
    }
  }

  const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

  // 判断偏好风格
  let styleType = 'balanced';
  let styleLabel = '均衡型';
  let styleDescription = '你在各类型的辩论思考中都有涉及，展现了全面的辩论素养';

  const total = records.length;
  const argumentRatio = typeCounts.argument / total;

  if (typeCounts.argument > typeCounts.case && argumentRatio > 0.4) {
    styleType = 'logic_focused';
    styleLabel = '逻辑导向型';
    styleDescription = '你擅长拆解问题，注重逻辑推理和论证结构';
  } else if (typeCounts.case > typeCounts.argument && typeCounts.case / total > 0.3) {
    styleType = 'data_driven';
    styleLabel = '数据驱动型';
    styleDescription = '你擅长用数据和事实构建完整的论点体系';
  } else if (typeCounts.mechanism > 0 && typeCounts.mechanism / total > 0.25) {
    styleType = 'value_driven';
    styleLabel = '价值驱动型';
    styleDescription = '你擅长从机制和原理层面深入分析问题';
  }

  // 根据评分推断强弱项
  const strengthAreas = [];
  const weaknessAreas = [];

  if (typeCounts.argument > 0) strengthAreas.push('论点构建能力强');
  if (typeCounts.case > 0) strengthAreas.push('完整论证能力好');
  if (typeCounts.mechanism > 0) strengthAreas.push('机制分析深入');
  if (typeCounts.clash > 0) strengthAreas.push('反驳意识强');

  if (typeCounts.question > 0 && typeCounts.question / total > 0.2) {
    weaknessAreas.push('未解决问题较多，需加强论证深度');
  }
  if (avgScore < 70) {
    weaknessAreas.push('平均评分有待提高');
  }
  if (typeCounts.case === 0) {
    weaknessAreas.push('缺少完整论点构建练习');
  }
  if (typeCounts.clash === 0) {
    weaknessAreas.push('反驳练习不足');
  }

  if (strengthAreas.length === 0) strengthAreas.push('持续练习中');
  if (weaknessAreas.length === 0) weaknessAreas.push('继续努力，追求更高水平');

  // 推荐任务
  const recommendedTasks = [];
  if (typeCounts.case === 0) {
    recommendedTasks.push({ title: '撰写完整论点', description: '选择一个辩题，撰写完整的 case 论点', type: 'case_practice' });
  }
  if (typeCounts.clash === 0) {
    recommendedTasks.push({ title: '反驳练习', description: '针对一个论点，尝试从不同角度进行反驳', type: 'clash_practice' });
  }
  if (typeCounts.mechanism === 0) {
    recommendedTasks.push({ title: '机制分析练习', description: '分析一个辩题背后的深层机制和原理', type: 'mechanism_practice' });
  }
  if (recommendedTasks.length === 0) {
    recommendedTasks.push({ title: '价值升华练习', description: '针对一个辩题，尝试从价值观层面进行论证', type: 'value_training' });
  }

  let recommendedFocus = '建议尝试不同类型的思考记录，全面发展辩论能力';
  if (styleType === 'data_driven') {
    recommendedFocus = '建议多练习价值层面的论证，尝试将具体论据提升到价值观层面';
  } else if (styleType === 'logic_focused') {
    recommendedFocus = '建议加强数据支撑，用具体案例增强论点说服力';
  } else if (styleType === 'value_driven') {
    recommendedFocus = '建议多练习具体论据的构建，将价值分析落实到可操作的论点';
  }

  return {
    preferred_style: { type: styleType, label: styleLabel, description: styleDescription },
    strength_areas: strengthAreas,
    weakness_areas: weaknessAreas,
    recommended_focus: recommendedFocus,
    recommended_tasks: recommendedTasks,
  };
}

module.exports = router;
