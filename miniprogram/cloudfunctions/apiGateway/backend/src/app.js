require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const db = require('./utils/db');
const authStore = require('./services/authStore');
const { isTencentSmsConfigured } = require('./services/smsService');

// 路由
const authRouter = require('./routes/auth');
const generateRouter = require('./routes/generate');
const evaluateRouter = require('./routes/evaluate');
const debateRouter = require('./routes/debate');
const growthRouter = require('./routes/growth');
const topicsRouter = require('./routes/topics');
const portfolioRouter = require('./routes/portfolio');
const tournamentRouter = require('./routes/tournament');
const commentsRouter = require('./routes/comments');
const assignmentsRouter = require('./routes/assignments');
const speechToTextRouter = require('./routes/speechToText');
const exportRouter = require('./routes/export');
const usersRouter = require('./routes/users');

function createApp({ includeStatic = true } = {}) {
  const app = express();

  // ===== 中间件注册 =====
  app.use(cors());
  app.use(express.json({ limit: '32mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ===== 静态资源：PC 网页端 =====
  // 云函数只承载 API，不加载 PC 网页静态资源。
  const pcWebPath = require('path').join(__dirname, '../../pc-web');
  const fs = require('fs');
  if (includeStatic && fs.existsSync(pcWebPath)) {
    app.use('/', express.static(pcWebPath, { extensions: ['html'], index: 'index.html' }));
    console.log(`[static] pc-web 已托管: ${pcWebPath}`);
  }

  // 请求日志
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  // ===== 健康检查 =====
  async function getDependencyChecks() {
    const production = db.isProductionEnvironment();
    const [database, auth] = await Promise.all([
      db.isAvailable(),
      authStore.checkReady(),
    ]);
    const checks = {
      database,
      auth: auth.ready,
      ai: Boolean(process.env.DOUBAO_API_KEY && process.env.DOUBAO_API_URL),
      speech: Boolean(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY),
      sms: !production || isTencentSmsConfigured(),
    };
    return { checks, ready: Object.values(checks).every(Boolean), authError: auth.error || null };
  }

  app.get('/api/health', async (req, res) => {
    try {
      const dependency = await getDependencyChecks();
      return res.json({
        code: 200,
        message: dependency.ready ? 'ok' : 'degraded',
        data: {
          status: 'running',
          ready: dependency.ready,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          ...dependency.checks,
          auth_error: dependency.authError,
        },
      });
    } catch (err) {
      return res.json({
        code: 200,
        message: 'degraded',
        data: {
          status: 'running',
          ready: false,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          database: false,
          auth: false,
          ai: false,
          speech: false,
          sms: false,
          auth_error: err.message,
        },
      });
    }
  });

  app.get('/api/ready', async (req, res) => {
    const dependency = await getDependencyChecks();
    return res.status(dependency.ready ? 200 : 503).json({
      code: dependency.ready ? 200 : 503,
      message: dependency.ready ? 'ready' : '服务尚未满足生产运行条件',
      data: { ready: dependency.ready, checks: dependency.checks, auth_error: dependency.authError },
    });
  });

  // ===== 路由注册 =====
  app.use('/api/auth', authRouter);
  app.use('/api/generate', generateRouter);
  app.use('/api/evaluate', evaluateRouter);
  app.use('/api/debate', debateRouter);
  app.use('/api/growth', growthRouter);
  app.use('/api/topics', topicsRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/tournament', tournamentRouter);
  app.use('/api/comments', commentsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/speech-to-text', speechToTextRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/users', usersRouter);

  // ===== 404 处理 =====
  app.use((req, res) => {
    res.status(404).json({
      code: 404,
      message: `接口不存在: ${req.method} ${req.path}`,
      data: null,
    });
  });

  // ===== 全局错误处理 =====
  app.use((err, req, res, next) => {
    logger.error('服务器异常', { error: err.message, stack: err.stack });
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      data: null,
    });
  });

  return app;
}

async function initializeDatabase() {
  try {
    if (process.env.CLOUD_ENV || process.env.TENCENTCLOUD_RUNENV) {
      db.init(process.env.CLOUD_ENV);
    } else {
      logger.warn('CLOUD_ENV 未设置，数据库功能暂不可用');
    }
  } catch (err) {
    logger.error('数据库初始化失败', { error: err.message });
  }
}

module.exports = { createApp, initializeDatabase };

const app = createApp();
const PORT = process.env.PORT || 3000;

// ===== 启动服务 =====
async function start() {
  await initializeDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`辩论平台API服务已启动: http://0.0.0.0:${PORT}`);
    console.log(`\n  🚀 服务已启动: http://localhost:${PORT}`);
    console.log(`  📊 健康检查: http://localhost:${PORT}/api/health\n`);
  });
}

if (require.main === module) {
  start();
}
