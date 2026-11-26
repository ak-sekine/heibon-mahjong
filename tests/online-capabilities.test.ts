import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { discoverCapabilities } from '../src/online/capabilities.ts';

const origin = 'https://ak-sekine.github.io';
const fake = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('v1 capability endpoint preserves origin checks and advertises no extensions', async () => {
  const request = new Request('https://example.invalid/api/capabilities', { headers: { Origin: origin } });
  const response = await worker.fetch(request, {} as Env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await response.json(), { protocol: 'heibon-mahjong.v1', features: [] });
  assert.equal((await worker.fetch(new Request(request.url, { headers: { Origin: 'https://evil.invalid' } }), {} as Env)).status, 403);
});

test('only the fixed legacy 404 response falls back to basic v1', async () => {
  assert.deepEqual(await discoverCapabilities('https://example.invalid', fake({ error: 'not_found' }, 404)), { protocol: 'heibon-mahjong.v1', features: [] });
  assert.deepEqual(await discoverCapabilities('https://example.invalid', fake({ protocol: 'heibon-mahjong.v1', features: ['example.v1'] })), { protocol: 'heibon-mahjong.v1', features: ['example.v1'] });
  for (const response of [fake({ error: 'unauthorized' }, 401), fake({ error: 'not_found' }, 403), fake({ error: 'unknown' }, 404), fake({ protocol: 'v2', features: [] }), fake({ protocol: 'heibon-mahjong.v1', features: ['invalid'] })]) {
    await assert.rejects(discoverCapabilities('https://example.invalid', response));
  }
  await assert.rejects(discoverCapabilities('https://example.invalid', (async () => { throw new Error('network'); }) as typeof fetch));
});

test('intersects capabilities without activating unknown server extensions', async () => {
  const { commonFeatures, CLIENT_FEATURES } = await import('../src/online/capabilities.ts');
  const advertised = { protocol: 'heibon-mahjong.v1' as const, features: ['test-room.v1', 'future.v2'] };
  assert.deepEqual(CLIENT_FEATURES, []);
  assert.deepEqual(commonFeatures(advertised), []);
  assert.deepEqual(commonFeatures(advertised, ['test-room.v1', 'missing.v1']), ['test-room.v1']);
});

test('discovery bounds both an unresponsive request and an unresponsive body', async () => {
  const never = new Promise<never>(() => {});
  await assert.rejects(discoverCapabilities('https://example.invalid', (() => never) as typeof fetch, 10), /timed out/);
  const stuckBody = (async () => ({ status: 200, ok: true, json: () => never }) as Response) as typeof fetch;
  await assert.rejects(discoverCapabilities('https://example.invalid', stuckBody, 10), /timed out/);
});

test('each discovery uses its own server and does not reuse capabilities across updates', async () => {
  const { commonFeatures } = await import('../src/online/capabilities.ts');
  const observed: string[] = [];
  const routed = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    observed.push(url);
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal);
    if (url.startsWith('https://old.invalid/')) return Response.json({ error: 'not_found' }, { status: 404 });
    return worker.fetch(new Request(url, { headers: { Origin: origin } }), {} as Env);
  }) as typeof fetch;
  const advertised = await discoverCapabilities('https://fictional.invalid', fake({ protocol: 'heibon-mahjong.v1', features: ['test-room.v1'] }));
  assert.deepEqual(commonFeatures(advertised, ['test-room.v1']), ['test-room.v1']);
  const current = await discoverCapabilities('https://new.invalid', routed);
  const afterRollback = await discoverCapabilities('https://old.invalid', routed);
  assert.deepEqual(commonFeatures(current), []);
  assert.deepEqual(afterRollback, { protocol: 'heibon-mahjong.v1', features: [] });
  assert.deepEqual(observed, ['https://new.invalid/api/capabilities', 'https://old.invalid/api/capabilities']);
});
