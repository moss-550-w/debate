/**
 * 导出 auth-store.json → 云开发控制台可导入的 JSON Lines 文件（.json 后缀）
 * 生成到项目根目录：cloud-import-users.json / cloud-import-auth-tokens.json
 * 用法：node scripts/export-jsonl.js
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../auth-store.json');
if (!fs.existsSync(src)) {
  console.error('未找到 auth-store.json');
  process.exit(1);
}
const store = { users: [], codes: {}, tokens: {}, ...JSON.parse(fs.readFileSync(src, 'utf-8')) };
const outDir = path.join(__dirname, '../../');
const now = Date.now();

// 用户：补 source 标记，_id 使用本地已有值（Upsert 按 _id 去重）
const usersLines = store.users.map(u => JSON.stringify({ source: 'pc', ...u }));

// Token：过滤已过期，_id = token 本身
const tokenEntries = Object.entries(store.tokens);
const tokenLines = tokenEntries
  .filter(([, s]) => s.expires_at > now)
  .map(([t, s]) => JSON.stringify({ _id: t, ...s }));

fs.writeFileSync(path.join(outDir, 'cloud-import-users.json'), usersLines.join('\n') + '\n', 'utf-8');
fs.writeFileSync(path.join(outDir, 'cloud-import-auth-tokens.json'), tokenLines.join('\n') + '\n', 'utf-8');

console.log(`导出完成: 用户 ${usersLines.length} 条, Token ${tokenLines.length} 条 (过滤过期 ${tokenEntries.length - tokenLines.length} 条)`);
console.log('文件位置: 项目根目录 cloud-import-users.json / cloud-import-auth-tokens.json');
