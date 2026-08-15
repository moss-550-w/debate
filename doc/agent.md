# agent.md — 项目开发指引（AI辅助开发专用）

> 本文档旨在为AI编程助手（或新加入开发者）提供完整的项目上下文、技术约束和实现细节，确保代码生成符合预期架构。请严格遵循以下规范。

---

## 1. 项目概述

- **项目名称**：英语辩论能力训练平台（MVP版）
- **核心目标**：为小学生提供AI辅助的英语立论与跟读训练，通过前后测对比验证能力提升。
- **交付范围**：微信小程序（学生端）+ PC Web端（教师/管理端），6周内完成可演示版本。
- **关键约束**：未成年人保护合规、低成本（月费用<100元）、快速迭代。

---

## 2. 技术栈总览

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| PC前端 | 原生 HTML + CSS + JavaScript | 直接改造现有原型，无构建工具 |
| 小程序 | 微信原生开发 | 使用 `wx.getRecorderManager` 录音 |
| 后端主服务 | Node.js v18 + Express | 部署在轻量服务器（如腾讯云Lighthouse） |
| 后端辅助 | 微信云开发云函数 | 仅处理登录、基础查询、静态托管 |
| 数据库 | 微信云开发 NoSQL | 集合名固定，使用 `where`、`orderBy` |
| AI模型 | 豆包（主） + 通义千问（备） | 通过HTTP API调用，需支持JSON输出 |
| 语音评测 | 百度智能云 API | 支持Base64音频直传 |
| 部署 | 云开发静态托管（PC）+ 小程序云环境 | 后端服务独立部署 |

---

## 3. 项目目录结构

```
project-root/
├── pc-web/                    # PC端静态页面
│   ├── index.html             # 主页面（含登录、选题、立论、结果）
│   ├── css/
│   │   ├── style.css          # 默认样式（专业蓝）
│   │   └── theme-kids.css     # 小学生主题（明亮黄，通过JS切换）
│   ├── js/
│   │   ├── config.js          # 环境变量（API Base URL、云环境ID）
│   │   ├── auth.js            # 手机号登录/登出
│   │   ├── debate.js          # 辩题加载、生成立论、提交评测
│   │   ├── growth.js          # 雷达图渲染（ECharts）、历史记录
│   │   └── utils.js           # 通用工具（格式化、校验）
│   └── assets/                # 图片、字体
├── miniprogram/               # 微信小程序（原生）
│   ├── pages/
│   │   ├── index/             # 首页（三大入口卡片）
│   │   ├── topic/             # 辩题列表与详情
│   │   ├── practice/          # 立论练习（调用AI生成）
│   │   ├── speech/            # 跟读评测（录音+评分）
│   │   └── profile/           # 个人成长（雷达图+记录）
│   ├── components/            # 复用组件（评分卡片、按钮）
│   ├── utils/
│   │   ├── request.js         # 封装wx.request，统一错误处理
│   │   └── cloud.js           # 云函数调用封装
│   ├── app.js / app.json
│   └── project.config.json
├── backend/                   # Node.js + Express 服务
│   ├── src/
│   │   ├── routes/
│   │   │   ├── generate.js    # 立论生成路由
│   │   │   ├── debate.js      # 对辩（预留，简单实现）
│   │   │   ├── evaluate.js    # 语音评测路由
│   │   │   └── growth.js      # 成长数据聚合路由
│   │   ├── services/
│   │   │   ├── aiService.js   # 大模型调用（含降级、JSON修复）
│   │   │   ├── evaluateService.js # 百度评测调用
│   │   │   └── security.js    # 内容安全检测（微信API）
│   │   ├── middleware/
│   │   │   ├── auth.js        # Token校验（从云开发获取）
│   │   │   └── rateLimit.js   # 限流（小学生每日20次）
│   │   ├── utils/
│   │   │   ├── logger.js      # 日志记录
│   │   │   └── db.js          # 云数据库操作封装（使用wx-server-sdk）
│   │   └── app.js             # 入口
│   ├── .env.example           # 环境变量示例
│   └── package.json
└── cloudfunctions/            # 微信云函数
    ├── userLogin/             # 处理登录
    ├── getTopicList/          # 分页获取辩题
    └── uploadFile/            # 生成云存储上传凭证（仅用于文本/图片）
```

---

## 4. 数据库集合设计（5张表）

所有集合名**必须全小写**，字段名使用 snake_case（便于统一）。

