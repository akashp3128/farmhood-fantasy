import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeRecovery } from './sanitize-recovery.mjs';

test('removes raw model payloads while preserving recoverable structured copy and receipts', () => {
  const sanitized = sanitizeRecovery({
    schemaVersion: 1,
    kind: 'farmhood_press_v2_recovery',
    articleId: 'shadow-1',
    generatedAt: '2026-10-04T12:00:00.000Z',
    validationStatus: 'rejected',
    paidStages: ['research', 'writer'],
    rawResponses: { research: { secretRaw: true, output_text: '{"claims":[]}' }, writer: { secretRaw: true, output_text: '{"title":"Recover me"}' } },
    acceptedResearch: { claims: [] },
    article: { title: 'Recover me' },
    validationError: 'Copy desk rejected it.'
  });
  assert.equal(sanitized.kind, 'farmhood_press_v2_sanitized_recovery');
  assert.equal(sanitized.rawResponses, undefined);
  assert.equal(sanitized.article.title, 'Recover me');
  assert.equal(sanitized.recoverableStructuredOutputs.writer, '{"title":"Recover me"}');
  assert.deepEqual(sanitized.paidStages, ['research', 'writer']);
});
