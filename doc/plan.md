# 项目执行计划（Plan）

> 基于 [design.md](./design.md) 技术架构与 [agent.md](./agent.md) 开发指引，制定本执行计划。
> 目标：**4人团队、6周内交付可演示MVP**，包含完整的前后测对比能力。

---

## 1. 项目总览

| 项目 | 内容 |
|------|------|
| 名称 | 英语辩论能力训练平台（MVP版） |
| 目标 | 为小学生提供AI辅助的英语立论与跟读训练，通过前后测对比验证能力提升 |
| 交付 | 微信小程序（学生端） + PC Web端（教师/管理端） |
| 周期 | 6周，分3个Sprint |
| 团队 | 4人（前端×2 + 后端×1 + 测试/部署×1） |
| 成本 | 月费用 < 100元（轻量服务器10元/月 + 大模型API免费额度 + 云开发免费版） |

---

## 2. 技术架构速览

```
┌─────────────────────────────────────────────────────┐
│ 前端展示层                                          │
│ PC端（原生HTML+CSS+JS） + 微信小程序（原生开发）      │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│  接入鉴权层（微信云开发）                            │
│  职责：用户登录/票据校验 / 静态网站托管               │
└───────────┬───────────────────────┬─────────────────┘
            │                       │
            ▼                       ▼
┌───────────────────┐   ┌─────────────────────────────┐
│  NoSQL云数据库     │   │  计算密集型中间层             │
│  （仅存结构化结果） │   │  轻量服务器（Node.js + Express）
│                    │   │  职责：AI调用/语音评测转发    │
└───────────────────┘   └──────────┬──────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │ 外部API（大模型/评测）│
                          └────────────────────┘
```

### 核心技术选型

| 模块 | 选型 | 理由 |
|------|------|------|
| PC前端 | 原生HTML+CSS+JS | 复用原型，零构建成本 |
| 小程序 | 微信原生开发 | 录音API最稳定，无需跨端兼容 |
| 后端主服务 | Node.js v18 + Express | 常驻内存，解决冷启动，方便调试AI |
| 后端辅助 | 微信云函数 | 仅处理登录/基础查询 |
| 数据库 | 云开发NoSQL（5张集合） | 与微信无缝集成，无需运维 |
| AI模型 | 豆包（主）+ 通义千问（备） | 免费额度充足，支持JSON输出 |
| 语音评测 | 百度智能云 | 支持Base64直传，维度精细 |

---

## 3. Sprint 1（第1-2周）—— 地基期

**目标**：搭建完整基础设施，小程序能登录并看到辩题列表，PC能手机号登录。

### 3.1 环境搭建

| 任务 | 负责人 | 产出 | 验收标准 |
|------|--------|------|----------|
| 申请微信云开发环境，开通NoSQL数据库 | 后端 | 云环境ID，5个集合创建完毕 | 云开发控制台可查 |
| 申请轻量服务器（2核2G），安装Node.js+PM2 | 后端 | 服务器IP，PM2运行正常 | `curl http://ip:3000/health` 返回200 |
| 配置云开发静态托管，绑定自定义域名 | 测试/部署 | 静态托管URL | 浏览器可访问默认页面 |
| 申请百度语音评测API、豆包API、通义千问API | 后端 | API Key清单 | Postman调用成功 |
| 配置小程序项目，初始化`app.js/app.json` | 前端（小程序） | 小程序空白工程 | 微信开发者工具预览正常 |
| 初始化PC端项目目录，创建`index.html`骨架 | 前端（PC） | PC端空白页面 | 本地打开显示正常 |

### 3.2 数据库建表

