import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.ts';

const pagesOrigin = 'https://ak-sekine.github.io';
const itchOriginCandidate = 'https://example.invalid';

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

test('preflight accepts allowed Origin and requested headers, and rejects unsupported headers', async () => {
  const allowed = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
    method: 'OPTIONS',
    headers: { Origin: pagesOrigin, 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), {} as Env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), pagesOrigin);
  assert.equal(allowed.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');

  const unsupported = await worker.fetch(new Request('https://worker.invalid/api/rooms', {
    method: 'OPTIONS',
    headers: { Origin: pagesOrigin, 'Access-Control-Request-Headers': 'x-unexpected' },
  }), {} as Env);
  assert.equal(unsupported.status, 403);
  assert.equal(unsupported.headers.get('Access-Control-Allow-Origin'), null);
});

test('unknown and missing Origins are denied for REST and WebSocket upgrade requests', async () => {
  const records: unknown[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => records.push(...values);
  try {
    for (const headers of [
      { Origin: itchOriginCandidate },
      {},
    ]) {
      for (const path of ['/health', '/api/rooms/ABCDEF/socket']) {
        const response = await worker.fetch(new Request(`https://worker.invalid${path}`, {
          headers: { ...headers, ...(path.endsWith('/socket') ? { Upgrade: 'websocket' } : {}) },
        }), mockEnv().env);
        assert.equal(response.status, 403, `${path} with Origin ${headers.Origin ?? '(missing)'}`);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      }
    }
  } finally { console.log = originalLog; }
  const originEvents = records as Array<Record<string, unknown>>;
  assert.deepEqual(originEvents.map(record => [record.event, record.communicationType, record.origin]), [
    ['origin_rejected', 'http', itchOriginCandidate],
    ['origin_rejected', 'websocket', itchOriginCandidate],
  ]);
  assert.equal(JSON.stringify(originEvents).includes('ABCDEF'), false);
  assert.equal(JSON.stringify(originEvents).includes('token'), false);
  assert.equal(JSON.stringify(originEvents).includes('worker.invalid'), false);
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