### 4.1 `users`
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `_id` | string | 是 | 自动生成 |
| `openid` | string | 是 | 微信唯一标识 |
| `phone` | string | 否 | 手机号（PC登录用，需加密） |
| `role` | string | 是 | `'pupil'` 或 `'college'` |
| `nickname` | string | 否 | 昵称 |
| `grade` | string | 否 | 年级（如 'G5'） |
| `guardian_phone` | string | 否 | 监护人手机（加密） |
| `ability_baseline` | object | 是 | `{pronunciation, fluency, logic, vocabulary, reaction}` 初始值（均0-100） |
| `ability_latest` | object | 是 | 同上，最新值（每次评测后更新） |
| `total_duration` | number | 是 | 累计练习秒数，默认0 |
| `total_count` | number | 是 | 累计练习次数，默认0 |
| `created_at` | date | 是 | 注册时间 |
| `agreement_version` | string | 是 | 隐私协议版本（如 'v1'） |

### 4.2 `topics`
| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 辩题ID |
| `title` | string | 辩题名称（中英文） |
| `category` | string | 分类：'tech' / 'environment' / 'education' / 'society' |
| `difficulty` | string | 'easy' / 'medium' / 'hard' |
| `vocab_list` | array | 核心词汇列表（用于AI生成时做词汇降级） |
| `background` | string | 背景资料（可选） |
| `status` | number | 0-下架，1-上架 |

### 4.3 `practice_records`
| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `user_id` | string | 引用 `users._id` |
| `topic_id` | string | 引用 `topics._id` |
| `type` | string | `'argument'` 或 `'speech'` |
| `position` | string | `'pro'` 或 `'con'`（仅立论） |
| `score` | object | `{pronunciation, fluency, logic, vocabulary, reaction}`（跟读只前两者） |
| `audio_url` | string | 若为跟读，存储云存储URL（可选） |
| `text_content` | string | 立论稿文本 或 语音识别转写文本 |
| `duration` | number | 练习秒数 |
| `created_at` | date | 练习时间 |

### 4.4 `assessments`
与 `practice_records` 结构相似，但 `type` 固定为 `'baseline'` 或 `'milestone'`，专门用于前后测。

### 4.5 `comments`（人工点评）
| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 自动 |
| `pupil_id` | string | 小学生用户ID |
| `college_id` | string | 大学生用户ID |
| `content` | string | 文字点评 |
| `audio_url` | string | 语音点评URL（可选） |
| `status` | string | `'pending'` / `'done'` |
| `created_at` | date | |

---

## 5. 后端API接口规范（Express）

**Base URL**: `https://your-backend-domain.com/api`  
**统一响应格式**:
```json
{
  "code": 200,   // 0表示业务失败，200成功
  "message": "ok",
  "data": null | object | array
}
```
**错误码约定**：400（参数错误）、401（未授权）、429（限流）、500（服务器错误）。

### 5.1 生成立论框架
- **Endpoint**: `POST /generate`
- **Headers**: `Authorization: Bearer <openid>` （由云函数登录返回）
- **Body**:
```json
{
  "topic_id": "xxx",
  "position": "pro" | "con",
  "user_role": "pupil" | "college"   // 决定提示词复杂度
}
```
- **Success Response**:
```json
{
  "code": 200,
  "data": {
    "points": [
      { "title": "论点标题", "sentence": "英文例句", "translation": "中文释义" }
    ],
    "conclusion": "总结句",
    "full_text": "完整逐字稿"
  }
}
```

### 5.2 英语语音评测
- **Endpoint**: `POST /evaluate`
- **Body** (multipart/form-data):
  - `audio`: 音频文件（MP3/WAV，<1MB）或 Base64 字符串（字段名`audio_base64`）
  - `ref_text`: 参考文本（即立论稿内容）
- **Success Response**:
```json
{
  "code": 200,
  "data": {
    "pronunciation": 85,
    "fluency": 78,
    "integrity": 92,
    "overall": 85,
    "word_scores": [ { "word": "hello", "score": 90 } ] // 可选
  }
}
```

### 5.3 获取成长数据
- **Endpoint**: `GET /growth/:userId`
- **Response**:
```json
{
  "code": 200,
  "data": {
    "baseline": { "pronunciation": 60, ... },
    "latest": { "pronunciation": 80, ... },
    "history": [ /* 最近20条练习记录 */ ],
    "stats": { "totalCount": 30, "totalDuration": 1200 }
  }
}
```

### 5.4 模拟对辩（V1.0简化版，仅返回预设话术）
- **Endpoint**: `POST /debate`
- **Body**: `{ "topic_id": "xxx", "position": "pro", "user_speech": "..." }`
- **Response**: `{ "ai_reply": "预设反驳句" }`（不依赖大模型，避免延迟）

---

## 6. 云函数接口规范

### 6.1 `userLogin`
- **入参**: `{ code: string, phone?: string }`
- **逻辑**:
  1. `wx.cloud.callFunction` 内部用 `wx-server-sdk` 获取 `openid`
  2. 若 `phone` 存在，通过手机号查询是否已有用户，有则更新 `openid` 绑定
  3. 若无记录，创建新用户，初始化 `ability_baseline` 全为0
  4. 返回 `{ openid, user: {...} }`
