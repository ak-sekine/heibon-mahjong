import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.ts';

const pagesOrigin = 'https://ak-sekine.github.io';
const itchOrigin = 'https://html-classic.itch.zone';

function mockEnv(onRoomRequest: (request: Request) => Response = () => new Response(null, { status: 418 })) {
  let roomRequest: Request | null = null;
  const env = {
    RATE_LIMITER: {
      idFromName: () => 'global',
      get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true })) }),
    },
    ROOMS: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (request: Request) => {
          roomRequest = request;
          return onRoomRequest(request);
        },
      }),
    },
  } as unknown as Env;
  return { env, getRoomRequest: () => roomRequest };
}

test('Pages Origin is accepted with exact CORS headers and wildcard remains absent', async () => {
  const response = await worker.fetch(new Request('https://worker.invalid/health', { headers: { Origin: pagesOrigin } }), {} as Env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
});

test('itch.io Origin is accepted exactly for preflight and normal API requests', async () => {
  const preflight = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
    method: 'OPTIONS',
    headers: { Origin: itchOrigin, 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), {} as Env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), itchOrigin);
  assert.equal(preflight.headers.get('Vary'), 'Origin');

  const { env } = mockEnv(() => new Response(JSON.stringify({
    createdAt: 1, expiresAt: 2, seats: [], format: 'tonpu',
  }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
  const created = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
    method: 'POST',
    headers: { Origin: itchOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'itch player' }),
  }), env);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), itchOrigin);
  assert.equal(created.headers.get('Vary'), 'Origin');
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), itchOrigin);
});

test('preflight accepts allowed Origin and requested headers, and rejects unsupported headers', async () => {
  const allowed = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
    method: 'OPTIONS',
    headers: { Origin: pagesOrigin, 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), {} as Env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
  assert.equal(allowed.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');

  for (const origin of [pagesOrigin, itchOrigin]) {
    const unsupported = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Headers': 'x-unexpected' },
    }), {} as Env);
    assert.equal(unsupported.status, 403);
    assert.equal(unsupported.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('unapproved, missing, null, HTTP, and lookalike Origins are denied for REST and WebSocket', async () => {
  const records: unknown[] = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => (now += 16_000);
  console.log = (...values: unknown[]) => records.push(...values);
  try {
    for (const origin of [
      'https://example.invalid',
      'http://html-classic.itch.zone',
      'https://html-classic.itch.zone.evil.example',
      'https://evil-html-classic.itch.zone',
      'null',
      undefined,
    ]) {
      const headers = origin === undefined ? {} : { Origin: origin };
      for (const path of ['/health', '/api/rooms/ABCDEF/socket']) {
        const response = await worker.fetch(new Request(`https://worker.invalid${path}`, {
          headers: { ...headers, ...(path.endsWith('/socket') ? { Upgrade: 'websocket' } : {}) },
        }), mockEnv().env);
        assert.equal(response.status, 403, `${path} with Origin ${headers.Origin ?? '(missing)'}`);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      }
    }
  } finally { console.log = originalLog; Date.now = originalNow; }
  const originEvents = records as Array<Record<string, unknown>>;
  assert.deepEqual(originEvents.map(record => [record.event, record.communicationType, record.origin]),
    ['https://example.invalid', 'http://html-classic.itch.zone', 'https://html-classic.itch.zone.evil.example',
      'https://evil-html-classic.itch.zone', 'null', '(missing)']
      .flatMap(origin => [['origin_rejected', 'http', origin], ['origin_rejected', 'websocket', origin]]));
  assert.equal(JSON.stringify(originEvents).includes('ABCDEF'), false);
  assert.equal(JSON.stringify(originEvents).includes('token'), false);
  assert.equal(JSON.stringify(originEvents).includes('worker.invalid'), false);
});

test('successful WebSocket upgrade records only the exact Origin and acceptance result', async () => {
  const records: unknown[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => records.push(...values);
  try {
    const { env } = mockEnv(() => ({ status: 101 } as Response));
    const response = await worker.fetch(new Request('https://worker.invalid/api/rooms/ABCDEF/socket', {
      headers: { Origin: itchOrigin, Upgrade: 'websocket' },
    }), env);
    assert.equal(response.status, 101);
  } finally { console.log = originalLog; }
  const record = records[0] as Record<string, unknown>;
  assert.equal(record.event, 'origin_accepted');
  assert.equal(record.communicationType, 'websocket');
  assert.equal(record.origin, itchOrigin);
  assert.equal(record.result, 'accepted');
  assert.equal(Object.keys(record).some(key => ['token', 'roomCode', 'cookie', 'ipAddress'].includes(key)), false);
});

test('allowed-Origin WebSocket request reaches the room with its Origin; ticket token auth stays enforced', async () => {
  const { env, getRoomRequest } = mockEnv();
  const socket = await worker.fetch(new Request('https://worker.invalid/api/rooms/ABCDEF/socket', {
    headers: { Origin: pagesOrigin, Upgrade: 'websocket' },
  }), env);
  assert.equal(socket.status, 418);
  assert.equal(getRoomRequest()?.headers.get('Origin'), pagesOrigin);

  const missingToken = await worker.fetch(new Request('https://worker.invalid/api/rooms/ABCDEF/ticket', {
    method: 'POST',
    headers: { Origin: pagesOrigin, 'Content-Type': 'application/json' },
    body: '{}',
  }), env);
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
});
