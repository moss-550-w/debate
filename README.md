# 英语辩论能力训练平台 (Debate Training Platform)

> 为小学生提供 AI 辅助的英语辩论训练，支持立论、AI 对练、语音评测、辩论作品集和成长分析。

---

## 项目概述

### 目标

帮助小学生通过 AI 辅助的辩论训练提升英语口语表达能力，包含：

- **立论生成**：AI 根据辩题自动生成结构化论点（适合小学生英语水平）
- **跟读评测**：录音后由语音评测 API 打分（发音、流利度、完整度）
- **AI 对辩**：文字输入或录音识别后，与不同风格的 AI 对手进行实时训练
- **辩论作品集**：记录论点、机制、反驳和问题，并由 AI 评委反馈
- **成长能力**：围绕论点结构、论据质量、逻辑推理、反驳回应、表达组织进行统计
- **语言表达**：独立展示发音、流利度、完整度等语音辅助数据
- **辩题库**：当前内置 86 条辩题，另含独立的“思辨中国”辩题区域

### 交付范围

| 端 | 用户 | 核心功能 |
|------|------|----------|
| 微信小程序 | 学生 | 选题 → 立论生成 → AI 对练 → 录音评测 → 作品集 → 查看成长 |
| PC Web 端 | 教师/管理员 | 用户管理 → 辩题管理 → 赛事管理 → 辩论能力看板 → CSV 导出 |

### 三角色权限

| 角色 | 标识 | 权限范围 |
|------|------|----------|
| 开发者 | `developer` | 超级管理员；管理全部用户、教师、学生、辩题、赛事、看板和导出数据。 |
| 教师 | `teacher` | 管理端管理员；仅查看其 `teacher_id` 绑定学生的数据，可管理辩题、赛事和任务。 |
| 学生 | `student` | 小程序普通用户；仅访问自己的练习、作品、赛事报名与成长数据。 |

- 小程序首次进入会通过 `apiGateway` 在共享 `users` 集合自动创建 `student` 用户；体验版与正式版使用同一云环境，PC 管理端刷新后即可查看。
- 历史 `admin`、`coach`、`pupil` 角色会在服务端分别兼容为 `developer`、`teacher`、`student`。
- PC 管理端不再允许任意手机号首次注册。开发者可在“用户列表”的“批量授权教师”面板直接预创建或授权教师手机号；也可通过云托管环境变量 `DEVELOPER_PHONES`（开发者手机号）或 `TEACHER_PHONES`（教师手机号）初始化授权，多个手机号以英文逗号分隔。
- 也可配置 `DEVELOPER_LOGIN_KEY_HASH` 使用 PC 管理端开发者密钥登录；服务端只保存密钥 SHA-256，不保存明文密钥。
- 开发者可在“用户列表”中将用户设为教师/学生、启停账户或批量授权教师；教师仅能查看已分配给自己的学生。学生分配教师可调用 `PATCH /api/users/:id/teacher`，请求体为 `{ "teacher_id": "教师用户ID" }`。
- 小程序“我的”支持手机号绑定、短信登录和完整资料维护（学校、班级、性别、出生日期、个人简介）；PC 用户列表实时展示用户变更，并每 10 秒从共享数据库核对一次。

