const logger = require('../utils/logger');

/**
 * 大模型调用服务
 * 双模型降级：豆包（主）→ 通义千问（备）
 * 超时3秒自动切换
 */

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
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ep-20260426144920-pwjqk',
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
  });

  const data = await response.json();
  return parseResult(data);
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
    return result;
  } catch (err) {
    logger.warn('豆包API调用失败，切换备用模型', { error: err.message });
  }

  // 降级到通义千问
  try {
    logger.info('调用通义千问API', { topic, position, role });
    const result = await callQwen(topic, position, role);
    logger.info('通义千问API调用成功');
    return result;
  } catch (err) {
    logger.error('所有模型调用失败，使用预设模板', { error: err.message });
  }

  // 最终兜底：预设模板
  return getTemplate(position);
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
  "full_text": "complete speech text"
}`;
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

module.exports = {
  generateArgument,
};