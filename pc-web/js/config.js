/**
 * 环境配置
 */
const CONFIG = {
  // ============================================================
  // 微信云托管 debate-api 公网域名（部署后替换下面占位符）
  // 云托管控制台 → 服务 → debate-api → 访问信息 / 默认域名  形如：
  //   https://debate-api-xxxxxxxxxxxxxxxx.ap-shanghai.service.tcloudbase.com/api
  // 本地调试可切回： http://localhost:3000/api
  // ============================================================
  // 本地开发用 localhost，部署到云托管后替换为真实域名
  API_BASE_URL: 'http://localhost:3000/api',

  // 云环境ID（微信云开发）
  CLOUD_ENV: 'cloud1-d8g0k0m526d61652a',

  // 管理员账号（MVP写死）
  ADMIN_PHONE: '13800138000',
  ADMIN_CODE: '123456',
};