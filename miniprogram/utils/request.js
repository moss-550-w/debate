const app = getApp();

/**
 * 封装 wx.request，统一错误处理
 * @param {string} path - API路径
 * @param {object} options - 请求选项
 * @returns {Promise<object>}
 */
function request(path, options = {}) {
  const baseUrl = app.globalData.apiBaseUrl;
  const token = wx.getStorageSync('token');

  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + path,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      timeout: 30000,
      success(res) {
        if (res.data.code === 401) {
          // Token 过期，重新登录
          wx.removeStorageSync('token');
          wx.removeStorageSync('openid');
          wx.navigateTo({ url: '/pages/index/index' });
          reject(new Error('登录已过期'));
          return;
        }
        resolve(res.data);
      },
      fail(err) {
        console.error('请求失败:', err);
        wx.showToast({ title: '网络开小差了', icon: 'none' });
        reject(err);
      },
    });
  });
}

module.exports = { request };