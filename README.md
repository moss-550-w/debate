# 英语辩论能力训练平台 (Debate Training Platform)

> 为小学生提供 AI 辅助的英语立论与跟读训练，通过前后测对比验证能力提升。
>
> 4 人团队 · 6 周交付 · 月费用 < 100 元

---

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [API 文档](#api-文档)
- [数据库设计](#数据库设计)
- [Sprint 计划](#sprint-计划)
- [部署指南](#部署指南)
- [风险与应对](#风险与应对)

---

## 项目概述

### 目标

帮助小学生通过 AI 辅助的辩论训练提升英语口语表达能力，包含：

- **立论生成**：AI 根据辩题自动生成结构化论点（适合小学生英语水平）
- **跟读评测**：录音后由语音评测 API 打分（发音、流利度、完整度）
- **成长看板**：ECharts 雷达图展示五维能力（发音/流利度/逻辑/词汇/反应）的前后测对比
- **辩题库**：81 条 BP（British Parliamentary）正式辩论赛题，覆盖教育、科技、社会、环境四大类

### 交付范围

| 端 | 用户 | 核心功能 |
|------|------|----------|
| 微信小程序 | 小学生 | 登录 → 选题 → 立论生成 → 录音评测 → 查看成长 |
| PC Web 端 | 教师/管理员 | 登录 → 辩题管理 → 数据看板 → CSV 导出 |

### 关键约束

- 未成年人保护合规（监护人手机加密、隐私协议、数据最小化）
- 低成本（月费用 < 100 元）
- 快速迭代（6 周 MVP）

---

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| PC 前端 | 原生 HTML + CSS + JavaScript | 零构建，直接打开，ECharts v5 看板 |
| 小程序 | 微信原生开发 | 使用 `wx.getRecorderManager` 录音 |
| 后端主服务 | Node.js v18 + Express | 常驻内存，解决冷启动，方便调试 AI |
| 后端辅助 | 微信云函数 | 仅处理登录 Token、基础查询 |
| 数据库 | 微信云开发 NoSQL（5 集合） | 与微信无缝集成 |
| AI 模型 | 豆包（主）+ 通义千问（备） | 免费额度充足，支持 JSON Mode |
| 语音评测 | 百度智能云 | 支持 Base64 直传，维度精细 |
| 部署 | 轻量服务器（2 核 2G） | 约 10 元/月（学生优惠） |

---

## 项目结构

```
debate/
├── README.md                     # 本文件
├── doc/
│   ├── design.md                 # 技术方案（V2.0 务实迭代版）
│   ├── agent.md                  # AI 开发指引
│   └── plan.md                   # 执行计划（Sprint 拆解）
├── pc-web/                       # PC 端管理后台
│   ├── index.html                # 主页面（登录 + 管理后台）
│   ├── css/
│   │   ├── style.css             # 专业蓝主题
│   │   └── theme-kids.css        # 儿童黄主题（大字体适配）
│   ├── js/
│   │   ├── config.js             # 环境配置
│   │   ├── utils.js              # API 请求封装 + 工具函数
│   │   ├── auth.js               # 登录/登出/菜单切换/主题切换
│   │   ├── debate.js             # 辩题管理 + 立论生成 + CSV 导出
│   │   └── growth.js             # 雷达图 + 统计看板 + 练习记录
│   └── assets/                   # 静态资源
├── miniprogram/                  # 微信小程序
│   ├── pages/
│   │   ├── index/                # 首页（三大入口卡片）
│   │   ├── topic/                # 辩题列表与详情
│   │   ├── practice/             # 立论练习（AI 生成）
│   │   ├── speech/               # 跟读评测（录音 + 评分）
│   │   └── profile/              # 个人成长（雷达图）
│   ├── components/               # 复用组件
│   ├── utils/
│   │   ├── request.js            # wx.request 封装
│   │   └── cloud.js              # 云函数调用封装
│   ├── app.js / app.json
│   └── project.config.json
├── backend/                      # Node.js + Express 后端
│   ├── src/
│   │   ├── app.js                # 入口
│   │   ├── routes/
│   │   │   ├── generate.js       # 立论生成
│   │   │   ├── evaluate.js       # 语音评测
│   │   │   ├── debate.js         # 模拟对辩
│   │   │   ├── growth.js         # 成长数据聚合
│   │   │   └── topics.js         # 辩题列表查询
│   │   ├── services/
│   │   │   ├── aiService.js      # 大模型调用（双模型降级 + json-repair）
│   │   │   ├── evaluateService.js # 百度语音评测
│   │   │   └── security.js       # 内容安全检测
│   │   ├── middleware/
│   │   │   ├── auth.js           # Token 校验
│   │   │   └── rateLimit.js      # 限流（每日 20 次）
│   │   └── utils/
│   │       ├── logger.js         # 日志
│   │       └── db.js             # 云数据库操作封装
│   ├── .env.example              # 环境变量模板
│   ├── topics-seed.json          # 81 条辩题种子数据
│   ├── seed-topics.js            # 种子数据导入脚本
│   ├── test-flow.js              # 48 用例集成测试
│   └── package.json
└── cloudfunctions/               # 微信云函数
    ├── userLogin/                # 登录
    ├── getTopicList/             # 辩题分页
    └── uploadFile/               # 云存储上传凭证
```

---

## 快速开始

### 前置条件

- Node.js v18+
- 微信开发者工具（小程序开发）
- 火山引擎 Ark 账号（豆包 API）
- 百度智能云账号（语音评测 API）

### 1. 后端启动

```bash
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入真实 API Key

# 启动服务
npm start
# 或使用 PM2（生产环境）
pm2 start src/app.js --name debate-api
```

服务启动后访问 `http://localhost:3000/api/health` 验证。

### 2. PC 前端

直接用浏览器打开 `pc-web/index.html`，不需要构建工具。

登录：手机号 `13800138000`，验证码 `123456`（MVP 阶段）。

### 3. 小程序

在微信开发者工具中打开 `miniprogram/` 目录，配置 `appid` 和云环境 ID 后编译运行。

### 4. 导入辩题数据

```bash
cd backend
node seed-topics.js
# 生成 topics-seed.json
# 在微信开发者工具 → 云开发 → 数据库 → topics 集合 → 导入
```

---

## API 文档

**Base URL**: `http://localhost:3000/api`

**统一响应格式**:
```json
{
  "code": 200,
  "message": "ok",
  "data": {}
}
```

**错误码**: 400（参数错误）、401（未授权）、403（无权限）、429（限流）、500（服务器错误）

### 核心接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 否 |
| GET | `/topics` | 辩题列表（支持 category/difficulty/keyword/page/size） | 否 |
| GET | `/topics/:id` | 辩题详情 | 否 |
| POST | `/generate` | 生成立论框架 | 是 |
| POST | `/evaluate` | 语音评测 | 是 |
| POST | `/debate` | 模拟对辩（预设话术） | 是 |
| GET | `/growth/:userId` | 成长数据聚合 | 是 |

### 生成立论

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <openid>" \
  -d '{
    "topic_id": "topic_edu_001",
    "topic_title": "Should AI be used in education?",
    "position": "pro",
    "user_role": "pupil"
  }'
```

### 语音评测

```bash
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <openid>" \
  -d '{
    "audio_base64": "<base64_encoded_audio>",
    "ref_text": "Good morning, judges and friends..."
  }'
```

---

## 数据库设计

5 张集合，全部使用 `snake_case` 字段名：

| 集合 | 用途 | 核心字段 |
|------|------|----------|
| `users` | 用户信息 | `openid`, `role`, `ability_baseline`, `ability_latest`, `guardian_phone` |
| `topics` | 辩题库 | `title`, `category`, `difficulty`, `vocab_list`, `background`, `status` |
| `practice_records` | 练习记录 | `user_id`, `topic_id`, `type`, `score`, `text_content`, `duration` |
| `assessments` | 前后测 | `user_id`, `type`(baseline/milestone), `score` |
| `comments` | 人工点评 | `pupil_id`, `college_id`, `content`, `status` |

---

## Sprint 计划

| Sprint | 周期 | 交付物 | 状态 |
|--------|------|--------|------|
| Sprint 1 | 第 1-2 周 | 环境搭建、数据库建表、后端基础服务、前端骨架 | ✅ 已完成 |
| Sprint 2 | 第 3-4 周 | 立论生成、语音评测、模拟对辩、核心闭环 | ✅ 已完成 |
| Sprint 3 | 第 5-6 周 | 数据看板、CSV 导出、双主题切换、全流程测试 | ✅ 已完成 |

详见 [doc/plan.md](doc/plan.md)。

---

## 部署指南

### 后端（轻量服务器）

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 部署
git clone <repo> /opt/debate
cd /opt/debate/backend
npm install --production
cp .env.example .env
# 编辑 .env 填入真实值

# PM2 管理
npm install -g pm2
pm2 start src/app.js --name debate-api
pm2 save
pm2 startup
```

### PC 前端（云开发静态托管）

将 `pc-web/` 目录上传至微信云开发静态托管，绑定自定义域名（需备案）。

### 云函数

在微信开发者工具中右键云函数目录 → 上传并部署（云端安装依赖）。

---

## 风险与应对

| 风险 | 应对策略 |
|------|----------|
| 大模型返回非 JSON | `json-repair` 自动修复 + 预设模板兜底 |
| 大模型 API 不可用 | 双模型降级（豆包 → 通义千问 → 本地规则引擎） |
| 语音评测 API 限流 | 同一参考文本 1 小时内缓存，不重复评测 |
| 小程序审核驳回 | 删除"社交排名"等敏感词，以工具类目提交 |
| 服务器宕机 | 云函数作为备用评测通道（保底方案） |
| 数据库查询慢 | `skip/limit` 分页 + 前端"加载中"占位 |

---

## 测试

```bash
cd backend
node test-flow.js
# 48 个测试用例，覆盖所有接口和边界情况
```

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

版权所有 (c) 2026 Debate Training Platform