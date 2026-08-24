const logger = require('../utils/logger');
const fetch = globalThis.fetch || require('node-fetch');

/**
 * 大模型调用服务
 * 双模型降级：豆包（主）→ 通义千问（备）
 * 超时3秒自动切换
 */

// 对手风格常量
const OPPONENT_STYLES = {
  data_monster: {
    id: 'data_monster',
    name: '数据狂魔型',
    description: '擅长用数据、统计和事实案例攻击你的论点',
    icon: '📊',
    personality: 'You are a data-obsessed debate opponent. You ALWAYS use statistics, studies, data points, and factual evidence. You challenge every claim with "What data supports that?" and "According to which study?"',
  },
  value_emotional: {
    id: 'value_emotional',
    name: '价值煽情型',
    description: '擅长从道德、价值观和情感层面打动听众',
    icon: '💖',
    personality: 'You are a value-driven, emotional debate opponent. You appeal to moral values, human rights, emotions, and ethical principles. You use phrases like "Think about the human impact" and "What kind of society do we want to be?"',
  },
  logic_deconstruction: {
    id: 'logic_deconstruction',
    name: '逻辑拆解型',
    description: '擅长拆解对方逻辑漏洞，寻找论证缺陷',
    icon: '🔍',
    personality: 'You are a logic-focused debate opponent. You excel at finding logical fallacies, weak assumptions, and reasoning gaps. You ask "How does that follow?" and "What\'s the logical connection here?" You break down arguments step by step.',
  },
};

// 预设模板（API完全不可用时兜底）
const templateArguments = {
  pro: [
    { title: 'Benefit', sentence: 'This is beneficial because...', translation: '这是有益的，因为...' },
    { title: 'Efficiency', sentence: 'It improves efficiency by...', translation: '它通过...提高了效率。' },
  ],
  con: [
    { title: 'Risk', sentence: 'There is a risk that...', translation: '存在...的风险。' },
    { title: 'Limitation', sentence: 'One limitation is that...', translation: '一个限制是...' },
  ],
};

const defaultChinaPerspective = {
  elements: ['中国文化经验', '长期主义', '现实生活启示'],
  story: {
    title: '愚公移山：把长期目标变成持续行动',
    background: '《列子·汤问》记载，愚公家门前有两座大山，出行十分不便。',
    story: '愚公决定带领家人持续挖山。面对质疑，他认为只要一代代坚持，山就会越来越小，最终能够改变生活环境。',
    insight: '这个故事提醒我们，面对复杂问题时，长期目标需要被拆解成具体行动。',
    debate_argument: 'A Chinese cultural story teaches us that a difficult goal can become possible when people turn long-term values into consistent action.',
    source_note: '《列子·汤问》；寓言故事，适合作为文化观点使用。',
  },
};

function normalizeChinaPerspective(result, topic) {
  const china = result.china_elements || {};
  const story = result.china_story || {};
  const elements = Array.isArray(china.keywords)
    ? china.keywords.filter(Boolean).slice(0, 5)
    : [];
  const normalizedStory = {
    title: story.title || '',
    background: story.background || '',
    story: story.story || '',
    insight: story.insight || story.debate_value || '',
    debate_argument: story.debate_argument || '',
    source_note: story.source_note || '',
  };

  if (
    elements.length === 0 ||
    !normalizedStory.title ||
    !normalizedStory.story ||
    !normalizedStory.debate_argument
  ) {
    return {
      china_elements: {
        keywords: defaultChinaPerspective.elements,
        perspective: `围绕“${topic}”提炼中国文化中的行动与责任经验`,
      },
      china_story: defaultChinaPerspective.story,
    };
  }

  return {
    china_elements: {
      keywords: elements,
      perspective: china.perspective || '从中国经验理解这个辩题',
    },
    china_story: normalizedStory,
  };
}

/**
 * 调用豆包API
 * @param {string} topic - 辩题
 * @param {'pro'|'con'} position - 立场
 * @param {'pupil'|'college'} role - 角色
 * @returns {Promise<object>}
 */