根据 [agent.md 第4节](agent.md#4-数据库集合设计5张表) 创建5个集合：

| 集合名 | 核心字段 | 说明 |
|--------|----------|------|
| `users` | openid, role, ability_baseline, ability_latest, agreement_version | 含监护人手机（加密） |
| `topics` | title, category, difficulty, vocab_list, status | 预置5个示例辩题 |
| `practice_records` | user_id, topic_id, type, score, text_content, duration | 只存最终结果 |
| `assessments` | user_id, type(baseline/milestone), score | 前后测对比 |
| `comments` | pupil_id, college_id, content, status | 人工点评 |

**权限设置**：仅管理员可写，用户可读自己的记录。

### 3.3 后端基础服务

| 任务 | 产出 |
|------|------|
| 初始化Express项目，配置中间件（auth, rateLimit, logger） | `backend/` 目录，`/api/health` 端点 |
| 编写 `db.js` 云数据库操作封装（wx-server-sdk） | 数据库CRUD工具函数 |
| 编写 `POST /api/login`（手机号+验证码，MVP写死`123456`） | PC端登录接口 |
| 编写 `userLogin` 云函数 | 小程序登录接口 |

### 3.4 前端基础

| 任务 | 产出 |
|------|------|
| **小程序**：首页三大入口卡片 UI（🎙️跟读挑战 / 🧠立论小能手 / 📊我的成就） | 首页UI |
| **小程序**：调用 `userLogin` 云函数，完成登录逻辑 | 登录流程 |
| **小程序**：辩题列表页（调用 `getTopicList` 云函数） | 列表页 |
| **PC端**：手机号登录页（含验证码输入，MVP写死） | 登录页 |
| **PC端**：左侧菜单骨架（辩题管理 / 用户列表 / 数据看板） | 管理框架 |

### 3.5 Sprint 1 交付物

- 小程序：能登录 → 看到辩题列表 → 点击辩题可查看详情
- PC端：手机号登录 → 看到管理后台框架
- 后端：5个集合有数据，`/api/health` 可访问

---

## 4. Sprint 2（第3-4周）—— 核心闭环

**目标**：用户可完成"选题→立论生成→录音评测"全流程，数据存入数据库。

### 4.1 后端核心接口

| 接口 | 功能 | 核心逻辑 | 依赖 |
|------|------|----------|------|
| `POST /api/generate` | 生成立论框架 | 调用豆包API → 词汇过滤器 → 安全检测 → 返回结构化论点 | aiService.js, security.js |
| `POST /api/evaluate` | 语音评测 | 接收Base64音频 → 百度评测API → 返回分数 | evaluateService.js |
| `POST /api/debate` | 模拟对辩（V1简化版） | 关键词匹配预设话术，不依赖大模型 | - |
| `GET /api/growth/:userId` | 成长数据聚合 | 聚合practice_records + assessments → 返回 | db.js |

### 4.2 核心服务层

| 文件 | 职责 | 关键机制 |
|------|------|----------|
| [backend/src/services/aiService.js](file:///d:/CODE/Debate/backend/src/services/aiService.js) | 大模型调用 | 双模型降级（豆包→通义千问）、json-repair修复、超时3s自动切换 |
| [backend/src/services/evaluateService.js](file:///d:/CODE/Debate/backend/src/services/evaluateService.js) | 语音评测 | 内存Buffer处理，评测后`fs.unlinkSync`立即销毁 |
| [backend/src/services/security.js](file:///d:/CODE/Debate/backend/src/services/security.js) | 内容安全 | 调用微信`security.msgSecCheck`，命中违规返回预设安全文案 |
| [backend/src/middleware/auth.js](file:///d:/CODE/Debate/backend/src/middleware/auth.js) | Token校验 | 从云开发获取openid验证 |
| [backend/src/middleware/rateLimit.js](file:///d:/CODE/Debate/backend/src/middleware/rateLimit.js) | 限流 | 小学生每日20次调用限制 |

### 4.3 前端功能

| 平台 | 功能 | 描述 |
|------|------|------|
| 小程序 | 立论生成 | 选题→选择立场→调用`/generate`→展示论点列表→导出文稿 |
| 小程序 | 跟读评测 | 显示参考文本→长按录音→松开自动提交→展示得分卡片 |
| 小程序 | 记录列表 | 显示最近练习记录（简易列表） |
| PC端 | 立论生成 | 同小程序，管理员可预览 |
| PC端 | 评测记录 | 查看用户提交的评测结果 |

### 4.4 Sprint 2 交付物

- **核心MVP**：用户完成"选题→立论生成→录音评测→查看分数"全流程
- 后端3个核心接口（generate / evaluate / growth）可正常调用
- 数据存入`practice_records`和`assessments`集合
- 模拟对辩接口返回预设话术

---

## 5. Sprint 3（第5-6周）—— 展示增强

**目标**：数据看板、雷达图对比、管理端导出、UI优化，满足验收要求。

### 5.1 数据看板

| 任务 | 描述 |
|------|------|
| 小程序"我的成就"页 | 集成ECharts（通过`wx-canvas`或`web-view`），绘制双雷达对比图（baseline vs latest） |
| PC端数据看板 | 使用ECharts CDN，展示整体提升率、各维度平均分 |
| 成长曲线聚合 | 后端`/growth`接口返回baseline / latest / history / stats |

### 5.2 管理端功能

| 任务 | 描述 |
|------|------|
| 辩题管理 | 增删改辩题（调用云数据库直接操作） |
| 数据导出 | 前端调用云数据库查询，导出CSV文件 |
| 用户列表 | 查看注册用户、练习次数、累计时长 |

### 5.3 UI优化与全流程测试

| 任务 | 描述 |
|------|------|
| 小学生大字体UI | 增大按钮、字号、间距，使用明亮配色 |
| PC端双主题 | 通过CSS变量一键切换"专业蓝"和"儿童黄" |
| 全流程测试 | 准备2个测试账号，预置练习记录，走通完整流程 |
| Bug修复 | 前端错误处理、后端异常捕获、边界情况测试 |

### 5.4 Sprint 3 交付物

- **最终演示版**：完整的前后测对比数据看板
- 管理端可导出CSV数据
- 小程序+PC端全流程可用
- 预置演示数据，10分钟演示脚本

---

## 6. 目录结构与代码清单

```
project-root/
├── pc-web/                        # PC端静态页面
│   ├── index.html                 # 主页面
│   ├── css/
│   │   ├── style.css              # 专业蓝主题
│   │   └── theme-kids.css         # 儿童黄主题
│   ├── js/
│   │   ├── config.js              # API Base URL、云环境ID
│   │   ├── auth.js                # 手机号登录/登出
│   │   ├── debate.js              # 辩题加载、生成立论、提交评测
│   │   ├── growth.js              # 雷达图渲染、历史记录
│   │   └── utils.js               # 通用工具
│   └── assets/
├── miniprogram/                   # 微信小程序
│   ├── pages/
│   │   ├── index/                 # 首页（三大入口卡片）
│   │   ├── topic/                 # 辩题列表与详情
│   │   ├── practice/              # 立论练习（AI生成）
│   │   ├── speech/                # 跟读评测（录音+评分）
│   │   └── profile/               # 个人成长（雷达图）
│   ├── components/                # 复用组件
│   ├── utils/
│   │   ├── request.js             # wx.request封装
│   │   └── cloud.js               # 云函数调用封装
│   ├── app.js / app.json
│   └── project.config.json
├── backend/                       # Node.js + Express 服务
│   ├── src/
│   │   ├── routes/
│   │   │   ├── generate.js        # 立论生成路由
│   │   │   ├── debate.js          # 对辩（预留，简单实现）
│   │   │   ├── evaluate.js        # 语音评测路由
│   │   │   └── growth.js          # 成长数据聚合路由
│   │   ├── services/
│   │   │   ├── aiService.js       # 大模型调用（含降级、JSON修复）
│   │   │   ├── evaluateService.js # 百度评测调用
│   │   │   └── security.js        # 内容安全检测
│   │   ├── middleware/
│   │   │   ├── auth.js            # Token校验
│   │   │   └── rateLimit.js       # 限流
│   │   ├── utils/
│   │   │   ├── logger.js          # 日志
│   │   │   └── db.js              # 云数据库操作封装
│   │   └── app.js                 # 入口
│   ├── .env.example
│   └── package.json
└── cloudfunctions/                # 微信云函数
    ├── userLogin/                 # 登录
    ├── getTopicList/              # 辩题分页
    └── uploadFile/                # 云存储上传凭证
```

---

## 7. 关键风险与应对

| 风险 | 发生概率 | 影响 | 应对策略 |
|------|----------|------|----------|
| 大模型返回非JSON | 中 | 高 | json-repair修复 + 预设模板兜底 |
| 大模型API不可用 | 低 | 高 | 双模型降级（豆包→通义千问）+ 本地规则引擎 |
| 语音评测API限流 | 中 | 中 | 同一参考文本1小时内缓存不重复评测 |
| 小程序审核驳回 | 中 | 高 | 删除"社交排名"等敏感词，以工具类目提交 |
| 轻量服务器宕机 | 低 | 中 | 云函数作为备用评测通道（保底方案） |
| 数据库查询慢 | 中 | 低 | skip/limit分页 + 前端"加载中"占位 |

---

## 8. 验收标准

### 8.1 核心功能验收

- [ ] 小程序端：用户可登录 → 选题 → 生成立论 → 录音评测 → 查看分数
- [ ] PC端：管理员可登录 → 管理辩题 → 查看用户数据 → 导出CSV
- [ ] 前后测对比：雷达图展示 baseline vs latest 五维能力对比
- [ ] 所有数据持久化到云数据库，页面刷新数据不丢失

### 8.2 非功能验收

- [ ] 评测接口响应 < 10s，大模型接口响应 < 15s
- [ ] 小学生每日调用限制20次，超限返回友好提示
- [ ] AI生成内容经过安全检测，违规内容替换为安全文案
- [ ] 隐私协议首次登录强制阅读，记录协议版本
- [ ] 月费用控制在100元以内

---

## 9. 作弊条（快速参考）

### 9.1 统一API响应格式

```json
{
  "code": 200,     // 200成功，0业务失败
  "message": "ok",
  "data": null | object | array
}
```

错误码：400（参数错误）、401（未授权）、429（限流）、500（服务器错误）

### 9.2 数据库字段约定

- 集合名：全小写（`users`, `topics`, `practice_records`, `assessments`, `comments`）
- 字段名：`snake_case`（如 `ability_baseline`）
- 时间字段：`created_at`（Date类型）

### 9.3 代码命名约定

- 文件命名：`kebab-case`（如 `ai-service.js`）
- 变量/函数：`camelCase`（如 `getUserGrowth`）
- 环境变量：`UPPER_SNAKE_CASE`（如 `DOUBAO_API_KEY`）

### 9.4 部署命令

```bash
# 后端服务启动
pm2 start backend/src/app.js --name debate-api

# 云函数部署
# 在微信开发者工具中右键 → 上传并部署（云端安装依赖）

# PC端部署
# 上传至云开发静态托管，配置自定义域名
```

---

## 10. 附录：Sprint任务一览表

| Sprint | 任务分类 | 任务数 | 预计工时 |
|--------|----------|--------|----------|
| Sprint 1 | 环境搭建 | 6 | 3天 |
| Sprint 1 | 数据库建表 | 1 | 1天 |
| Sprint 1 | 后端基础服务 | 4 | 3天 |
| Sprint 1 | 前端基础 | 5 | 5天 |
| **Sprint 1 小计** | | **16** | **12天** |
| Sprint 2 | 后端核心接口 | 4 | 5天 |
| Sprint 2 | 核心服务层 | 5 | 5天 |
| Sprint 2 | 前端功能 | 5 | 5天 |
| **Sprint 2 小计** | | **14** | **15天** |
| Sprint 3 | 数据看板 | 3 | 3天 |
| Sprint 3 | 管理端功能 | 3 | 3天 |
| Sprint 3 | UI优化与测试 | 4 | 4天 |
| **Sprint 3 小计** | | **10** | **10天** |
| **总计** | | **40** | **37天** |