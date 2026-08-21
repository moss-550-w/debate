/**
 * 通用工具函数
 */

/**
 * 发起 API 请求
 * @param {string} path - 接口路径（如 '/generate'）
 * @param {object} options - 请求选项
 * @returns {Promise<object>} 响应数据
 */
async function apiRequest(path, options = {}) {
  const url = CONFIG.API_BASE_URL + path;
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      data = { code: response.status, message: `服务器返回无效响应（HTTP ${response.status}）`, data: null };
    }

    if (!response.ok && !data.code) {
      data.code = response.status;
    }

    if (data.code === 401) {
      // Token 过期/无效，清除并显示登录页（不 reload，避免死循环）
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const loginPage = document.getElementById('loginPage');
      const adminPage = document.getElementById('adminPage');
      if (loginPage) loginPage.style.display = '';
      if (adminPage) adminPage.style.display = 'none';
      return null;
    }

    return {
      ...data,
      code: data.code || response.status,
      message: data.message || (response.ok ? '请求成功' : `请求失败（HTTP ${response.status}）`),
    };
  } catch (err) {
    console.error('API请求失败:', err);
    return { code: 500, message: `网络请求失败：${err.message}`, data: null };
  }
}

/**
 * 格式化日期
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 显示提示消息
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 12px 24px;
    border-radius: 8px; color: white; font-size: 14px; z-index: 9999;
    animation: fadeIn 0.3s ease;
    background: ${type === 'success' ? '#1e40af' : type === 'error' ? '#475569' : '#2563eb'};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
