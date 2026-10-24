import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticLog } from '../src/online/diagnostics.ts';

class MemoryStorage {
  value: string | null = null;
  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void { this.value = value; }
  removeItem(): void { this.value = null; }
}

test('diagnostic log keeps the newest 200 allowlisted entries and survives reload', async () => {
  const storage = new MemoryStorage();
  const log = new DiagnosticLog(storage);
  for (let index = 0; index < 205; index++) {
    log.record('INFO', 'game_action_completed', { actionType: 'discard', requestId: `req-${index}`, gameRevision: index, secret: 'must not be saved', ticket: 'c'.repeat(64) });
  }
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(log.all().length, 200);
  assert.equal(log.all()[0]?.details.requestId, 'req-5');
  assert.match(log.all()[0]!.timestamp, /^\d{4}-\d\d-\d\dT.*\.\d{3}Z$/u);
  assert.equal(JSON.stringify(log.all()).includes('must not be saved'), false);
  assert.equal(JSON.stringify(log.all()).includes('secret'), false);
  assert.equal(JSON.stringify(log.all()).includes('c'.repeat(64)), false);
  const restored = new DiagnosticLog(storage);
  assert.equal(restored.all().length, 200);
  assert.equal(restored.all()[199]?.details.requestId, 'req-204');
});

test('diagnostic logging safely ignores unavailable and throwing storage', async () => {
  const unavailable = new DiagnosticLog(null);
  assert.doesNotThrow(() => unavailable.record('ERROR', 'action_response_timeout', { requestId: 'abc', durationMs: 15000 }));
  assert.equal(unavailable.all().length, 1);
  const broken = { getItem: () => { throw new Error('private storage exception'); }, setItem: () => { throw new Error('private storage exception'); }, removeItem: () => { throw new Error('private storage exception'); } };
  const log = new DiagnosticLog(broken);
  assert.doesNotThrow(() => log.record('WARN', 'websocket_disconnected', { closeCode: 1006 }));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(log.all().length, 1);
  assert.doesNotThrow(() => log.clear());
});
