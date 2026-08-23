const crypto = require('crypto');
const https = require('https');

function isTencentSmsConfigured() {
  return [
    process.env.TENCENT_SMS_SECRET_ID || process.env.TCB_SECRET_ID,
    process.env.TENCENT_SMS_SECRET_KEY || process.env.TCB_SECRET_KEY,
    process.env.TENCENT_SMS_SDK_APP_ID,
    process.env.TENCENT_SMS_SIGN_NAME,
    process.env.TENCENT_SMS_TEMPLATE_ID,
  ].every(value => String(value || '').trim());
}

function requestTencentSms({ phone, code }) {
  const secretId = String(process.env.TENCENT_SMS_SECRET_ID || process.env.TCB_SECRET_ID || '').trim();
  const secretKey = String(process.env.TENCENT_SMS_SECRET_KEY || process.env.TCB_SECRET_KEY || '').trim();
  const sdkAppId = String(process.env.TENCENT_SMS_SDK_APP_ID || '').trim();
  const signName = String(process.env.TENCENT_SMS_SIGN_NAME || '').trim();
  const templateId = String(process.env.TENCENT_SMS_TEMPLATE_ID || '').trim();
  const endpoint = 'sms.tencentcloudapi.com';

  if (!isTencentSmsConfigured()) {
    return Promise.resolve({ configured: false });
  }

  const payload = JSON.stringify({
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [String(code), '5'],
    PhoneNumberSet: [`+86${phone}`],
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = 'sms';
  const algorithm = 'TC3-HMAC-SHA256';
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${endpoint}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: endpoint,
      method: 'POST',
      path: '/',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: endpoint,
        'X-TC-Action': 'SendSms',
        'X-TC-Version': '2021-01-11',
        'X-TC-Region': process.env.TENCENT_SMS_REGION || 'ap-guangzhou',
        'X-TC-Timestamp': String(timestamp),
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        try {
          const result = JSON.parse(text);
          const error = result.Response && result.Response.Error;
          if (error) return reject(new Error(error.Message || error.Code || '短信发送失败'));
          resolve({ configured: true, requestId: result.Response && result.Response.RequestId });
        } catch (err) {
          reject(new Error('短信服务返回格式错误'));
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('短信服务请求超时')));
    request.end(payload);
  });
}

module.exports = { requestTencentSms, isTencentSmsConfigured };
