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
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 2;
  const retryDelay = Number.isInteger(options.retryDelay) ? options.retryDelay : 800;

  function send(attempt) {
    return new Promise((resolve, reject) => {
      let settled = false;

      if (app.globalData.apiMode === 'cloud-function') {
        const [rawPath, queryString] = path.split('?');
        const apiPath = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`;
        const query = {};
        (queryString || '').split('&').filter(Boolean).forEach(pair => {
          const [key, value = ''] = pair.split('=');
          query[decodeURIComponent(key)] = decodeURIComponent(value);
        });
        wx.cloud.callFunction({
          name: app.globalData.cloudFunctionName,
          data: {
            method: options.method || 'GET',
            path: apiPath,
            query,
            body: options.data || {},
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...options.headers,
            },
          },
          success(res) {
            const result = res.result || {};
            if (result.code === 401) {
              wx.removeStorageSync('token');
              wx.removeStorageSync('openid');
              wx.navigateTo({ url: '/pages/index/index' });
              reject(new Error('登录已过期'));
              return;
            }
            settled = true;
            resolve(result);
          },
          fail(err) {
            if (settled) return;
            settled = true;
            console.error('云函数请求失败:', err);
            wx.showToast({ title: '网络开小差了，请稍后重试', icon: 'none' });
            reject(err);
          },
        });
        return;
      }

      const retryableErrors = [
        'ERR_NETWORK_CHANGED',
        'ERR_CONNECTION_REFUSED',
        'ERR_CONNECTION_RESET',
        'ERR_CONNECTION_CLOSED',
        'timeout',
      ];

      const isRetryable = err => {
        const message = String(err && err.errMsg || '').toLowerCase();
        return retryableErrors.some(error => message.includes(error.toLowerCase()));
      };

      const finishFailure = err => {
        if (settled) return;
        settled = true;
        if (attempt < maxRetries && isRetryable(err)) {
          setTimeout(() => {
            send(attempt + 1).then(resolve).catch(reject);
          }, retryDelay * (attempt + 1));
          return;
        }
        console.error('请求失败:', err);
        wx.showToast({ title: '网络开小差了，请稍后重试', icon: 'none' });
        reject(err);
      };

    wx.request({
      url: baseUrl + path,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      timeout: options.timeout || 30000,
      success(res) {
        if (res.data.code === 401) {
          // Token 过期，重新登录
          wx.removeStorageSync('token');
          wx.removeStorageSync('openid');
          wx.navigateTo({ url: '/pages/index/index' });
          reject(new Error('登录已过期'));
          return;
        }
        settled = true;
        resolve(res.data);
      },
      fail(err) {
        finishFailure(err);
      },
    });
    });
  }

  return send(0);
}

module.exports = { request };
