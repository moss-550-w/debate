/**
 * 数据导出路由
 * 教师/管理员导出学生成绩、练习记录等为 CSV 文件
 * 支持 Bearer token（header）和 ?token= 查询参数两种鉴权方式
 */
const express = require('express');
const router = express.Router();

/**
 * 轻量鉴权：支持 header Bearer token 和 query ?token=
 */
function lightAuth(req, res, next) {
  // 优先从 header 取
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  // 回退到 query 参数
  if (!token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ code: 401, message: '未授权，缺少有效 Token', data: null });
  }

  req.user = { openid: token, role: 'admin' };
  next();
}

/**
 * 生成模拟学生成绩数据（云数据库接入后替换为真实查询）
 */
function getMockStudents() {
  return [
    { name: '张三', grade: '三年级', practice_count: 8, avg_pronunciation: 78, avg_fluency: 72, avg_logic: 65, avg_vocabulary: 80, avg_reaction: 70, total_duration_min: 45, last_practice: '2026-08-15' },
    { name: '李四', grade: '三年级', practice_count: 12, avg_pronunciation: 85, avg_fluency: 80, avg_logic: 75, avg_vocabulary: 82, avg_reaction: 78, total_duration_min: 68, last_practice: '2026-08-16' },
    { name: '王五', grade: '四年级', practice_count: 5, avg_pronunciation: 65, avg_fluency: 60, avg_logic: 58, avg_vocabulary: 70, avg_reaction: 55, total_duration_min: 22, last_practice: '2026-08-10' },
    { name: '赵六', grade: '四年级', practice_count: 15, avg_pronunciation: 90, avg_fluency: 88, avg_logic: 85, avg_vocabulary: 92, avg_reaction: 87, total_duration_min: 90, last_practice: '2026-08-16' },
    { name: '孙七', grade: '三年级', practice_count: 6, avg_pronunciation: 72, avg_fluency: 68, avg_logic: 70, avg_vocabulary: 75, avg_reaction: 66, total_duration_min: 30, last_practice: '2026-08-14' },
    { name: '周八', grade: '五年级', practice_count: 10, avg_pronunciation: 82, avg_fluency: 79, avg_logic: 80, avg_vocabulary: 85, avg_reaction: 76, total_duration_min: 55, last_practice: '2026-08-15' },
    { name: '吴九', grade: '五年级', practice_count: 3, avg_pronunciation: 55, avg_fluency: 50, avg_logic: 48, avg_vocabulary: 60, avg_reaction: 45, total_duration_min: 12, last_practice: '2026-08-08' },
    { name: '郑十', grade: '四年级', practice_count: 9, avg_pronunciation: 76, avg_fluency: 74, avg_logic: 72, avg_vocabulary: 78, avg_reaction: 73, total_duration_min: 48, last_practice: '2026-08-16' },
  ];
}

/**
 * GET /api/export/grades
 * 导出全班学生成绩为 CSV 文件（需鉴权）
 */
router.get('/grades', lightAuth, (req, res) => {
  try {
    const students = getMockStudents();

    students.forEach(s => {
      s.avg_overall = Math.round(
        (s.avg_pronunciation + s.avg_fluency + s.avg_logic + s.avg_vocabulary + s.avg_reaction) / 5
      );
    });

    const headers = [
      '姓名', '年级', '练习次数', '发音准确度', '流利度',
      '逻辑性', '词汇量', '反应速度', '综合平均分', '累计时长(分钟)', '最近练习日期',
    ];

    const rows = students.map(s => [
      s.name,
      s.grade,
      s.practice_count,
      s.avg_pronunciation,
      s.avg_fluency,
      s.avg_logic,
      s.avg_vocabulary,
      s.avg_reaction,
      s.avg_overall,
      s.total_duration_min,
      s.last_practice,
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent('学生成绩_' + new Date().toISOString().slice(0, 10))}.csv"`
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ code: 500, message: '导出失败', data: null });
  }
});

/**
 * GET /api/export/grades-json
 * 返回班级成绩概览 JSON（供前端看板使用）
 */
router.get('/grades-json', lightAuth, (req, res) => {
  try {
    const students = getMockStudents();

    students.forEach(s => {
      s.avg_overall = Math.round(
        (s.avg_pronunciation + s.avg_fluency + s.avg_logic + s.avg_vocabulary + s.avg_reaction) / 5
      );
    });

    const classStats = {
      total_students: students.length,
      total_practices: students.reduce((sum, s) => sum + s.practice_count, 0),
      total_duration_min: students.reduce((sum, s) => sum + s.total_duration_min, 0),
      avg_pronunciation: Math.round(students.reduce((sum, s) => sum + s.avg_pronunciation, 0) / students.length),
      avg_fluency: Math.round(students.reduce((sum, s) => sum + s.avg_fluency, 0) / students.length),
      avg_logic: Math.round(students.reduce((sum, s) => sum + s.avg_logic, 0) / students.length),
      avg_vocabulary: Math.round(students.reduce((sum, s) => sum + s.avg_vocabulary, 0) / students.length),
      avg_reaction: Math.round(students.reduce((sum, s) => sum + s.avg_reaction, 0) / students.length),
      avg_overall: Math.round(students.reduce((sum, s) => sum + s.avg_overall, 0) / students.length),
    };

    res.json({
      code: 200,
      message: 'ok',
      data: { students, class_stats: classStats },
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取数据失败', data: null });
  }
});

module.exports = router;