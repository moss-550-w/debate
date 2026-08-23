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
        const invoke = body => wx.cloud.callFunction({
          name: app.globalData.cloudFunctionName,
          data: {
            method: options.method || 'GET',
            path: apiPath,
            query,
            body,
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
        if (options.filePath) {
          wx.cloud.uploadFile({
            cloudPath: `temp-audio/${Date.now()}_${Math.random().toString(36).slice(2)}.wav`,
            filePath: options.filePath,
            success(uploadRes) {
              const body = { ...(options.data || {}) };
              delete body.audio_base64;
              delete body.audio;
              invoke({ ...body, audio_file_id: uploadRes.fileID });
            },
            fail(err) {
              console.error('音频上传失败:', err);
              reject(err);
            },
          });
        } else {
          invoke(options.data || {});
        }
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

function decodeChunk(data) {
  if (typeof data === 'string') return data;
  try {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(data);
  } catch (_) {
    // 兼容部分旧版基础库
  }
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  try {
    return decodeURIComponent(escape(binary));
  } catch (_) {
    return binary;
  }
}

/**
 * 订阅 SSE 流式接口。
 * 云函数不能透传分块响应，因此自动降级到普通接口；云托管/本地模式使用真实增量输出。
 */
function requestStream(path, options = {}) {
  const baseUrl = app.globalData.apiBaseUrl;
  const token = wx.getStorageSync('token');
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const fallbackPath = options.fallbackPath || path.replace(/\/stream(?=\?|$)/, '');

  if (app.globalData.apiMode === 'cloud-function') {
    const fallbackOptions = { ...options };
    delete fallbackOptions.onEvent;
    delete fallbackOptions.fallbackPath;
    return request(fallbackPath, fallbackOptions).then(result => {
      if (result && result.code === 200) onEvent({ type: 'done', data: result.data || {} });
      return result;
    });
  }

  return new Promise((resolve, reject) => {
    let buffer = '';
    let finalResult = null;
    let streamError = null;
    let settled = false;

    const handleFrame = frame => {
      const lines = frame.split(/\r?\n/);
      const eventLine = lines.find(line => line.startsWith('event:')) || '';
      const dataLines = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
      if (!dataLines.length) return;

      let payload;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch (_) {
        return;
      }

      const type = eventLine.slice(6).trim() || payload.type || 'message';
      const event = { type, data: payload.data !== undefined ? payload.data : payload };
      onEvent(event);
      if (type === 'done') finalResult = { code: 200, message: 'ok', data: event.data || {} };
      if (type === 'error') streamError = new Error((event.data && event.data.message) || '流式响应失败');
    };

    const handleChunk = chunk => {
      buffer += decodeChunk(chunk);
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      frames.forEach(handleFrame);
    };

    const requestTask = wx.request({
      url: baseUrl + path,
      method: options.method || 'POST',
      data: options.data || {},
      enableChunked: true,
      timeout: options.timeout || 60000,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      success(res) {
        if (settled) return;
        if (res.data && res.data.code === 401) {
          settled = true;
          wx.removeStorageSync('token');
          wx.removeStorageSync('openid');
          wx.navigateTo({ url: '/pages/index/index' });
          reject(new Error('登录已过期'));
          return;
        }
        if (buffer.trim()) handleFrame(buffer);
        settled = true;
        if (streamError) {
          reject(streamError);
        } else if (finalResult) {
          resolve(finalResult);
        } else if (res.data && typeof res.data === 'object') {
          resolve(res.data);
        } else {
          reject(new Error('流式响应未完成'));
        }
      },
      fail(err) {
        if (settled) return;
        settled = true;
        reject(err);
      },
    });

    if (requestTask && typeof requestTask.onChunkReceived === 'function') {
      requestTask.onChunkReceived(result => handleChunk(result.data));
    } else {
      requestTask && requestTask.abort && requestTask.abort();
      reject(new Error('当前微信基础库不支持流式响应'));
    }
  });
}

module.exports = { request, requestStream };
