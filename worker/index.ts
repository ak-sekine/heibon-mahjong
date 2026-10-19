import { RoomDurableObject } from './room.ts';

const allowedOrigins = new Set([
  'https://ak-sekine.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function corsHeaders(origin: string): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  });
}

function json(body: unknown, status: number, origin: string): Response {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(byte => codeAlphabet[byte % codeAlphabet.length]).join('');
}

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 24 || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return name;
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2048) return null;
  try {
    const text = await request.text();
    if (text.length > 2048) return null;
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  const match = header?.match(/^Bearer ([a-f0-9]{64})$/u);
  return match?.[1] ?? null;
}

function roomStub(env: Env, code: string): { fetch(request: Request): Promise<Response> } {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

function internalRequest(path: string, method: string, body?: unknown, headers?: HeadersInit): Request {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  return new Request(`https://room.internal${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createRoom(env: Env, origin: string, displayName: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomRoomCode();
    const participantToken = randomToken();
    const response = await roomStub(env, code).fetch(internalRequest('/internal/create', 'POST', {
      code,
      displayName,
      participantToken,
    }, { Origin: origin }));
    if (response.status === 409) continue;
    if (!response.ok) return json({ error: 'room_create_failed' }, 500, origin);
    const room = await response.json() as { createdAt: number; expiresAt: number; seats: unknown[] };
    return json({
      roomCode: code,
      participantToken,
      playerSeat: 0,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      seats: room.seats,
    }, 201, origin);
  }
  return json({ error: 'room_create_failed' }, 503, origin);
}

async function handleApi(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return json({ ok: true, service: 'heibon-mahjong-online' }, 200, origin);
  }

  const path = new URL(request.url).pathname;
  if (path === '/api/rooms' && request.method === 'POST') {
    const body = await parseJson(request);
    const displayName = cleanDisplayName(body?.displayName);
    if (!displayName) return json({ error: 'invalid_display_name' }, 400, origin);
    return createRoom(env, origin, displayName);
  }

  const match = path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|ticket|socket))?$/u);
  if (!match) return json({ error: 'not_found' }, 404, origin);
  const [, code, action] = match;
  const stub = roomStub(env, code);

  if (action === undefined && request.method === 'GET') {
    return stub.fetch(internalRequest('/internal/state', 'GET', undefined, { Origin: origin }));
  }

  if (action === 'join' && request.method === 'POST') {
    const body = await parseJson(request);
    const displayName = cleanDisplayName(body?.displayName);
    if (!displayName) return json({ error: 'invalid_display_name' }, 400, origin);
    const participantToken = randomToken();
    const response = await stub.fetch(internalRequest('/internal/join', 'POST', {
      displayName,
      participantToken,
    }, { Origin: origin }));
    if (!response.ok) return response;
    const room = await response.json() as { playerSeat: number; createdAt: number; expiresAt: number; seats: unknown[] };
    return json({
      roomCode: code,
      participantToken,
      playerSeat: room.playerSeat,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      seats: room.seats,
    }, 201, origin);
  }

  if (action === 'ticket' && request.method === 'POST') {
    const participantToken = bearerToken(request);
    if (!participantToken) return json({ error: 'unauthorized' }, 401, origin);
    return stub.fetch(internalRequest('/internal/ticket', 'POST', { participantToken }, { Origin: origin }));
  }

  if (action === 'socket' && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return stub.fetch(request);
  }

  return json({ error: 'not_found' }, 404, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!origin || !allowedOrigins.has(origin)) return new Response('Origin not allowed', { status: 403 });

    if (request.method === 'OPTIONS') {
      const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
        .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (requestedHeaders.some(header => !['authorization', 'content-type'].includes(header))) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    return handleApi(request, env, origin);
  },
};

export { RoomDurableObject };