- **注意**：PC端不调用此云函数，PC登录单独用手机号+验证码（另备接口，但MVP阶段简化）。

### 6.2 `getTopicList`
- **入参**: `{ category?: string, difficulty?: string, page: number, size: number }`
- **返回**: `{ total, list: [...] }`

---

## 7. 前端关键交互流程（供UI开发参考）

### 7.1 小程序首页（三大入口）
- **“跟读挑战”**：进入辩题列表 -> 选择辩题 -> 显示参考文本 -> 长按录音按钮 -> 松开自动提交评测 -> 展示得分卡片。
- **“立论小能手”**：选择辩题与立场 -> 点击“生成” -> 等待AI返回（显示加载动画） -> 展示论点列表 + 导出完整文稿。
- **“我的成就”**：展示雷达图（ECharts，通过 `wx-canvas` 或 `web-view` 嵌入），下方列出最近练习记录。

### 7.2 PC端（教师/管理）
- 左侧菜单：辩题管理（增删改）、用户列表、数据看板（使用ECharts展示整体提升率）。
- 登录：手机号+验证码（通过云函数发送短信，但MVP可先写死管理员账号）。

---

## 8. 开发任务分解（对应Sprint）

### Sprint 1（第1-2周）——基础搭建
- [ ] 申请并配置云开发环境，创建5个集合，设置权限（仅管理员可写，用户可读自己的记录）。
- [ ] 部署轻量服务器，安装Node.js，配置PM2，开放防火墙端口。
- [ ] 编写 `userLogin` 云函数，测试登录并获取openid。
- [ ] 初始化辩题数据（手动录入5个示例辩题）。
- [ ] PC端实现手机号登录（先写死验证码为 `123456`，用于演示）。
- [ ] 小程序端完成登录及首页UI。

### Sprint 2（第3-4周）——核心闭环
- [ ] 后端实现 `/generate` 接口，接入豆包API，测试JSON解析与降级。
- [ ] 后端实现 `/evaluate` 接口，接入百度语音评测，完成音频Base64直传。
- [ ] PC端实现“选题->生成立论”流程，并保存记录。
- [ ] 小程序端实现“录音->提交评测->显示得分”流程，保存记录。
- [ ] 两端实现记录列表展示（简易）。

### Sprint 3（第5-6周）——展示增强
- [ ] 后端实现 `/growth` 聚合接口，前端（PC+小程序）使用ECharts绘制双雷达对比图。
- [ ] 管理端简易数据导出（前端调用云数据库直接查询，导出CSV）。
- [ ] 全面UI走查：小程序大按钮、大字体，PC主题切换。
- [ ] 全流程测试，修复Bug，准备演示脚本。

---

## 9. 代码规范与命名约定

- **文件命名**：`kebab-case`（如 `ai-service.js`）。
- **变量/函数**：`camelCase`（如 `getUserGrowth`）。
- **数据库字段**：`snake_case`（如 `ability_baseline`）。
- **环境变量**：`UPPER_SNAKE_CASE`（如 `DOUBAO_API_KEY`）。
- **注释**：关键函数使用JSDoc。

```javascript
/**
 * 调用大模型生成立论框架
 * @param {string} topic - 辩题
 * @param {string} position - 'pro' | 'con'
 * @param {string} role - 'pupil' | 'college'
 * @returns {Promise<Object>} 结构化论点
 */
```

---

## 10. 部署与测试要点

- **后端服务**：使用 `pm2 start app.js --name debate-api`，设置开机自启。
- **云函数**：在微信开发者工具中右键上传并部署（云端安装依赖）。
- **PC端**：上传至云开发静态托管，配置自定义域名（需备案）。
- **测试数据**：准备2个测试账号（小学生/大学生），预置若干条练习记录用于看板演示。
- **性能**：评测接口超时设置为10s，大模型接口超时15s，并配置重试1次。

---

## 11. 风险应对（重要！）

| 风险 | 应对策略 |
|------|----------|
| 大模型返回非JSON | 使用 `json-repair` 库修复，若仍失败返回预设模板。 |
| 语音评测API限流 | 使用本地缓存，同一参考文本1小时内不重复评测。 |
| 小程序审核驳回 | 删除“班级码”“社交排行”等敏感词，以工具类目提交。 |
| 服务器宕机 | 部署云函数作为备用评测通道（降低体验，但保底）。 |

---

**最后说明**：AI开发时，请优先实现Sprint 2的核心接口和UI，确保数据能存入数据库并在前端展示。所有代码必须添加基础错误处理（`try-catch`），不得因单点故障导致整个进程崩溃。遇到未明确的技术选型，请参考本文件“技术栈总览”章节。 