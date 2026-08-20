const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const authStore = require('../services/authStore');
const practiceStore = require('../services/practiceStore');
const portfolioStore = require('../services/portfolioStore');
const debateStore = require('../services/debateStore');
const { normalizeRole, roleLabel, requireManagement, requireDeveloper } = require('../middleware/rbac');

const EDITABLE_ROLES = new Set(['developer', 'teacher', 'student']);

function parsePhoneList(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(/[\s,，；;]+/);
  return [...new Set(values.map(phone => String(phone).trim()).filter(Boolean))];
}

function publicUser(user) {
  const role = normalizeRole(user.role);
  return {
    _id: user._id,
    openid: user.openid || '',
    phone: user.phone || '',
    nickname: user.nickname || '小辩手',
    grade: user.grade || '',
    role,
    role_label: roleLabel(role),
    teacher_id: user.teacher_id || '',
    status: user.status || 'active',
    source: user.source || 'miniprogram',
    created_at: user.created_at || '',
    last_login_at: user.last_login_at || '',
  };
}

function canSeeUser(actor, user) {
  const role = normalizeRole(actor.role);
  if (role === 'developer') return true;
  const actorId = actor.userId || actor.openid;
  return normalizeRole(user.role) === 'student' && (user.teacher_id === actorId || user.teacherId === actorId);
}

router.get('/', authMiddleware, requireManagement, async (req, res) => {
  try {
    const [allUsers, speechRecords, portfolioRecords, debateRecords] = await Promise.all([
      authStore.listUsers(),
      practiceStore.list(),
      portfolioStore.list(),
      debateStore.list(),
    ]);
    const teachers = new Map(allUsers.filter(user => normalizeRole(user.role) === 'teacher').map(user => [user._id, user.nickname || user.phone || user._id]));
    const users = allUsers.filter(user => canSeeUser(req.user, user)).map(user => {
      const ids = new Set([user._id, user.openid].filter(Boolean));
      const speech = speechRecords.filter(record => ids.has(record.user_id));
      const portfolios = portfolioRecords.filter(record => ids.has(record.user_id));
      const turns = debateRecords.filter(record => ids.has(record.user_id));
      return {
        ...publicUser(user),
        practice_count: speech.length + portfolios.length + new Set(turns.map(record => record.session_id).filter(Boolean)).size,
        portfolio_count: portfolios.length,
        sparring_sessions: new Set(turns.map(record => record.session_id).filter(Boolean)).size,
        total_duration_min: Math.round(speech.reduce((sum, record) => sum + (Number(record.duration_sec) || 0), 0) / 60),
        teacher_name: teachers.get(user.teacher_id || user.teacherId) || '',
      };
    });
    return res.json({ code: 200, message: 'ok', data: { total: users.length, list: users } });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '获取用户列表失败', data: null });
  }
});

router.post('/authorize-teachers', authMiddleware, requireDeveloper, async (req, res) => {
  const phones = parsePhoneList(req.body.phones || req.body.phone);
  if (!phones.length) {
    return res.status(400).json({ code: 400, message: '请输入至少一个手机号', data: null });
  }
  if (phones.length > 100) {
    return res.status(400).json({ code: 400, message: '单次最多授权100个手机号', data: null });
  }

  const invalidPhones = phones.filter(phone => !/^1[3-9]\d{9}$/.test(phone));
  if (invalidPhones.length) {
    return res.status(400).json({
      code: 400,
      message: '存在无效手机号，请检查后重试',
      data: { invalid_phones: invalidPhones },
    });
  }

  try {
    const results = [];
    for (const phone of phones) {
      const existing = await authStore.findUserByPhone(phone);
      if (!existing) {
        const now = new Date().toISOString();
        const user = {
          _id: `user_${phone}_${crypto.randomBytes(4).toString('hex')}`,
          phone,
          role: 'teacher',
          nickname: '',
          source: 'pc',
          status: 'active',
          created_at: now,
          last_login_at: '',
          login_count: 0,
        };
        await authStore.createUser(user);
        results.push({ phone, action: 'created', role: 'teacher', status: 'active' });
        continue;
      }

      const existingRole = normalizeRole(existing.role);
      if (existingRole === 'developer') {
        results.push({ phone, action: 'kept', role: 'developer', status: existing.status || 'active' });
        continue;
      }

      await authStore.updateUser(existing._id, { role: 'teacher', teacher_id: '', status: 'active' });
      results.push({ phone, action: existingRole === 'teacher' ? 'enabled' : 'promoted', role: 'teacher', status: 'active' });
    }
    return res.json({
      code: 200,
      message: '教师授权完成',
      data: { total: results.length, results },
    });
  } catch (err) {
    return res.status(500).json({ code: 500, message: '教师授权失败，请稍后重试', data: null });
  }
});

router.patch('/:id/role', authMiddleware, requireDeveloper, async (req, res) => {
  const role = normalizeRole(req.body.role);
  if (!EDITABLE_ROLES.has(role)) {
    return res.status(400).json({ code: 400, message: '无效角色', data: null });
  }
  const user = await authStore.findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  if (user._id === req.user.userId && role !== 'developer') {
    return res.status(400).json({ code: 400, message: '不能取消当前开发者权限', data: null });
  }
  await authStore.updateUser(user._id, { role, ...(role !== 'student' ? { teacher_id: '' } : {}) });
  return res.json({ code: 200, message: '角色已更新', data: publicUser({ ...user, role }) });
});

router.patch('/:id/teacher', authMiddleware, requireDeveloper, async (req, res) => {
  const user = await authStore.findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  if (normalizeRole(user.role) !== 'student') return res.status(400).json({ code: 400, message: '只有学生可以分配教师', data: null });
  const teacherId = String(req.body.teacher_id || '').trim();
  const teacher = teacherId ? await authStore.findUserById(teacherId) : null;
  if (teacherId && (!teacher || normalizeRole(teacher.role) !== 'teacher')) {
    return res.status(400).json({ code: 400, message: '教师不存在或角色不正确', data: null });
  }
  await authStore.updateUser(user._id, { teacher_id: teacherId });
  return res.json({ code: 200, message: teacherId ? '教师已分配' : '已解除教师分配', data: publicUser({ ...user, teacher_id: teacherId }) });
});

router.patch('/:id/status', authMiddleware, requireDeveloper, async (req, res) => {
  const user = await authStore.findUserById(req.params.id);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在', data: null });
  const status = req.body.status === 'disabled' ? 'disabled' : 'active';
  if (user._id === req.user.userId && status === 'disabled') {
    return res.status(400).json({ code: 400, message: '不能停用当前账号', data: null });
  }
  await authStore.updateUser(user._id, { status });
  return res.json({ code: 200, message: status === 'active' ? '用户已启用' : '用户已停用', data: publicUser({ ...user, status }) });
});

module.exports = router;
