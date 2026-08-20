/**
 * 登录/登出逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 检查是否已登录（Token 需经服务端校验真实有效）
  const token = localStorage.getItem('token');
  if (token) {
    const res = await apiRequest('/auth/verify', { method: 'GET' });
    if (res && res.code === 200) {
      localStorage.setItem('user', JSON.stringify(res.data.user));
      showAdminPage();
      loadAdminData();
    } else if (res) {
      // 401 时 apiRequest 已清除本地凭据；网络失败(code 500)保留登录态下次再验
      if (res.code === 500) {
        showAdminPage();
      } else {
        showToast('登录已过期，请重新登录', 'info');
      }
    }
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
 * 处理登录（服务端校验验证码，首次登录自动注册）
 */
async function handleLogin(e) {
  e.preventDefault();

  const phone = document.getElementById('phone').value.trim();
  const code = document.getElementById('code').value.trim();

  if (!phone || !code) {
    showToast('请填写手机号和验证码', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });

  btn.disabled = false;

  if (res && res.code === 200 && res.data) {
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));

    showToast(res.data.is_new_user ? '注册成功' : '登录成功', 'success');
    showAdminPage();
    loadAdminData();
  } else {
    showToast((res && res.message) || '登录失败，请稍后重试', 'error');
  }
}

/**
 * 登录成功后加载数据
 */
function loadAdminData() {
  if (typeof loadTopics === 'function') loadTopics();
  if (typeof loadGrowthDashboard === 'function') loadGrowthDashboard();
  if (typeof loadTournamentList === 'function') loadTournamentList();
  if (typeof loadCommentsList === 'function') loadCommentsList();
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
 * 发送验证码（服务端生成真实随机验证码）
 */
async function handleSendCode() {
  const phone = document.getElementById('phone').value.trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    showToast('请输入正确的手机号', 'error');
    return;
  }

  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true;
  btn.textContent = '发送中...';

  const res = await apiRequest('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  if (res && res.code === 200) {
    startCodeCountdown(btn, 60);
    if (res.data && res.data.dev_code) {
      // 短信渠道未接入：验证码由服务端生成，直接回填输入框
      document.getElementById('code').value = res.data.dev_code;
      showToast(`验证码：${res.data.dev_code}（已自动填入）`, 'info');
    } else {
      showToast('验证码已发送，请查收短信', 'success');
    }
  } else {
    btn.disabled = false;
    btn.textContent = '获取验证码';
    showToast((res && res.message) || '验证码发送失败', 'error');
  }
}

/**
 * 验证码按钮倒计时
 */
function startCodeCountdown(btn, seconds) {
  let countdown = seconds;
  btn.textContent = `${countdown}s`;
  const timer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = '获取验证码';
    } else {
      btn.textContent = `${countdown}s`;
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
  const roleLabels = { developer: '开发者', admin: '开发者', teacher: '教师' };
  document.getElementById('currentUser').textContent = `${user.phone || '管理员'} · ${roleLabels[user.role] || '管理人员'}`;
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