async function callDoubao(topic, position, role) {
  const apiKey = process.env.DOUBAO_API_KEY?.trim();
  const apiUrl = process.env.DOUBAO_API_URL;

  if (!apiKey) {
    throw new Error('豆包API Key未配置');
  }

  const prompt = buildPrompt(topic, position, role);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ep-20260426145829-w6lfh',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();
    return parseResult(data);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * 调用通义千问API（备用）
 */
async function callQwen(topic, position, role) {
  const apiKey = process.env.QWEN_API_KEY;
  const apiUrl = process.env.QWEN_API_URL;

  if (!apiKey) {
    throw new Error('通义千问API Key未配置');
  }

  const prompt = buildPrompt(topic, position, role);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: { messages: [{ role: 'user', content: prompt }] },
        parameters: {
          result_format: 'json',
          temperature: 0.7,
        },
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    return parseResult(data);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 生成立论（含降级逻辑）
 * @param {string} topic - 辩题
 * @param {'pro'|'con'} position - 立场
 * @param {'pupil'|'college'} role - 角色
 * @returns {Promise<object>}
 */
async function generateArgument(topic, position, role) {
  // 先尝试豆包
  try {
    logger.info('调用豆包API', { topic, position, role });
    const result = await callDoubao(topic, position, role);
    logger.info('豆包API调用成功');
    return { ...result, ...normalizeChinaPerspective(result, topic) };
  } catch (err) {
    logger.warn('豆包API调用失败，切换备用模型', { error: err.message });
  }

  // 降级到通义千问
  try {
    logger.info('调用通义千问API', { topic, position, role });
    const result = await callQwen(topic, position, role);
    logger.info('通义千问API调用成功');
    return { ...result, ...normalizeChinaPerspective(result, topic) };
  } catch (err) {
    logger.error('所有模型调用失败，使用预设模板', { error: err.message });
  }

  // 最终兜底：预设模板
  return { ...getTemplate(position), ...normalizeChinaPerspective({}, topic) };
}

/**
 * 构建提示词
 */
function buildPrompt(topic, position, role) {
  const level = role === 'pupil'
    ? 'Use simple English words suitable for primary school students (grade 3-6). Each sentence should be short and easy to read.'
    : 'Use academic English with proper argument structure.';

  return `You are a debate coach. Generate an argument framework for the topic: "${topic}".
Position: ${position}
${level}

Respond with JSON format:
{
  "points": [
    { "title": "point title", "sentence": "English sentence", "translation": "Chinese translation" }
  ],
  "conclusion": "conclusion sentence",
  "full_text": "complete speech text",
  "china_elements": {
    "keywords": ["中国元素1", "中国元素2"],
    "perspective": "这个辩题与中国经验的联系"
  },
  "china_story": {
    "title": "中国故事标题",
    "background": "故事背景，使用准确、易懂的中文",
    "story": "故事内容，包含人物、事件和冲突",
    "insight": "这个故事对辩题的启发",
    "debate_argument": "A short English argument that can be added to the speech",
    "source_note": "可靠来源或明确标注为寓言"
  }
}

The China section is mandatory. Choose a relevant Chinese historical, cultural, social, scientific, educational, or everyday-life example. Do not invent facts. Keep the story separate from the English speech and make its debate value explicit.
`;
}

/**
 * 解析AI返回结果
 */
function parseResult(data) {
  // 通义千问和豆包返回格式不同，统一解析
  let content = '';
  if (data.choices && data.choices[0]?.message?.content) {
    content = data.choices[0].message.content; // 豆包格式
  } else if (data.output?.text) {
    content = data.output.text; // 通义千问格式
  } else {
    throw new Error('无法解析AI返回数据');
  }

  // 尝试JSON修复
  try {
    return JSON.parse(content);
  } catch {
    const { jsonrepair } = require('jsonrepair');
    const repaired = jsonrepair(content);
    return JSON.parse(repaired);
  }
}

/**
 * 获取预设模板兜底
 */
function getTemplate(position) {
  const points = templateArguments[position] || templateArguments.pro;
  return {
    points,
    conclusion: 'In conclusion, we should think about this topic carefully and make the best decision.',
    full_text: points.map(p => p.sentence).join(' ') + ' In conclusion, we should think about this topic carefully.',
  };
}

/**
 * 调用豆包API进行作品集分析
 * @param {string} prompt - 自定义提示词
 * @returns {Promise<object>}
 */
async function callDoubaoCustom(prompt) {
  const apiKey = process.env.DOUBAO_API_KEY?.trim();
  const apiUrl = process.env.DOUBAO_API_URL;

  if (!apiKey) {
    throw new Error('豆包API Key未配置');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ep-20260426145829-w6lfh',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();
    return parseResult(data);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * 调用豆包流式接口，逐段返回辩论回复正文。
 * 流式接口只输出正文，评测统计由对练路由在结束时补齐。
 */
async function callDoubaoDebateStream(prompt, onToken) {
  const apiKey = process.env.DOUBAO_API_KEY?.trim();
  const apiUrl = process.env.DOUBAO_API_URL;
  if (!apiKey) throw new Error('豆包API Key未配置');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  let response;

  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ep-20260426145829-w6lfh',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`豆包流式接口异常: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';

    const consumeLine = line => {
      const normalized = line.trim();
      if (!normalized || normalized.startsWith(':')) return false;
      const payloadText = normalized.startsWith('data:')
        ? normalized.slice(5).trim()
        : normalized;
      if (!payloadText || payloadText === '[DONE]') return true;

      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch (_) {
        return false;
      }

      const delta = payload.choices?.[0]?.delta?.content
        || payload.choices?.[0]?.message?.content
        || payload.output?.text
        || '';
      if (delta) {
        reply += delta;
        onToken(delta);
      }
      return false;
    };

    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (consumeLine(line)) finished = true;
      }
      if (done) break;
    }
    if (buffer) consumeLine(buffer);

    if (!reply.trim()) throw new Error('豆包流式接口未返回正文');
    return reply.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 分析用户的思考记录（专业辩论评委视角）
 * @param {string} content - 用户的思考内容
 * @param {string} contentType - 内容类型
 * @param {string} topic - 辩题
 * @returns {Promise<object>}
 */
async function analyzePortfolio(content, contentType, topic) {
  const contentTypeMap = {
    case: '完整论点',
    argument: '单一论点',
    mechanism: '机制分析',
    clash: '反驳思路',
    question: '未解决的问题',
  };
  const contentTypeLabel = contentTypeMap[contentType] || contentType;

  const prompt = `You are a professional debate judge. Analyze the following debate thinking record:
Topic: "${topic}"
Content Type: ${contentType} (${contentTypeLabel})

Content: "${content}"

Provide feedback as a professional judge:
1. strengths (2-3 points)
2. weaknesses (1-2 points)
3. specific suggestions for improvement
4. a score (0-100)
5. a brief judge comment (2-3 sentences)
6. scores for debate ability dimensions (0-100): argument_structure, evidence_quality, logic, rebuttal, expression

Respond in JSON format:
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": ["..."],
  "judge_score": 75,
  "judge_comment": "...",
  "dimensions": {
    "argument_structure": 78,
    "evidence_quality": 70,
    "logic": 76,
    "rebuttal": 62,
    "expression": 75
  }
}`;

  // 尝试调用豆包API
  try {
    logger.info('调用豆包API进行作品集分析', { contentType, topicLength: topic.length });
    const result = await callDoubaoCustom(prompt);
    logger.info('豆包API作品集分析成功');
    return result;
  } catch (err) {
    logger.warn('豆包API作品集分析失败，使用预设模板', { error: err.message });
  }

  // 返回预设模板分析
  return getTemplatePortfolio(contentType, topic);
}

/**
 * 分析用户历史记录，确定辩论风格偏好
 * @param {Array} records - 用户历史记录数组
 * @returns {Promise<object>}
 */
async function analyzeStyle(records) {
  if (!records || records.length === 0) {
    return {
      preferred_style: { type: 'balanced', label: '均衡型', description: '暂无足够数据进行分析' },
      strength_areas: [],
      weakness_areas: [],
      recommended_focus: '继续提交思考记录以获取分析',
      recommended_tasks: [],
    };
  }

  // 构建用于AI分析的摘要
  const recordSummaries = records.slice(0, 20).map((r, i) => {
    return `Record ${i + 1}: Type=${r.content_type}, Title="${r.title}", Score=${r.ai_feedback?.judge_score || 'N/A'}`;
  }).join('\n');

  const prompt = `You are a professional debate coach. Analyze the following debate portfolio records to determine the user's debate style and provide personalized recommendations.

User's debate records (last 20):
${recordSummaries}

Analyze and respond in JSON format:
{
  "preferred_style": {
    "type": "data_driven | value_driven | logic_focused | balanced",
    "label": "e.g., 数据驱动型",
    "description": "short description of the style"
  },
  "strength_areas": ["strength 1", "strength 2", "strength 3"],
  "weakness_areas": ["weakness 1", "weakness 2"],
  "recommended_focus": "specific advice for improvement",
  "recommended_tasks": [
    { "title": "task title", "description": "task description", "type": "task_type" }
  ]
}`;

  // 尝试调用豆包API
  try {
    logger.info('调用豆包API进行风格分析', { recordCount: records.length });
    const result = await callDoubaoCustom(prompt);
    logger.info('豆包API风格分析成功');
    return result;
  } catch (err) {
    logger.warn('豆包API风格分析失败，使用规则分析', { error: err.message });
  }

  // 返回基于规则的预设分析
  return getTemplateStyle(records);
}

/**
 * 作品集分析预设模板兜底
 */
function getTemplatePortfolio(contentType, topic) {
  const templates = {
    case: {
      strengths: ['论点结构完整', '论证思路清晰'],
      weaknesses: ['可进一步丰富论据层次'],
      suggestions: ['建议加入更多数据支撑和案例佐证'],
      judge_score: 72,
      judge_comment: `作为专业评委，你的完整论点构建展现了良好的逻辑框架。在"${topic}"这个辩题上，你的论证结构基本完整，建议在论据的丰富性和层次感上进一步打磨。`,
      dimensions: { argument_structure: 80, evidence_quality: 72, logic: 76, rebuttal: 55, expression: 72 },
    },
    argument: {
      strengths: ['论点明确', '切入角度好'],
      weaknesses: ['论证深度有待加强'],
      suggestions: ['建议补充反面论点的回应'],
      judge_score: 70,
      judge_comment: `你的单一论点清晰有力，在"${topic}"这个角度上有不错的切入点。建议进一步展开论证链条，并预判可能的反驳。`,
      dimensions: { argument_structure: 74, evidence_quality: 68, logic: 75, rebuttal: 58, expression: 72 },
    },
    mechanism: {
      strengths: ['分析角度独特', '有机制思维'],
      weaknesses: ['可加强因果链的完整性'],
      suggestions: ['建议梳理完整的因果链条'],
      judge_score: 73,
      judge_comment: `你对"${topic}"的机制分析展现了良好的因果思维，能够从深层逻辑出发理解问题。建议进一步完善因果链条的完整性。`,
      dimensions: { argument_structure: 68, evidence_quality: 70, logic: 86, rebuttal: 56, expression: 70 },
    },
    clash: {
      strengths: ['反驳意识强', '切入点准确'],
      weaknesses: ['可提供更多替代方案'],
      suggestions: ['建议在反驳后给出建设性替代观点'],
      judge_score: 68,
      judge_comment: `你的反驳思路清晰，能够准确抓住"${topic}"辩题中的关键争议点。建议在指出问题的同时，提供更具建设性的替代方案。`,
      dimensions: { argument_structure: 62, evidence_quality: 66, logic: 78, rebuttal: 86, expression: 70 },
    },
    question: {
      strengths: ['善于发现关键问题', '思考有深度'],
      weaknesses: ['未形成完整论证'],
      suggestions: ['建议围绕这个问题尝试构建完整论点'],
      judge_score: 65,
      judge_comment: `你在"${topic}"辩题中提出了有价值的思考问题，这是深入辩论的重要起点。建议围绕这些问题尝试构建完整的论证框架。`,
      dimensions: { argument_structure: 55, evidence_quality: 55, logic: 70, rebuttal: 48, expression: 68 },
    },
  };

  return templates[contentType] || templates.argument;
}

/**
 * 风格分析预设模板兜底（基于规则）
 */
function getTemplateStyle(records) {
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
  const total = records.length;

  // 判断偏好风格
  let styleType = 'balanced';
  let styleLabel = '均衡型';
  let styleDescription = '你在各类型的辩论思考中都有涉及，展现了全面的辩论素养';

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

  // 推断强弱项
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

// ===== 辩论对练相关 =====

/**
 * 辩论回复预设兜底（按风格）
 */
const debateFallbackReplies = {
  data_monster: [
    "That's an interesting claim, but what data supports it? According to recent studies, the evidence is mixed at best.",
    "Without statistical evidence, your argument is just an opinion. Let me share some numbers with you.",
    "Research published in 2024 shows that only 30% of cases support your position. The data tells a different story.",
  ],
  value_emotional: [
    "But have you considered the human impact? Behind every statistic are real people whose lives are affected.",
    "What kind of society do we want to build? This isn't just about efficiency—it's about our values as a community.",
    "Think about the most vulnerable among us. Your proposal might work in theory, but in practice it could harm those who need protection most.",
  ],
  logic_deconstruction: [
    "I see a logical gap in your argument. How does your premise lead to your conclusion? The connection isn't clear.",
    "That's a false dichotomy. There are more than two options here, and you're ignoring the middle ground.",
    "Your argument commits the fallacy of hasty generalization. One example doesn't prove a pattern.",
  ],
};

/**
 * 开场白预设兜底（按风格×立场）
 */
const openingFallbackTemplates = {
  data_monster: {
    pro: "Let me start with some hard data. According to a 2024 meta-analysis published in Nature, 67% of cases show significant positive outcomes. The numbers don't lie.",
    con: "Before we get carried away, let's look at the data. A comprehensive 2023 study found that only 23% of implementations met their stated goals. The evidence raises serious questions.",
  },
  value_emotional: {
    pro: "At the heart of this debate is a simple question: what kind of future do we want to create? I believe we have a moral responsibility to choose the path that uplifts everyone.",
    con: "Before we rush into this, let's pause and think about the human cost. Progress means nothing if it leaves people behind. We must ask ourselves: is this truly just?",
  },
  logic_deconstruction: {
    pro: "Let me break this down logically. First, if we accept the premise that progress is desirable, then we must follow the chain of reasoning to its conclusion. Here's why...",
    con: "I'd like to examine the logical structure of the pro position. There are several unstated assumptions that need to be challenged before we can accept their conclusion.",
  },
};

/**
 * 构建辩论回复的提示词
 */
function buildDebatePrompt(topic, position, userSpeech, opponentStyle, history) {
  const style = OPPONENT_STYLES[opponentStyle];
  const opponentPosition = position === 'pro' ? 'con' : 'pro';

  let historyText = '';
  if (history && history.length > 0) {
    historyText = history.map((h, i) => `Round ${i + 1}: ${h.role}: ${h.content}`).join('\n');
  }

  return `You are a debate opponent. Your personality: ${style.personality}

Topic: "${topic}"
Your position: ${opponentPosition} (opposite of user's position)
Current round: ${(history ? history.length : 0) + 1}

Previous conversation:
${historyText || 'No previous conversation.'}

User just said: "${userSpeech}"

Respond in character. Keep your response to 2-3 sentences suitable for intermediate English learners.
Also evaluate the quality of the user's argument:
- is_rebuttal_effective: true/false (whether the user effectively countered your previous point)
- rebuttal_quality_score: 0-100

Respond in JSON:
{
  "reply": "your response",
  "is_rebuttal_effective": true,
  "rebuttal_quality_score": 75
}`;
}

function buildDebateStreamPrompt(topic, position, userSpeech, opponentStyle, history) {
  const style = OPPONENT_STYLES[opponentStyle];
  const opponentPosition = position === 'pro' ? 'con' : 'pro';
  const historyText = (history || []).map((h, i) => `Round ${i + 1}: ${h.role}: ${h.content}`).join('\n');

  return `You are a debate opponent. Your personality: ${style.personality}

Topic: "${topic}"
Your position: ${opponentPosition} (opposite of user's position)

Previous conversation:
${historyText || 'No previous conversation.'}

User just said: "${userSpeech}"

Reply in character in 2-3 short English sentences suitable for intermediate English learners.
Output only the reply text. Do not output JSON, labels, markdown, or analysis.`;
}

/**
 * AI辩论回复
 * @param {string} topic - 辩题
 * @param {'pro'|'con'} position - 用户立场
 * @param {string} userSpeech - 用户发言
 * @param {string} opponentStyle - 对手风格id
 * @param {Array} history - 对话历史
 * @returns {Promise<{reply: string, is_rebuttal_effective: boolean, rebuttal_quality_score: number}>}
 */
async function debateReply(topic, position, userSpeech, opponentStyle, history) {
  const prompt = buildDebatePrompt(topic, position, userSpeech, opponentStyle, history);

  // 尝试调用豆包API
  try {
    logger.info('调用豆包API进行辩论回复', { topic, position, opponentStyle });
    const result = await callDoubaoCustom(prompt);
    // 验证返回格式
    if (result && result.reply) {
      logger.info('豆包API辩论回复成功');
      return {
        reply: result.reply,
        is_rebuttal_effective: !!result.is_rebuttal_effective,
        rebuttal_quality_score: typeof result.rebuttal_quality_score === 'number' ? result.rebuttal_quality_score : 50,
      };
    }
    logger.warn('豆包API返回格式异常，使用预设兜底');
  } catch (err) {
    logger.warn('豆包API辩论回复失败，使用预设兜底', { error: err.message });
  }

  // 兜底：返回预设回复
  const fallbacks = debateFallbackReplies[opponentStyle] || debateFallbackReplies.data_monster;
  const reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  return {
    reply,
    is_rebuttal_effective: Math.random() > 0.5,
    rebuttal_quality_score: Math.floor(Math.random() * 41) + 30, // 30-70
  };
}

/**
 * 流式生成辩论回复。
 * 云托管通过 SSE 增量输出；模型不可用时仍逐段发送本地兜底文本。
 */
async function debateReplyStream(topic, position, userSpeech, opponentStyle, history, onToken) {
  const prompt = buildDebateStreamPrompt(topic, position, userSpeech, opponentStyle, history);
  try {
    logger.info('调用豆包流式API进行辩论回复', { topic, position, opponentStyle });
    const reply = await callDoubaoDebateStream(prompt, onToken);
    const score = Math.max(35, Math.min(85, 40 + Math.round(String(userSpeech || '').length / 4)));
    return {
      reply,
      is_rebuttal_effective: String(userSpeech || '').trim().length >= 20,
      rebuttal_quality_score: score,
    };
  } catch (err) {
    logger.warn('豆包流式API失败，使用本地兜底', { error: err.message });
    const fallbacks = debateFallbackReplies[opponentStyle] || debateFallbackReplies.data_monster;
    const reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    for (const chunk of reply.match(/.{1,12}/g) || [reply]) onToken(chunk);
    return {
      reply,
      is_rebuttal_effective: false,
      rebuttal_quality_score: 50,
    };
  }
}

/**
 * 构建开场白提示词
 */
function buildOpeningPrompt(topic, position, opponentStyle) {
  const style = OPPONENT_STYLES[opponentStyle];
  const opponentPosition = position === 'pro' ? 'con' : 'pro';

  return `You are a debate opponent. Your personality: ${style.personality}

Topic: "${topic}"
Your position: ${opponentPosition} (opposite of the user's position)

This is the start of a debate. Generate a strong opening statement (2-3 sentences) that reflects your personality and sets up your position. Suitable for intermediate English learners.

Respond in JSON:
{
  "opening": "your opening statement"
}`;
}

/**
 * 根据对手风格生成开场白
 * @param {string} topic - 辩题
 * @param {'pro'|'con'} position - 用户立场
 * @param {string} opponentStyle - 对手风格id
 * @returns {Promise<string>}
 */
async function generateDebateOpening(topic, position, opponentStyle) {
  const prompt = buildOpeningPrompt(topic, position, opponentStyle);

  // 尝试调用豆包API
  try {
    logger.info('调用豆包API生成辩论开场白', { topic, position, opponentStyle });
    const result = await callDoubaoCustom(prompt);
    if (result && result.opening) {
      logger.info('豆包API开场白生成成功');
      return result.opening;
    }
    logger.warn('豆包API返回格式异常，使用预设开场白');
  } catch (err) {
    logger.warn('豆包API开场白生成失败，使用预设开场白', { error: err.message });
  }

  // 兜底：返回预设开场白
  const templates = openingFallbackTemplates[opponentStyle] || openingFallbackTemplates.data_monster;
  return templates[position] || templates.pro;
}

/**
 * 分析队伍成员的互补性
 * @param {string[]} members - 用户ID数组
 * @param {string[]} memberStyles - 风格数组
 * @returns {Promise<object>}
 */
async function analyzeTeamCompatibility(members, memberStyles) {
  // 尝试调用AI API
  try {
    const stylesDesc = memberStyles.map((s, i) => `成员${i + 1}: ${s}`).join('；');
    const prompt = `You are a professional debate team formation analyst. Analyze the compatibility of the following debate team members based on their debate styles.

Members and their styles:
${stylesDesc}

Analyze and respond in JSON format:
{
  "compatibility_score": 85,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1"],
  "suggestions": ["suggestion 1"]
}

Scoring guide:
- data_driven + value_driven = 80-90 (best complementary)
- data_driven + logic_focused = 70-80
- value_driven + logic_focused = 70-80
- Same style = 40-60
- 3+ different styles = 75-85`;

    const result = await callDoubaoCustom(prompt);
    if (result && typeof result.compatibility_score === 'number') {
      logger.info('AI队伍互补性分析成功', { compatibility_score: result.compatibility_score });
      return {
        compatibility_score: result.compatibility_score,
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      };
    }
    logger.warn('AI队伍互补性分析返回格式异常，使用规则分析');
  } catch (err) {
    logger.warn('AI队伍互补性分析失败，使用规则分析', { error: err.message });
  }

  // 基于规则的兜底分析
  return getTeamCompatibilityByRules(memberStyles);
}

/**
 * 基于规则的队伍互补性分析（AI不可用时兜底）
 */
function getTeamCompatibilityByRules(memberStyles) {
  const uniqueStyles = [...new Set(memberStyles)];

  let score = 50;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (uniqueStyles.includes('data_driven') && uniqueStyles.includes('value_driven')) {
    score = 85;
    strengths.push('数据与价值双维度覆盖');
    weaknesses.push('可能在中段论证环节有重叠');
    suggestions.push('建议由数据型选手负责首轮立论，价值型选手负责总结陈词');
  } else if (uniqueStyles.includes('data_driven') && uniqueStyles.includes('logic_focused')) {
    score = 75;
    strengths.push('数据与逻辑双重保障');
    weaknesses.push('可能缺乏情感层面的感染力');
    suggestions.push('建议在论证中加入价值层面的升华');
  } else if (uniqueStyles.includes('value_driven') && uniqueStyles.includes('logic_focused')) {
    score = 75;
    strengths.push('价值高度与逻辑严谨兼备');
    weaknesses.push('可能缺乏具体数据支撑');
    suggestions.push('建议在准备阶段收集更多实证数据');
  } else if (uniqueStyles.length === 1) {
    score = 50;
    strengths.push('团队成员风格一致，配合默契度高');
    weaknesses.push('风格单一，可能缺乏多维度的论证视角');
    suggestions.push('建议引入不同风格的队员以丰富论证层次');
  } else {
    score = 70;
    strengths.push('团队成员风格多样，覆盖多个论证维度');
    weaknesses.push('需要更多磨合以形成统一论证风格');
    suggestions.push('建议在赛前进行多次模拟训练以增强默契');
  }

  return {
    compatibility_score: score,
    strengths,
    weaknesses,
    suggestions,
  };
}

module.exports = {
  generateArgument,
  analyzePortfolio,
  analyzeStyle,
  analyzeTeamCompatibility,
  OPPONENT_STYLES,
  debateReply,
  debateReplyStream,
  generateDebateOpening,
};
