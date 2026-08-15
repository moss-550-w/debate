/**
 * 登录/登出逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  // 检查是否已登录
  const token = localStorage.getItem('token');
  if (token) {
    showAdminPage();
  }

  // 登录表单提交
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // 发送验证码
  document.getElementById('sendCodeBtn').addEventListener('click', handleSendCode);

  // 菜单切换
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', handleNavClick);
  });
});

/**
 * 处理登录
 */
async function handleLogin(e) {
  e.preventDefault();

  const phone = document.getElementById('phone').value.trim();
  const code = document.getElementById('code').value.trim();

  if (!phone || !code) {
    showToast('请填写手机号和验证码', 'error');
    return;
  }

  // MVP阶段：验证码写死检查
  if (code !== CONFIG.ADMIN_CODE) {
    showToast('验证码错误（MVP阶段验证码：123456）', 'error');
    return;
  }

  // 模拟登录成功
  const token = `admin_${phone}_${Date.now()}`;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify({ phone, role: 'admin' }));

  showToast('登录成功', 'success');
  showAdminPage();
}

/**
 * 处理登出
 */
function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.getElementById('loginPage').style.display = '';
  document.getElementById('adminPage').style.display = 'none';
  showToast('已退出登录', 'info');
}

/**
 * 发送验证码
 */
function handleSendCode() {
  const phone = document.getElementById('phone').value.trim();
  if (!phone || phone.length !== 11) {
    showToast('请输入正确的手机号', 'error');
    return;
  }

  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true;
  btn.textContent = '60s';

  showToast('验证码已发送（MVP阶段：123456）', 'info');

  let countdown = 60;
  const timer = setInterval(() => {
    countdown--;
    btn.textContent = `${countdown}s`;
    if (countdown <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = '获取验证码';
    }
  }, 1000);
}

/**
 * 显示管理后台
 */
function showAdminPage() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('adminPage').style.display = '';

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  document.getElementById('currentUser').textContent = user.phone || '管理员';
}

/**
 * 菜单切换
 */
function handleNavClick(e) {
  e.preventDefault();
  const target = this.dataset.page;

  // 高亮当前菜单
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  this.classList.add('active');

  // 切换页面
  document.querySelectorAll('.page-section').forEach(section => {
    section.style.display = 'none';
  });
  document.getElementById(`${target}Page`).style.display = '';
}