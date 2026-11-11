import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentStorageKey } from '../src/environment.ts';
import developmentWorker from '../worker/development.ts';
test('development writes/removals do not overwrite legacy production state', () => {
  const keys = ['heibon-mahjong-last-rules', 'heibon-mahjong-online-session', 'heibon-mahjong-diagnostics-v2', 'heibon-mahjong-diagnostics-v1', 'heibon-mahjong-diagnostics-checkpoint-v1', 'heibon-mahjong-diagnostics-build-v1'];
  const storage = new Map(keys.map(key => [key, 'existing-production']));
  for (const key of keys) {
    assert.equal(environmentStorageKey(key, 'production'), key);
    storage.set(environmentStorageKey(key, 'development'), 'dev');
    storage.delete(environmentStorageKey(key, 'development'));
    assert.equal(storage.get(key), 'existing-production');
  }
});
test('development Worker rejects itch.io but accepts the shared Pages Origin', async () => {
  const rejected = await developmentWorker.fetch(new Request('https://worker.invalid/health', { headers: { Origin: 'https://html-classic.itch.zone' } }), {} as Env);
  assert.equal(rejected.status, 403);
  const accepted = await developmentWorker.fetch(new Request('https://worker.invalid/health', { headers: { Origin: 'https://ak-sekine.github.io' } }), {} as Env);
  assert.equal(accepted.status, 200);
});
