import assert from 'node:assert/strict';
import test from 'node:test';
import { logWorker, type WorkerLog } from '../worker/diagnostics.ts';

test('Worker structured logs keep operation identifiers and exclude private values', () => {
  const records: unknown[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => records.push(...values);
  try {
    logWorker({
      event: 'game_action_failed',
      level: 'WARN',
      actionType: 'discard',
      requestId: '9c6c1905-8b4a-4e9a-91e8-a56c74a4d57f',
      gameRevision: 42,
      durationMs: 18,
      errorCode: 'stale_revision',
      result: 'rejected',
      authorization: 'Bearer secret-token',
      cookie: 'session=secret-cookie',
      ipAddress: '203.0.113.10',
      hand: ['private-tile'],
      request: { headers: { authorization: 'secret' } },
      error: new Error('secret exception text'),
    } as WorkerLog);
  } finally {
    console.log = originalLog;
  }

  assert.equal(records.length, 1);
  const record = records[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(record).sort(), [
    'actionType', 'durationMs', 'errorCode', 'event', 'gameRevision', 'level', 'requestId', 'result', 'timestamp',
  ]);
  assert.equal(record.requestId, '9c6c1905-8b4a-4e9a-91e8-a56c74a4d57f');
  assert.equal(record.gameRevision, 42);
  assert.equal(record.errorCode, 'stale_revision');
  assert.equal(JSON.stringify(record).includes('secret'), false);
  assert.equal(JSON.stringify(record).includes('203.0.113.10'), false);
  assert.equal(JSON.stringify(record).includes('private-tile'), false);
});

test('Worker logger omits a token-shaped requestId', () => {
  const records: unknown[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => records.push(...values);
  try {
    logWorker({
      event: 'game_action_received',
      level: 'INFO',
      requestId: 'a'.repeat(64),
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal('requestId' in (records[0] as Record<string, unknown>), false);
});