---

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| PC 前端 | 原生 HTML + CSS + JavaScript | 零构建，直接打开，ECharts v5 看板 |
| 小程序 | 微信原生开发 | 使用 `wx.getRecorderManager` 录音 |
| PC 后端 | Node.js v18 + Express | 云托管 `debate-api`，路由 `/api/*`，同时托管 PC Web 静态资源 |
| 小程序后端 | CloudBase 云函数 | `apiGateway` 使用 `wx.cloud.callFunction` 调用相同 API 路由 |
| 数据库 | 微信云开发 NoSQL | 云托管内 `wx-server-sdk` 免密钥直连 |
| 部署 | 微信云托管（Docker） | `node:18-slim` 镜像，0~1 实例弹性伸缩 |
| AI 模型 | 豆包（主）+ 通义千问（备） | 双模型降级，JSON Mode |
| 语音评测 | 百度智能云 | 音频先上传云存储，再由云函数下载并转发，避免请求体超限 |

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
│   │   └── request.js            # wx.cloud.callFunction / wx.request 封装
│   ├── cloudfunctions/
│   │   └── apiGateway/           # Express API 云函数网关
│   │       ├── index.js          # 请求转发、音频云存储处理
│   │       ├── package.json
│   │       └── backend/           # 与云托管后端保持同步的 API 实现
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
│   │   │   ├── practiceStore.js   # 语音练习记录存储
│   │   │   ├── portfolioStore.js  # 辩论作品集存储
│   │   │   ├── debateStore.js     # AI 对练记录存储
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
│   ├── topics-seed.json          # 辩题种子数据
│   ├── test-flow.js              # 后端集成测试
│   └── package.json
├── doc/                          # 设计文档
│   ├── design.md                 # 技术方案
│   ├── agent.md                  # AI 开发指引
│   └── plan.md                   # Sprint 执行计划
└── cloudfunctions/               # 旧版云函数目录，仅保留兼容功能
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

- 已配置腾讯云短信时验证码直接发送到手机；未配置时仅开发环境可通过接口 `dev_code` 字段回显
- 验证码 5 分钟有效，60 秒重发间隔，每日每号 10 次上限
- 首次登录自动注册，Token 7 天有效

### 3. 小程序

在微信开发者工具中打开 `miniprogram/` 目录，配置 `appid` 和云环境 ID 后编译运行。

当前小程序默认使用云函数模式：

- 云环境：`cloud1-d8g0k0m526d61652a`
- 云函数：`apiGateway`
- 请求方式：`wx.cloud.callFunction`
- 音频流程：`wx.cloud.uploadFile` → 云函数下载临时文件 → 语音服务评测 → 删除临时文件

小程序前端代码修改后，需要重新编译并上传体验版；仅部署云函数不会更新页面代码。

### 4. 导入辩题数据

```bash
cd backend
node seed-topics.js
# 在云开发控制台 → 数据库 → topics 集合 → 导入生成的 topics-seed.json
```

本地开发时如果云数据库尚未创建 `topics` 集合，小程序接口会临时回退到内置种子数据；生产环境不会回退，PC 端新增、编辑、删除辩题会明确返回 CloudBase 数据库错误。生产环境应在云开发控制台创建并配置该集合。

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
| 云托管（生产） | 云数据库 `users` / `auth_tokens` / `auth_codes` | `TENCENTCLOUD_RUNENV` 注入 + db 连通；数据库不可用时直接失败 |
| 本地开发 | `auth-store.json` | 云库不可用时自动回退 |
| 强制本地 | 环境变量 `AUTH_STORAGE=local` | 回滚用 |

### 双端同步架构

```text
微信小程序
   │ wx.cloud.callFunction
   ▼
apiGateway 云函数 ─────┐
                       ├─ CloudBase NoSQL
PC 管理端 → debate-api ─┘
```

两端共享同一环境 `cloud1-d8g0k0m526d61652a`。PC 管理端看板读取小程序产生的用户、语音练习、作品集和 AI 对练数据；小程序赛事和辩题列表也读取 PC 管理端维护的共享数据。

#### 体验版用户同步

- 体验版与正式版均使用 `cloud1-d8g0k0m526d61652a`，不会因版本类型隔离用户和训练数据。
- 体验成员首次进入小程序时，客户端调用 `POST /api/auth/mini-profile`，云函数将该用户登记为 `student` 并写入共享 `users` 集合。
- PC 管理端没有实时推送；开发者刷新浏览器或重新进入“数据看板”后，会重新读取用户列表。
- 当前小程序用户由云函数上下文中的真实微信 `OPENID` 识别，服务端自动生成稳定的用户记录 ID；初始昵称通常为“小辩手”，手机号仍需另行绑定。
- 若用户未出现，应检查体验版小程序控制台是否有“同步用户资料失败”或 `apiGateway` 调用错误。

