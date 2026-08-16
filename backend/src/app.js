require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const db = require('./utils/db');

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

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 中间件注册 =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== 静态资源：PC 网页端 =====
// 直接访问 http://localhost:3000/ 即可打开教师管理后台，
// 避免双击 index.html 以 file:// 协议打开导致 fetch 被浏览器阻断
const pcWebPath = require('path').join(__dirname, '../../pc-web');
const fs = require('fs');
if (fs.existsSync(pcWebPath)) {
  app.use('/', express.static(pcWebPath, { extensions: ['html'], index: 'index.html' }));
  console.log(`[static] pc-web 已托管: ${pcWebPath}`);
}

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  res.json({
    code: 200,
    message: 'ok',
    data: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
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

// ===== 启动服务 =====
async function start() {
  // 初始化数据库
  try {
    if (process.env.CLOUD_ENV) {
      db.init(process.env.CLOUD_ENV);
    } else {
      logger.warn('CLOUD_ENV 未设置，数据库功能暂不可用');
    }
  } catch (err) {
    logger.error('数据库初始化失败', { error: err.message });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`辩论平台API服务已启动: http://0.0.0.0:${PORT}`);
    console.log(`\n  🚀 服务已启动: http://localhost:${PORT}`);
    console.log(`  📊 健康检查: http://localhost:${PORT}/api/health\n`);
  });
}

start();