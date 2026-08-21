process.env.TENCENTCLOUD_RUNENV = '1';
process.env.CLOUD_FUNCTION = '1';

const { Readable } = require('stream');
const cloud = require('wx-server-sdk');
const { createApp, initializeDatabase } = require('./backend/src/app');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      await initializeDatabase();
      return createApp({ includeStatic: false });
    })();
  }
  return appPromise;
}

function createRequest(event, context, wxContext = {}) {
  const method = String(event.method || 'GET').toUpperCase();
  const path = String(event.path || '/api/health');
  const openid = context.OPENID || wxContext.OPENID || wxContext.openid || '';
  const queryString = Object.entries(event.query || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const payload = ['GET', 'HEAD'].includes(method) ? null : JSON.stringify(event.body || {});
  const request = Readable.from(payload ? [Buffer.from(payload)] : []);

  request.method = method;
  request.url = `${path}${queryString ? `?${queryString}` : ''}`;
  request.originalUrl = request.url;
  request.headers = Object.entries(event.headers || {}).reduce((headers, [key, value]) => {
    headers[key.toLowerCase()] = String(value);
    return headers;
  }, {});
  request.headers.host = 'cloud-function';
  if (openid) request.headers['x-cloud-function-openid'] = openid;
  // 小程序端当前使用已保存的会话 Token。不能无条件改写成 context.OPENID，
  // 否则 /growth/:userId 中的用户 ID 会与鉴权用户不一致并返回 403。
  if ((!request.headers.authorization || request.headers.authorization === 'Bearer ' || request.headers.authorization.includes('mp_user_')) && openid) {
    request.headers.authorization = `Bearer ${openid}`;
  }
  if (payload) {
    request.headers['content-type'] = 'application/json';
    request.headers['content-length'] = String(Buffer.byteLength(payload));
  }
  request.socket = { remoteAddress: openid || 'cloud-function' };
  request.connection = request.socket;
  return request;
}

async function prepareAudio(event) {
  const fileID = event.audio_file_id || (event.body && event.body.audio_file_id);
  if (!fileID) return { event, fileID: null };

  const file = await cloud.downloadFile({ fileID });
  const audioBase64 = file.fileContent.toString('base64');
  const body = { ...(event.body || {}) };
  delete body.audio_file_id;
  body.audio_base64 = audioBase64;
  body.audio = audioBase64;
  return { event: { ...event, body }, fileID };
}

function invokeApp(app, request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let completed = false;
    const response = Object.create(app.response);
    response.statusCode = 200;
    response.writableEnded = false;
    response.headers = {};
    response.setHeader = (name, value) => { response.headers[String(name).toLowerCase()] = value; };
    response.getHeader = name => response.headers[String(name).toLowerCase()];
    response.getHeaderNames = () => Object.keys(response.headers);
    response.removeHeader = name => delete response.headers[String(name).toLowerCase()];
    response.hasHeader = name => Object.prototype.hasOwnProperty.call(response.headers, String(name).toLowerCase());
    response.writeHead = (statusCode, headers) => {
      response.statusCode = statusCode;
      Object.entries(headers || {}).forEach(([name, value]) => response.setHeader(name, value));
      return response;
    };
    response.assignSocket = () => {};
    response.detachSocket = () => {};
    response.getHeader = response.getHeader || (name => response.headers[String(name).toLowerCase()]);
    response.write = chunk => {
      chunks.push(Buffer.from(chunk));
      return true;
    };
    response.end = chunk => {
      if (chunk !== undefined && chunk !== null) response.write(chunk);
      response.writableEnded = true;
      if (completed) return response;
      completed = true;
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        resolve({ code: response.statusCode, message: text || '接口返回格式错误', data: null });
      }
      return response;
    };
    response.on = () => response;
    response.once = () => response;
    response.emit = () => false;

    response.req = request;
    request.res = response;
    app.handle(request, response, err => {
      if (err) {
        reject(err);
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
}

exports.main = async (event, context) => {
  const path = String(event.path || '/api/health');
  if (!path.startsWith('/api/')) {
    return { code: 400, message: '无效的 API 路径', data: null };
  }

  try {
    const app = await getApp();
    // Node.js 20 运行时不保证把用户身份放在 context.OPENID，
    // 使用官方 SDK 获取身份，兼容开发者工具、体验版和正式版调用。
    const wxContext = typeof cloud.getWXContext === 'function' ? cloud.getWXContext() : {};
    const prepared = await prepareAudio(event);
    try {
      return await invokeApp(app, createRequest(prepared.event, context, wxContext));
    } finally {
      if (prepared.fileID) {
        await cloud.deleteFile({ fileList: [prepared.fileID] }).catch(err => {
          console.warn('临时音频删除失败:', err.message);
        });
      }
    }
  } catch (err) {
    console.error('云函数 API 网关异常:', err);
    return { code: 500, message: '服务暂时不可用，请稍后重试', data: null };
  }
};