#### 批量授权教师

使用开发者密钥登录 PC 管理端后，进入“用户列表”即可看到“批量授权教师”面板：

1. 输入一个或多个 11 位手机号，支持逗号、空格或换行分隔。
2. 点击“授权为教师”。
3. 不存在的手机号会预创建为启用状态的教师账号；学生账号会提升为教师；已停用教师会重新启用。
4. 被授权人员可使用“手机号 + 验证码”登录 PC 管理端。

该操作调用 `POST /api/users/authorize-teachers`，仅 `developer` 角色可执行，单次最多处理 100 个手机号，且不会降低已有开发者账号权限。

AI 对练和作品集必须写入 `debate_turns`、`portfolio_records` 集合后才会进入双方看板；任务、教师议题和作业提交分别写入 `assignments`、`teacher_assignments`、`assignment_submissions` 集合。生产环境数据库不可用时接口会直接报错，不再回退到本地文件或内存。

---

## API 文档

**本地 Base URL**: `http://localhost:3000/api`

**当前云托管 Base URL**: `https://debate-api-297740-11-1469475059.sh.run.tcloudbase.com/api`

小程序默认不直接访问公网域名，而是调用 CloudBase 云函数 `apiGateway`。PC 管理端通过 `pc-web/js/config.js` 中的云托管 Base URL 访问后端。

**统一响应格式**:
```json
{ "code": 200, "message": "ok", "data": {} }
```

### 认证接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/auth/send-code` | 发送验证码 `{phone}` | 否 |
| POST | `/auth/login` | 验证码登录 `{phone, code}` | 否 |
| POST | `/auth/mini-login` | 小程序短信登录 `{phone, code}` | 微信云函数身份 |
| POST | `/auth/bind-phone` | 绑定小程序手机号 `{phone, code}` | Bearer Token |
| PATCH | `/auth/profile` | 更新昵称、学校、班级等资料 | Bearer Token |
| POST | `/auth/mini-profile` | 登记或更新小程序用户资料 | Bearer Token |
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
| GET | `/users` | 管理端用户列表 | 管理角色 |
| POST | `/users/authorize-teachers` | 批量授权教师 `{phones}` | 开发者 |

### 辩论能力统计

`/growth/:userId` 和 PC 管理端 `/export/grades-json` 使用同一套辩论能力口径：

| 字段 | 含义 |
|------|------|
| `argument_structure` | 论点结构 |
| `evidence_quality` | 论据质量 |
| `logic` | 逻辑推理 |
| `rebuttal` | 反驳回应 |
| `expression` | 表达组织 |

发音、流利度、完整度属于独立的语言表达辅助数据，不参与小程序和 PC 主辩论能力雷达图。

---

## 数据库设计

### 核心集合

| 集合 | 用途 | 说明 |
|------|------|------|
| `users` | 用户信息 | PC 用户 `source='pc'` 以 phone 关联；小程序用户以 openid 关联 |
| `topics` | 辩题库 | 当前内置 86 条辩题，含 category/difficulty/vocab_list |
| `practice_records` | 语音练习记录 | 关联 user_id，含发音/流利度/完整度/总分 |
| `portfolio_records` | 辩论作品集 | 关联 user_id，含 AI 评委反馈和五项辩论能力维度 |
| `debate_turns` | AI 对练记录 | 关联 user_id/session_id，含反驳评分和有效反驳结果 |
| `tournaments` | 赛事 | PC 创建，小程序读取并报名 |
| `tournament_teams` | 参赛队伍 | 赛事报名和组队数据 |
| `assessments` | 前后测 | baseline / milestone 类型 |
| `comments` | 人工点评 | 教师对学生练习的点评 |
| `assignments` | 当前任务 | PC 发布，小程序读取 |
| `teacher_assignments` | 教师议题 | 教师发布，小程序提交 |
| `assignment_submissions` | 作业提交 | 关联教师议题与练习记录 |

### 认证集合（云托管环境）

