const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const authStore = require('../services/authStore');
const practiceStore = require('../services/practiceStore');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '仅管理员可查看班级数据', data: null });
  }
  return next();
}

function average(records, key) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + (Number(record[key]) || 0), 0) / records.length);
}

async function buildClassData() {
  const [users, records] = await Promise.all([authStore.listUsers(), practiceStore.list()]);
  const pupils = users.filter(user => user.role === 'pupil' && user.source === 'miniprogram');
  const students = pupils.map(user => {
    const userRecords = records.filter(record => record.user_id === user._id || record.user_id === user.openid);
    const durationSec = userRecords.reduce((sum, record) => sum + (Number(record.duration_sec) || 0), 0);
    return {
      name: user.nickname || '小辩手',
      grade: user.grade || '-',
      role: user.role,
      practice_count: userRecords.length,
      avg_pronunciation: average(userRecords, 'pronunciation'),
      avg_fluency: average(userRecords, 'fluency'),
      avg_integrity: average(userRecords, 'integrity'),
      avg_overall: average(userRecords, 'overall'),
      total_duration_min: Math.round(durationSec / 60),
      last_practice: userRecords[0] ? userRecords[0].created_at : '',
      registered_at: user.created_at || '',
    };
  });
  const totalPractices = students.reduce((sum, student) => sum + student.practice_count, 0);
  const totalDuration = students.reduce((sum, student) => sum + student.total_duration_min, 0);
  const classStats = {
    total_students: students.length,
    total_practices: totalPractices,
    total_duration_min: totalDuration,
    avg_pronunciation: average(students, 'avg_pronunciation'),
    avg_fluency: average(students, 'avg_fluency'),
    avg_integrity: average(students, 'avg_integrity'),
    avg_overall: average(students, 'avg_overall'),
    dimensions: [
      { key: 'pronunciation', label: '发音' },
      { key: 'fluency', label: '流利度' },
      { key: 'integrity', label: '完整度' },
    ],
  };
  return { students, classStats };
}

function csvValue(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

router.get('/grades', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { students } = await buildClassData();
    const headers = ['昵称', '年级', '练习次数', '发音', '流利度', '完整度', '综合平均分', '累计时长(分钟)', '最近练习日期'];
    const rows = students.map(student => [
      student.name,
      student.grade,
      student.practice_count,
      student.avg_pronunciation,
      student.avg_fluency,
      student.avg_integrity,
      student.avg_overall,
      student.total_duration_min,
      student.last_practice,
    ].map(csvValue).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`学生成绩_${new Date().toISOString().slice(0, 10)}`)}.csv"`);
    return res.send(`\uFEFF${[headers.join(','), ...rows].join('\n')}`);
  } catch (err) {
    return res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

router.get('/grades-json', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { students, classStats } = await buildClassData();
    return res.json({ code: 200, message: 'ok', data: { students, class_stats: classStats } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '获取数据失败', data: null });
  }
});

module.exports = router;
