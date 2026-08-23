const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateTranscript, SpeechEvaluationError } = require('../src/services/evaluateService');

test('evaluates a merged transcript with the full recording duration', () => {
  const result = evaluateTranscript(
    'good morning judges today we support true love',
    'Good morning judges. Today we support true love.',
    8,
  );

  assert.equal(result.integrity, 100);
  assert.equal(result.transcript, 'good morning judges today we support true love');
  assert.ok(result.overall >= 0 && result.overall <= 100);
});

test('rejects an empty merged transcript', () => {
  assert.throws(
    () => evaluateTranscript('', 'Good morning judges.', 3),
    error => error instanceof SpeechEvaluationError && error.statusCode === 422,
  );
});
