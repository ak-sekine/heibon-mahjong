import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { ONLINE_WS_PROTOCOL } from '../src/online/protocol.ts';

// These values are fixed v1 expectations, not generated from current protocol types.
const origin = 'https://ak-sekine.github.io';
const headers = { Origin: origin, 'Content-Type': 'application/json' };

test('frozen v1 HTTP and websocket baseline', async () => {
  assert.equal(ONLINE_WS_PROTOCOL, 'heibon-mahjong.v1');
  const health = await worker.fetch(new Request('https://worker.invalid/health', { headers }), {} as Env);
  assert.deepEqual(await health.json(), { ok: true, service: 'heibon-mahjong-online' });
  const missing = await worker.fetch(new Request('https://worker.invalid/api/no-such-v1-route', { headers }), {} as Env);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not_found' });
  const env = {
    RATE_LIMITER: { idFromName: () => 'global', get: () => ({ fetch: async () => Response.json({ allowed: true }) }) },
    ROOMS: { idFromName: (value: string) => value, get: () => ({ fetch: async () => Response.json({ createdAt: 1, expiresAt: 2, seats: [], format: 'tonpu' }, { status: 201 }) }) },
  } as unknown as Env;
  const create = await worker.fetch(new Request('https://worker.invalid/api/rooms', { method: 'POST', headers, body: JSON.stringify({ displayName: 'old client', format: 'tonpu' }) }), env);
  assert.equal(create.status, 201);
  const body = await create.json() as Record<string, unknown>;
  assert.match(String(body.roomCode), /^[A-HJ-NP-Z2-9]{6}$/u);
  assert.match(String(body.participantToken), /^[a-f0-9]{64}$/u);
  assert.equal(body.playerSeat, 0);
  assert.equal(body.format, 'tonpu');
  const ticket = await worker.fetch(new Request('https://worker.invalid/api/rooms/ABCDEF/ticket', { method: 'POST', headers }), env);
  assert.equal(ticket.status, 401);
  assert.deepEqual(await ticket.json(), { error: 'unauthorized' });
});
