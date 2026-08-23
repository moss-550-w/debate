const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { createApp } = require('../src/app');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(path, baseUrl);
    const request = http.request(requestUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch (err) {}
        resolve({ status: response.statusCode, data });
      });
    });
    request.on('error', reject);
    request.end(options.body);
  });
}

test.before(async () => {
  server = http.createServer(createApp({ includeStatic: false }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('health reports process and dependency states', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.data.code, 200);
  assert.equal(response.data.data.status, 'running');
  assert.equal(typeof response.data.data.ready, 'boolean');
  for (const key of ['database', 'auth', 'ai', 'speech', 'sms']) {
    assert.equal(typeof response.data.data[key], 'boolean');
  }
});

test('ready exposes dependency checks and fails when local dependencies are unavailable', async () => {
  const response = await request('/api/ready');
  assert.equal(response.status, 503);
  assert.equal(response.data.code, 503);
  assert.equal(response.data.data.ready, false);
  assert.equal(typeof response.data.data.checks.database, 'boolean');
  assert.equal(typeof response.data.data.checks.auth, 'boolean');
});

test('topics uses server-side pagination contract', async () => {
  const response = await request('/api/topics?page=1&size=2');
  assert.equal(response.status, 200);
  assert.equal(response.data.code, 200);
  assert.equal(response.data.data.page, 1);
  assert.equal(response.data.data.size, 2);
  assert.ok(response.data.data.list.length <= 2);
  assert.equal(typeof response.data.data.total, 'number');
});

test('management endpoints reject missing authentication', async () => {
  const response = await request('/api/users?page=1&size=2');
  assert.equal(response.status, 401);
  assert.equal(response.data.code, 401);
});
