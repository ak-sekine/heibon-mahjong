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
