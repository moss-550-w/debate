/**
 * 全流程集成测试脚本
 *
 * 模拟真实用户操作链路：
 *   登录 → 选题 → 生成立论 → 跟读评测 → 查看成长数据
 *
 * 使用方式：
 *   1. 确保后端服务已启动（node src/app.js）
 *   2. 运行：node test-flow.js
 *
 * 无论是否配置了真实 API Key，脚本都能完整运行：
 *   - 有 API Key → 调用真实 API
 *   - 无 API Key → 自动降级到预设模板/模拟数据
 */

const BASE_URL = 'http://localhost:3000/api';
const TOKEN = 'test_user_' + Date.now();

let totalTests = 0;
let passedTests = 0;

async function request(path, options = {}) {
  const url = BASE_URL + path;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
    ...options.headers,
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  return { status: response.status, headers: response.headers, data };
}

function assert(condition, label, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label} ${detail}`);
  }
}

function printDivider(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

async function run() {
  console.log(`\n  🧪 全流程集成测试`);
  console.log(`  用户 Token: ${TOKEN}`);
  console.log(`  时间: ${new Date().toISOString()}`);

  // =============================================
  // 1. 健康检查
  // =============================================
  printDivider('1. 健康检查');
  const health = await request('/health');
  assert(health.status === 200, '服务运行中', `| uptime: ${health.data?.data?.uptime?.toFixed(1)}s`);
  assert(health.data?.code === 200, '返回 code=200');
  assert(health.data?.data?.status === 'running', 'status=running');

  // =============================================
  // 2. 鉴权测试
  // =============================================
  printDivider('2. 鉴权验证');

  // 2.1 无 Token 请求
  const noAuth = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic_id: '1', position: 'pro' }),
  });
  const noAuthData = await noAuth.json();
  assert(noAuth.status === 401, '无Token被拒绝(401)', `| 实际: ${noAuth.status}`);
  assert(noAuthData.code === 401, '返回 code=401');

  // 2.2 有 Token 请求
  const withAuth = await request('/generate', {
    method: 'POST',
    body: { topic_id: '1', position: 'pro' },
  });
  assert(withAuth.status === 200, '有Token通过(200)', `| 实际: ${withAuth.status}`);

  // =============================================
  // 3. 生成立论（核心流程）
  // =============================================
  printDivider('3. 生成立论');

  // 3.1 完整参数
  const gen1 = await request('/generate', {
    method: 'POST',
    body: {
      topic_id: 'topic_001',
      topic_title: 'Should AI be used in education?',
      position: 'pro',
      user_role: 'pupil',
    },
  });
  assert(gen1.status === 200, '完整参数请求成功');
  assert(gen1.data?.code === 200, '返回 code=200');
  assert(Array.isArray(gen1.data?.data?.points), 'points 为数组');
  assert(gen1.data?.data?.points?.length > 0, '至少有一个论点');
  assert(typeof gen1.data?.data?.full_text === 'string', 'full_text 为字符串');
  assert(gen1.data?.data?.full_text?.length > 20, 'full_text 长度 > 20');

  if (gen1.data?.data?.points) {
    gen1.data.data.points.forEach((p, i) => {
      assert(p.title && p.sentence && p.translation, `论点 ${i + 1} 包含完整字段(title/sentence/translation)`);
    });
  }
  console.log(`  📝 生成结果预览:`);
  console.log(`     论点数: ${gen1.data?.data?.points?.length}`);
  console.log(`     首论点: ${gen1.data?.data?.points?.[0]?.title} - ${gen1.data?.data?.points?.[0]?.sentence?.slice(0, 60)}...`);
  console.log(`     逐字稿: ${gen1.data?.data?.full_text?.slice(0, 80)}...`);

  // 3.2 反方立场
  const gen2 = await request('/generate', {
    method: 'POST',
    body: {
      topic_id: 'topic_002',
      topic_title: 'Should students have homework every day?',
      position: 'con',
      user_role: 'pupil',
    },
  });
  assert(gen2.status === 200, '反方立场请求成功');
  assert(gen2.data?.data?.points?.length > 0, '反方论点非空');

  // 3.3 缺少参数
  const gen3 = await request('/generate', {
    method: 'POST',
    body: { topic_id: '1' },
  });
  assert(gen3.status === 400, '缺少 position 返回 400');
  assert(gen3.data?.code === 400, '返回 code=400');
  assert(gen3.data?.message?.includes('position'), '错误提示包含 position');

  // 3.4 无效立场
  const gen4 = await request('/generate', {
    method: 'POST',
    body: { topic_id: '1', position: 'invalid' },
  });
  assert(gen4.status === 400, '无效立场返回 400');

  // 3.5 大学生角色（更复杂的提示词）
  const gen5 = await request('/generate', {
    method: 'POST',
    body: {
      topic_id: 'topic_003',
      topic_title: 'Is social media good for society?',
      position: 'pro',
      user_role: 'college',
    },
  });
  assert(gen5.status === 200, 'college 角色请求成功');
  assert(gen5.data?.data?.points?.length > 0, 'college 论点非空');

  // =============================================
  // 4. 语音评测
  // =============================================
  printDivider('4. 语音评测');

  // 4.1 正常评测
  const eval1 = await request('/evaluate', {
    method: 'POST',
    body: {
      audio_base64: Buffer.from('fake audio data for testing').toString('base64'),
      ref_text: 'AI technology is changing the way we learn.',
    },
  });
  assert(eval1.status === 200, '评测请求成功');
  assert(eval1.data?.code === 200, '返回 code=200');

  const score = eval1.data?.data;
  assert(typeof score?.pronunciation === 'number', 'pronunciation 为数字');
  assert(typeof score?.fluency === 'number', 'fluency 为数字');
  assert(typeof score?.integrity === 'number', 'integrity 为数字');
  assert(typeof score?.overall === 'number', 'overall 为数字');
  assert(score.pronunciation >= 0 && score.pronunciation <= 100, 'pronunciation 在 0-100 范围');
  assert(score.overall >= 0 && score.overall <= 100, 'overall 在 0-100 范围');

  console.log(`  🎤 评测结果: 发音=${score.pronunciation} 流利度=${score.fluency} 完整度=${score.integrity} 总分=${score.overall}`);

  // 4.2 缺少参数
  const eval2 = await request('/evaluate', {
    method: 'POST',
    body: { audio_base64: 'dGVzdA==' },
  });
  assert(eval2.status === 400, '缺少 ref_text 返回 400');

  // 4.3 音频超限（构造 1.2MB 二进制数据的 base64，JSON 体约 1.6MB < 2MB 限制）
  const eval3 = await request('/evaluate', {
    method: 'POST',
    body: {
      audio_base64: Buffer.alloc(Math.round(1.2 * 1024 * 1024)).toString('base64'),
      ref_text: 'test',
    },
  });
  assert(eval3.status === 400, '音频超限返回 400');
  assert(eval3.data?.message?.includes('1MB'), '提示包含 1MB');

  // =============================================
  // 5. 模拟对辩
  // =============================================
  printDivider('5. 模拟对辩');

  // 5.1 关键词匹配 "environment"
  const debate1 = await request('/debate', {
    method: 'POST',
    body: { topic_id: '1', user_speech: 'I think protecting the environment is very important' },
  });
  assert(debate1.status === 200, '对辩请求成功');
  assert(debate1.data?.data?.ai_reply?.length > 0, '回复非空');
  console.log(`  💬 用户输入: "protecting the environment"`);
  console.log(`  🤖 AI回复: "${debate1.data?.data?.ai_reply}"`);

  // 5.2 默认匹配（无关键词）
  const debate2 = await request('/debate', {
    method: 'POST',
    body: { topic_id: '1', user_speech: 'This is a random statement' },
  });
  assert(debate2.status === 200, '默认匹配成功');
  assert(debate2.data?.data?.ai_reply?.length > 0, '默认回复非空');

  // 5.3 缺少参数
  const debate3 = await request('/debate', {
    method: 'POST',
    body: { topic_id: '1' },
  });
  assert(debate3.status === 400, '缺少 user_speech 返回 400');

  // =============================================
  // 6. 成长数据
  // =============================================
  printDivider('6. 成长数据');

  const growth = await request('/growth/user1');
  assert(growth.status === 200, '成长数据请求成功');
  assert(growth.data?.code === 200, '返回 code=200');

  const gData = growth.data?.data;
  assert(gData?.baseline?.pronunciation >= 0, 'baseline.pronunciation 有效');
  assert(gData?.latest?.pronunciation >= 0, 'latest.pronunciation 有效');
  assert(Array.isArray(gData?.history), 'history 为数组');
  assert(gData?.stats?.totalCount >= 0, 'stats.totalCount 有效');

  console.log(`  📊 前测: ${JSON.stringify(gData?.baseline)}`);
  console.log(`  📊 后测: ${JSON.stringify(gData?.latest)}`);
  console.log(`  📊 记录数: ${gData?.history?.length}, 总次数: ${gData?.stats?.totalCount}`);

  // =============================================
  // 7. 限流测试
  // =============================================
  printDivider('7. 限流验证');

  const limitToken = 'rate_limit_test_' + Date.now();
  let limited = false;

  for (let i = 0; i < 22; i++) {
    const resp = await fetch(`${BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${limitToken}`,
      },
      body: JSON.stringify({ topic_id: '1', position: 'pro' }),
    });
    const remaining = resp.headers.get('X-RateLimit-Remaining');

    if (resp.status === 429) {
      limited = true;
      console.log(`  🚫 第 ${i + 1} 次请求触发限流 | 状态码: 429`);
      break;
    }

    if (i === 0) console.log(`  ✅ 首次请求通过 | 剩余: ${remaining}`);
    if (i === 19) console.log(`  ✅ 第 20 次请求通过 | 剩余: ${remaining}`);
  }

  assert(limited, '连续调用 20 次后触发限流(429)');

  // =============================================
  // 8. 404 与错误处理
  // =============================================
  printDivider('8. 错误处理');

  const notFound = await fetch(`${BASE_URL}/nonexistent`);
  const notFoundData = await notFound.json();
  assert(notFound.status === 404, '不存在的接口返回 404');
  assert(notFoundData.code === 404, '返回 code=404');
  assert(notFoundData.message?.includes('不存在'), '提示信息包含"不存在"');

  // =============================================
  // 汇总
  // =============================================
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  📋 测试汇总`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  总用例: ${totalTests}`);
  console.log(`  通过:   ${passedTests} ✅`);
  console.log(`  失败:   ${totalTests - passedTests} ${totalTests === passedTests ? '✅' : '❌'}`);
  console.log(`  通过率: ${passRate}%`);
  console.log(`\n  ${totalTests === passedTests ? '🎉 全部通过！' : '⚠️  存在失败的测试用例'}`);
  console.log();
}

run().catch(err => {
  console.error('\n❌ 测试脚本异常:', err.message);
  console.error('请确保后端服务已启动: node src/app.js');
  process.exit(1);
});