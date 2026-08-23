const logger = require('../utils/logger');

let cachedToken = null;
let tokenExpiresAt = 0;

class SpeechEvaluationError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'SpeechEvaluationError';
    this.statusCode = statusCode;
  }
}

async function getAccessToken() {
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new SpeechEvaluationError('语音评测服务未配置，请联系管理员配置百度语音 API 凭证');
  }

  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
  const response = await fetch(url, { method: 'POST' });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    logger.warn('百度语音 Token 获取失败', {
      status: response.status,
      error: data.error_description || data.error,
    });
    throw new SpeechEvaluationError('语音评测服务认证失败，请检查百度语音 API 配置');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max((data.expires_in || 0) - 300, 60) * 1000;
  return cachedToken;
}

function normalizeWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function alignWords(referenceWords, spokenWords) {
  const rows = referenceWords.length + 1;
  const columns = spokenWords.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = referenceWords[row - 1] === spokenWords[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  const wordScores = [];
  let row = referenceWords.length;
  let column = spokenWords.length;
  let matchedWords = 0;

  while (row > 0) {
    if (
      column > 0 &&
      matrix[row][column] === matrix[row - 1][column - 1] &&
      referenceWords[row - 1] === spokenWords[column - 1]
    ) {
      wordScores.unshift({ word: referenceWords[row - 1], score: 100 });
      matchedWords += 1;
      row -= 1;
      column -= 1;
    } else if (column > 0 && matrix[row][column] === matrix[row - 1][column - 1] + 1) {
      wordScores.unshift({ word: referenceWords[row - 1], score: 35 });
      row -= 1;
      column -= 1;
    } else {
      wordScores.unshift({ word: referenceWords[row - 1], score: 0 });
      row -= 1;
    }
  }

  return { distance: matrix[referenceWords.length][spokenWords.length], matchedWords, wordScores };
}

async function transcribeEnglish(audioBase64, audioFormat) {
  const token = await getAccessToken();
  const audioBytes = Buffer.byteLength(audioBase64, 'base64');
  const response = await fetch('https://vop.baidu.com/server_api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: audioFormat,
      rate: 16000,
      channel: 1,
      cuid: process.env.BAIDU_CUID || 'debate-training-cloudrun',
      token,
      dev_pid: 1737,
      speech: audioBase64,
      len: audioBytes,
    }),
  });
  const data = await response.json();

  if (!response.ok || data.err_no !== 0 || !Array.isArray(data.result) || !data.result[0]) {
    logger.warn('百度英文语音识别失败', {
      status: response.status,
      errNo: data.err_no,
      errMsg: data.err_msg,
    });
    throw new SpeechEvaluationError('未识别到清晰的英文语音，请检查录音权限、网络后重试', 422);
  }

  return data.result.join(' ').trim();
}

function scoreTranscript(transcript, refText, durationSec) {
  const referenceWords = normalizeWords(refText);
  if (referenceWords.length === 0) {
    throw new SpeechEvaluationError('参考文本不能为空', 400);
  }

  const spokenWords = normalizeWords(transcript);
  if (spokenWords.length === 0) {
    throw new SpeechEvaluationError('未识别到清晰的英文语音，请重新录制', 422);
  }

  const { distance, matchedWords, wordScores } = alignWords(referenceWords, spokenWords);
  const accuracy = matchedWords / referenceWords.length;
  const estimatedDuration = Number.isFinite(Number(durationSec)) && Number(durationSec) > 0
    ? Number(durationSec)
    : spokenWords.length / 2.2;
  const wordsPerSecond = spokenWords.length / Math.max(estimatedDuration, 1);
  const paceScore = Math.max(0, 100 - Math.abs(wordsPerSecond - 2.2) * 28);
  const precision = matchedWords / Math.max(spokenWords.length, 1);

  const pronunciation = Math.round(Math.min(100, Math.max(0, (accuracy * 75 + precision * 25) * 100)));
  const fluency = Math.round(Math.min(100, Math.max(0, paceScore * 0.7 + accuracy * 30)));
  const integrity = Math.round(Math.min(100, Math.max(0, accuracy * 100)));
  const overall = Math.round(pronunciation * 0.4 + fluency * 0.25 + integrity * 0.35);

  logger.info('英文跟读评测完成', {
    referenceWordCount: referenceWords.length,
    spokenWordCount: spokenWords.length,
    matchedWords,
    distance,
    overall,
  });

  return {
    pronunciation,
    fluency,
    integrity,
    overall,
    word_scores: wordScores,
    transcript,
  };
}

async function evaluate(audioBase64, refText, format = 'wav', durationSec) {
  const audioFormat = String(format).toLowerCase();
  if (!['wav', 'pcm', 'amr', 'm4a'].includes(audioFormat)) {
    throw new SpeechEvaluationError('不支持的录音格式，请使用 WAV 格式重新录制', 400);
  }

  const transcript = await transcribeEnglish(audioBase64, audioFormat);
  const estimatedDuration = durationSec || Buffer.byteLength(audioBase64, 'base64') / 32000;
  return scoreTranscript(transcript, refText, estimatedDuration);
}

async function evaluateChunks(audioChunks, refText, format = 'wav', durationSec) {
  const audioFormat = String(format).toLowerCase();
  if (!['wav', 'pcm', 'amr', 'm4a'].includes(audioFormat)) {
    throw new SpeechEvaluationError('不支持的录音格式，请使用 WAV 格式重新录制', 400);
  }
  if (!Array.isArray(audioChunks) || audioChunks.length === 0) {
    throw new SpeechEvaluationError('缺少音频分段数据', 400);
  }

  const transcripts = [];
  for (const audioBase64 of audioChunks) {
    transcripts.push(await transcribeEnglish(audioBase64, audioFormat));
  }
  return scoreTranscript(transcripts.join(' '), refText, durationSec);
}

function evaluateTranscript(transcript, refText, durationSec) {
  return scoreTranscript(transcript, refText, durationSec);
}

module.exports = { evaluate, evaluateChunks, evaluateTranscript, transcribeEnglish, SpeechEvaluationError };
