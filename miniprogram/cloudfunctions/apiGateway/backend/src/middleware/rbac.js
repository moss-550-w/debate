const ROLE_ALIASES = {
  admin: 'developer',
  coach: 'teacher',
  pupil: 'student',
};

const ROLE_LABELS = {
  developer: '开发者',
  teacher: '教师',
  student: '学生',
};

function normalizeRole(role) {
  return ROLE_ALIASES[role] || (ROLE_LABELS[role] ? role : 'student');
}

function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.student;
}

function isManagementRole(role) {
  return ['developer', 'teacher'].includes(normalizeRole(role));
}

function requireRoles(...roles) {
  const allowed = new Set(roles.map(normalizeRole));
  return (req, res, next) => {
    if (!req.user || !allowed.has(normalizeRole(req.user.role))) {
      return res.status(403).json({ code: 403, message: '无权执行此操作', data: null });
    }
    return next();
  };
}

function requireManagement(req, res, next) {
  return requireRoles('developer', 'teacher')(req, res, next);
}

function requireDeveloper(req, res, next) {
  return requireRoles('developer')(req, res, next);
}

function isStudentOf(user, student) {
  if (!user || !student) return false;
  const userId = user.userId || user.openid;
  return student._id === userId || student.openid === user.openid;
}

function canManageStudent(user, student) {
  const role = normalizeRole(user && user.role);
  if (role === 'developer') return true;
  if (role !== 'teacher' || !student) return false;
  const teacherId = user.userId || user.openid;
  return student.teacher_id === teacherId || student.teacherId === teacherId;
}

module.exports = {
  ROLE_LABELS,
  normalizeRole,
  roleLabel,
  isManagementRole,
  requireRoles,
  requireManagement,
  requireDeveloper,
  isStudentOf,
  canManageStudent,
};