| 集合 | 用途 | 权限 |
|------|------|------|
| `auth_codes` | 验证码（哈希存储，5 分钟过期） | 所有用户不可读写 |
| `auth_tokens` | 登录 Token（7 天过期） | 所有用户不可读写 |

---

## 部署指南

### 1. 云托管 `debate-api`

项目根目录已包含 `Dockerfile`、`cloudbaserc.json` 和 `deploy-cloudbase.bat`。CLI 部署：

```powershell
cd D:\CODE\Debate
tcb cloudrun deploy --service-name debate-api --port 3000 --source . --force --wait
```

部署参数：端口 `3000`，CPU `0.5` 核，内存 `1GB`，自动切换到新版本。云托管环境变量必须在 CloudBase 控制台配置，密钥不要写入源码或 README：

- `DOUBAO_API_KEY`
- `DOUBAO_API_URL`
- `QWEN_API_URL`、`QWEN_API_KEY`（可选备用模型）
- `BAIDU_APP_ID`
- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`
- `AUTH_DEV_CODE=1`（未接入短信服务时启用开发验证码回显）
- `TENCENT_SMS_SECRET_ID`、`TENCENT_SMS_SECRET_KEY`、`TENCENT_SMS_SDK_APP_ID`
- `TENCENT_SMS_SIGN_NAME`、`TENCENT_SMS_TEMPLATE_ID`、`TENCENT_SMS_REGION`（腾讯云短信，生产环境设置 `AUTH_DEV_CODE=0`）

云托管服务还必须绑定可访问当前 CloudBase 环境数据库的服务角色，至少具备上述业务集合的读写权限。仅设置 `CLOUD_ENV` 或能访问 `/api/health` 不代表数据库权限已生效；可用 `/api/topics` 或 `/api/assignments/current` 验证，返回 `CloudBase 数据库不可用` 时需在 CloudBase 控制台的云托管服务权限中补充数据库访问角色。

部署后验证：

```powershell
Invoke-RestMethod https://debate-api-297740-11-1469475059.sh.run.tcloudbase.com/api/health
```

### 2. 云函数 `apiGateway`

小程序后端部署目录为 `miniprogram/cloudfunctions/apiGateway`，函数名为 `apiGateway`：

```powershell
cd D:\CODE\Debate
tcb fn deploy apiGateway --force --dir miniprogram/cloudfunctions/apiGateway --install-dependency true
```

旧版 CLI 也可使用 `tcb functions:deploy`，但该命令已被 CloudBase 标记为 deprecated。云函数配置为 Node.js 20、512MB、60 秒超时。

验证函数：

```powershell
tcb fn invoke apiGateway -d '{"method":"GET","path":"/api/health","query":{},"body":{},"headers":{}}' --json
```

云函数与云托管后端使用同一套 Express API 结构和同一 CloudBase 环境。修改 API 逻辑时，需要同步检查：

- `backend/src/`
- `miniprogram/cloudfunctions/apiGateway/backend/src/`

### 3. 小程序体验版

在微信开发者工具打开 `miniprogram/`，确认云环境为 `cloud1-d8g0k0m526d61652a`，重新编译并上传体验版。云函数部署不会自动更新小程序前端页面。

### 4. PC 管理端

PC 管理端使用 `pc-web/js/config.js` 中的 `API_BASE_URL`，当前应指向云托管域名。页面直接由 `debate-api` 静态托管，或通过静态网站托管发布 `pc-web/`。

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
| 云函数请求体过大 | 音频使用 `wx.cloud.uploadFile` 上传，仅向云函数传 `fileID` |
| 两套后端代码漂移 | 修改 API 后同步检查 `backend/src` 与 `miniprogram/cloudfunctions/apiGateway/backend/src` |
| AI 密钥泄露 | 仅配置在 CloudBase 云托管/云函数环境变量，不写入小程序、PC 前端或 Git |

---

## 测试

```bash
cd backend
node test-flow.js
# 运行后端集成测试
```

---

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

版权所有 (c) 2026 Debate Training Platform
