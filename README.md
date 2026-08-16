# 英语辩论能力训练平台 (Debate Training Platform)

> 为小学生提供 AI 辅助的英语立论与跟读训练，通过前后测对比验证能力提升。

---

## 项目概述

### 目标

帮助小学生通过 AI 辅助的辩论训练提升英语口语表达能力，包含：

- **立论生成**：AI 根据辩题自动生成结构化论点（适合小学生英语水平）
- **跟读评测**：录音后由语音评测 API 打分（发音、流利度、完整度）
- **AI 对辩**：语音输入辩题，AI 自动生成反驳论点
- **成长看板**：ECharts 雷达图展示五维能力的前后测对比
- **辩题库**：81 条 BP（British Parliamentary）正式辩论赛题，覆盖教育、科技、社会、环境四大类

### 交付范围

| 端 | 用户 | 核心功能 |
|------|------|----------|
| 微信小程序 | 小学生 | 登录 → 选题 → 立论生成 → 录音评测 → 查看成长 |
| PC Web 端 | 教师/管理员 | 手机号+验证码登录 → 辩题管理 → 数据看板 → CSV 导出 |

---

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| PC 前端 | 原生 HTML + CSS + JavaScript | 零构建，直接打开，ECharts v5 看板 |
| 小程序 | 微信原生开发 | 使用 `wx.getRecorderManager` 录音 |
| 后端 | Node.js v18 + Express | 路由 `/api/*`，同时托管 PC Web 静态资源 |
| 数据库 | 微信云开发 NoSQL | 云托管内 `wx-server-sdk` 免密钥直连 |
| 部署 | 微信云托管（Docker） | `node:18-slim` 镜像，0~1 实例弹性伸缩 |
| AI 模型 | 豆包（主）+ 通义千问（备） | 双模型降级，JSON Mode |
| 语音评测 | 百度智能云 | Base64 直传，四维评分（发音/流利度/完整度/总分） |

---

## 项目结构

```
debate/
├── Dockerfile                    # 云托管构建文件
├── cloudbaserc.json              # 云托管部署配置
├── deploy-cloudbase.bat          # CLI 部署脚本（备用）
├── pc-web/                       # PC 端管理后台
│   ├── index.html
│   ├── css/style.css             # 专业蓝主题
│   └── js/
│       ├── config.js             # API 地址配置
│       ├── auth.js               # 登录（手机号+验证码）
│       ├── debate.js             # 辩题管理 + 立论生成
│       ├── growth.js             # 雷达图 + 统计看板
│       ├── tournament.js         # 辩论赛管理
│       ├── comments.js           # 人工点评
│       └── utils.js              # 工具函数
├── miniprogram/                  # 微信小程序
│   ├── pages/
│   │   ├── index/                # 首页
│   │   ├── topic/                # 辩题列表
│   │   ├── practice/             # 立论练习
│   │   ├── speech/               # 跟读评测
│   │   ├── sparring/             # AI 对辩
│   │   ├── portfolio/            # 练习记录
│   │   ├── tournament/           # 辩论赛
│   │   └── profile/              # 个人成长
│   ├── utils/
│   │   ├── request.js            # wx.request 封装
│   │   └── cloud.js              # 云函数调用
│   └── app.js
├── backend/                      # Node.js + Express 后端
│   ├── src/
│   │   ├── app.js                # 入口（含 PC Web 静态托管）
│   │   ├── routes/
│   │   │   ├── auth.js           # 认证（发送验证码/登录/Token校验）
│   │   │   ├── generate.js       # 立论生成
│   │   │   ├── evaluate.js       # 语音评测
│   │   │   ├── debate.js         # 模拟对辩
│   │   │   ├── growth.js         # 成长数据
│   │   │   ├── topics.js         # 辩题管理
│   │   │   ├── portfolio.js      # 练习记录
│   │   │   ├── tournament.js     # 辩论赛
│   │   │   ├── comments.js       # 点评
│   │   │   ├── assignments.js    # 作业
│   │   │   ├── speechToText.js   # 语音转文字
│   │   │   └── export.js         # CSV 导出
│   │   ├── services/
│   │   │   ├── authStore.js      # 认证存储适配层（云库/本地JSON）
│   │   │   ├── aiService.js      # 大模型调用（双模型降级）
│   │   │   ├── evaluateService.js # 百度语音评测
│   │   │   ├── persistentStore.js # 通用持久化存储
│   │   │   ├── practiceStore.js   # 练习记录存储
│   │   │   └── security.js       # 内容安全检测
│   │   ├── middleware/
│   │   │   ├── auth.js           # Token 校验
│   │   │   └── rateLimit.js      # 限流
│   │   └── utils/
│   │       ├── db.js             # 云数据库操作封装
│   │       └── logger.js         # 日志
│   ├── scripts/
│   │   └── export-jsonl.js       # 导出云库导入文件
│   ├── .env.example              # 环境变量模板
│   ├── gen-icons.js              # 图标生成工具
│   ├── seed-topics.js            # 辩题种子数据导入
│   ├── topics-seed.json          # 81 条辩题种子数据
│   ├── test-flow.js              # 集成测试（48 用例）
│   └── package.json
├── doc/                          # 设计文档
│   ├── design.md                 # 技术方案
│   ├── agent.md                  # AI 开发指引
│   └── plan.md                   # Sprint 执行计划
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
- 豆包 API Key（火山引擎 Ark）
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
```

服务启动后：
- API 地址：`http://localhost:3000/api`
- PC Web 管理后台：`http://localhost:3000/`（由 Express 静态托管，无需单独打开 HTML）

### 2. PC 前端

直接访问 `http://localhost:3000/`，使用手机号+验证码登录。

