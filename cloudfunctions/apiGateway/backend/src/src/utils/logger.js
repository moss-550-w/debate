const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${date}.log`);
}

/**
 * 记录日志到文件和控制台
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {object} [data]
 */
function log(level, message, data) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[${timestamp}] [${level}] ${message}${dataStr}`;

  console.log(line);
  if (!process.env.CLOUD_FUNCTION) {
    fs.appendFileSync(getLogFile(), line + '\n', 'utf-8');
  }
}

module.exports = {
  info: (msg, data) => log('INFO', msg, data),
  warn: (msg, data) => log('WARN', msg, data),
  error: (msg, data) => log('ERROR', msg, data),
};
