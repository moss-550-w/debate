const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '../..');
const pdfPath = process.argv[2] || path.join(projectRoot, 'doc', '中国议题辩论库_300条.pdf');
const pdfText = childProcess.execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
const lines = pdfText.replace(/\r/g, '').replace(/\f/g, '\n').split('\n');
const difficultyMap = { 常规: 'easy', 进阶: 'medium', 挑战: 'hard' };
const records = [];
let section = '中国文化与现实议题';
let current = null;
let readingMotions = true;

function finishRecord() {
  if (!current) return;
  const title = current.titleParts.join(' ').replace(/\s+/g, ' ').trim();
  const translation = current.translationParts.join(' ')
    .split(/\s*(?:使用建议|难度分布统计|训练目标)/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (title && translation) {
    const sourceVersion = crypto.createHash('sha1').update(`${title}\n${translation}`).digest('hex');
    records.push({
      _id: `topic_china_${String(records.length + 1).padStart(3, '0')}`,
      title,
      translation,
      source_version: sourceVersion,
      category: 'china',
      difficulty: difficultyMap[current.level],
      background: `${section}。${translation}`,
      vocab_list: [],
      status: 1,
    });
  }
  current = null;
}

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (/^(使用建议|难度分布统计)/.test(line)) {
    finishRecord();
    readingMotions = false;
    continue;
  }
  if (!readingMotions) continue;

  // PDF 会将小节标题单独输出；它们不是辩题内容。
  if (current && /[\u4e00-\u9fff]/.test(line) && !line.startsWith('本院') && line.length <= 20) {
    finishRecord();
    continue;
  }

  if (/^第二批\s*[·.]\s*200\s*条/.test(line)) {
    finishRecord();
    continue;
  }

  const sectionMatch = line.match(/^(第[一二三四五六七八九十]+批[^（]*|[一二三四五六七八九十]+、[^（]+)(?:（[^）]+）)?$/);
  if (sectionMatch && !/^第[一二三四五六七八九十]+批/.test(line)) {
    finishRecord();
    section = sectionMatch[1].replace(/^[一二三四五六七八九十]+、/, '').trim();
  }

  const motionMatch = line.match(/^\d+\.\s*(挑战|进阶|常规)\s*\|\s*(.*)$/);
  if (motionMatch) {
    finishRecord();
    current = { level: motionMatch[1], titleParts: [motionMatch[2]], translationParts: [] };
    continue;
  }

  if (!current || !line) continue;
  if (line.startsWith('本院')) {
    current.translationParts.push(line);
  } else if (current.translationParts.length === 0) {
    current.titleParts.push(line);
  } else {
    current.translationParts.push(line);
  }
}
finishRecord();

if (records.length !== 300) {
  throw new Error(`PDF 辩题解析数量异常：${records.length}，预期 300`);
}

const seedPaths = [
  path.join(projectRoot, 'backend', 'topics-seed.json'),
  path.join(projectRoot, 'miniprogram', 'cloudfunctions', 'apiGateway', 'backend', 'topics-seed.json'),
];
for (const seedPath of seedPaths) {
  const existing = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const chinaIds = new Set(records.map(topic => topic._id));
  const merged = existing.filter(topic => !chinaIds.has(topic._id)).concat(records);
  fs.writeFileSync(seedPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

const chinaData = records.map(({ _id, title, translation, difficulty, category, background, source_version, status }) => ({
  _id,
  title,
  translation,
  source_version,
  difficulty,
  category,
  background,
  status,
}));
const chinaDataPath = path.join(projectRoot, 'miniprogram', 'data', 'chinaTopics.js');
fs.writeFileSync(chinaDataPath, `module.exports = ${JSON.stringify(chinaData, null, 2)};\n`, 'utf8');
console.log(`已导入 ${records.length} 条思辨中国辩题`);