- 验证码由服务端随机生成，通过接口 `dev_code` 字段返回（未接入短信渠道时）
- 验证码 5 分钟有效，60 秒重发间隔，每日每号 10 次上限
- 首次登录自动注册，Token 7 天有效

### 3. 小程序

在微信开发者工具中打开 `miniprogram/` 目录，配置 `appid` 和云环境 ID 后编译运行。

### 4. 导入辩题数据

```bash
cd backend
node seed-topics.js
# 在云开发控制台 → 数据库 → topics 集合 → 导入生成的 topics-seed.json
```

---

## 认证体系

### 流程

```
手机号 → 获取验证码 → 填入验证码 → 登录/注册 → 获得 Token
                                              ↓
                                    后续请求携带 Token（Authorization: Bearer）
```

### 安全机制

| 机制 | 说明 |
|------|------|
| 验证码哈希 | 服务端仅存储 `SHA256(code + phone)`，明文不落库 |
| 一次性使用 | 验证通过后立即删除，防止重放 |
| 尝试次数限制 | 单个验证码最多 5 次错误尝试，超限作废 |
| 发送频率限制 | 60 秒重发间隔，每日每号 10 次上限 |
| Token 过期 | 7 天有效期，过期自动清除 |

### 存储适配

`authStore.js` 实现双模式存储，接口统一：

| 环境 | 存储方式 | 判定条件 |
|------|----------|----------|
| 云托管（生产） | 云数据库 `users` / `auth_tokens` / `auth_codes` | `TENCENTCLOUD_RUNENV` 注入 + db 连通 |
| 本地开发 | `auth-store.json` | 云库不可用时自动回退 |
| 强制本地 | 环境变量 `AUTH_STORAGE=local` | 回滚用 |

---

## API 文档

**Base URL**: `http://localhost:3000/api`

**统一响应格式**:
```json
{ "code": 200, "message": "ok", "data": {} }
```

### 认证接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/auth/send-code` | 发送验证码 `{phone}` | 否 |
| POST | `/auth/login` | 验证码登录 `{phone, code}` | 否 |
| GET | `/auth/verify` | 校验 Token 有效性 | Bearer Token |

### 核心接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 否 |
| GET | `/topics` | 辩题列表（`?category=&difficulty=&keyword=&page=&size=`） | 否 |
| GET | `/topics/:id` | 辩题详情 | 否 |
| POST | `/generate` | 生成立论框架 | 是 |
| POST | `/evaluate` | 语音评测 | 是 |
| POST | `/debate` | 模拟对辩 | 是 |
| POST | `/speech-to-text` | 语音转文字 | 是 |
| GET | `/growth/:userId` | 成长数据聚合 | 是 |
| GET | `/portfolio` | 练习记录列表 | 是 |
| POST | `/portfolio` | 新增练习记录 | 是 |
| GET | `/tournament` | 辩论赛列表 | 是 |
| GET | `/comments` | 点评列表 | 是 |
| GET | `/export` | CSV 数据导出 | 是 |

---

## 数据库设计

### 核心集合

| 集合 | 用途 | 说明 |
|------|------|------|
| `users` | 用户信息 | PC 用户 `source='pc'` 以 phone 关联；小程序用户以 openid 关联 |
| `topics` | 辩题库 | 81 条 BP 辩题，含 category/difficulty/vocab_list |
| `practice_records` | 练习记录 | 关联 user_id + topic_id，含评分和文本内容 |
| `assessments` | 前后测 | baseline / milestone 类型 |
| `comments` | 人工点评 | 教师对学生练习的点评 |

### 认证集合（云托管环境）

| 集合 | 用途 | 权限 |
|------|------|------|
| `auth_codes` | 验证码（哈希存储，5 分钟过期） | 所有用户不可读写 |
| `auth_tokens` | 登录 Token（7 天过期） | 所有用户不可读写 |

---

## 部署指南

### 微信云托管（推荐）

通过云开发控制台 Web 界面部署：

1. 打包源码（不含 node_modules）：
```powershell
cd D:\CODE\Debate
New-Item -ItemType Directory -Path deploy-tmp -Force
Copy-Item Dockerfile, .dockerignore deploy-tmp\
New-Item -ItemType Directory -Path deploy-tmp\backend -Force
Copy-Item backend\package.json, backend\package-lock.json deploy-tmp\backend\
Copy-Item backend\src deploy-tmp\backend\src -Recurse
Compress-Archive -Path deploy-tmp\* -DestinationPath debate-api-deploy.zip -Force
Remove-Item -Recurse -Force deploy-tmp
```

2. 云开发控制台 → 云托管 → debate-api 服务 → 新建版本 → 上传 `debate-api-deploy.zip`
3. 端口配置 `3000`，CPU 0.5核 / 内存 1GB
4. 部署成功后，在「服务配置 → 环境变量」注入：
   - `DOUBAO_API_KEY`、`BAIDU_API_KEY`、`BAIDU_SECRET_KEY`
   - `AUTH_DEV_CODE=1`（未接入短信时保持验证码回显）
5. 将默认域名更新到 `pc-web/js/config.js` 的 `API_BASE_URL`

### 本地开发

```bash
cd backend
npm install
cp .env.example .env   # 填入 API Key
npm start              # http://localhost:3000
```

---

## 风险与应对

| 风险 | 应对策略 |
|------|----------|
| 大模型返回非 JSON | `jsonrepair` 自动修复 + 预设模板兜底 |
| 大模型 API 不可用 | 双模型降级（豆包 → 通义千问 → 本地规则） |
| 语音评测 API 限流 | 同一参考文本 1 小时内缓存 |
| 云托管实例回收 | 用户/Token 数据存云数据库，不依赖本地文件 |
| 数据库查询慢 | `skip/limit` 分页 + 前端加载占位 |

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