import { RateLimitDurableObject } from './rate-limit.ts';
import { RoomDurableObject } from './room.ts';
import { logWorker } from './diagnostics.ts';
import { normalizeGameRules, rulesForFormat, type GameRules } from '../src/model/rules.ts';

const allowedOrigins = new Set([
  'https://ak-sekine.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;
const PARTICIPANT_TOKEN_PATTERN = /^[a-f0-9]{64}$/u;

const ratePolicies = {
  create: { limit: 10, windowMs: 10 * 60 * 1000 },
  join: { limit: 12, windowMs: 10 * 60 * 1000 },
  ticket: { limit: 30, windowMs: 60 * 1000 },
  socket: { limit: 24, windowMs: 60 * 1000 },
} as const;

function corsHeaders(origin: string): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  });
}

function json(body: unknown, status: number, origin: string, extraHeaders?: HeadersInit): Response {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
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
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 2048) return null;
    const value: unknown = JSON.parse(body);
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

async function consumeRateLimit(
  request: Request,
  env: Env,
  scope: keyof typeof ratePolicies,
): Promise<{ allowed: true } | { allowed: false; response: Response }> {
  const origin = request.headers.get('Origin') ?? '';
  const ipAddress = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`heibon-rate:${ipAddress}`));
  const ipHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const policy = ratePolicies[scope];
  let response: Response;
  try {
    response = await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('global')).fetch(
      new Request('https://rate.internal/internal/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: `${ipHash}:${scope}`, ...policy }),
      }),
    );
  } catch {
    return { allowed: false, response: json({ error: 'rate_limit_unavailable' }, 503, origin) };
  }
  if (!response.ok) return { allowed: false, response: json({ error: 'rate_limit_unavailable' }, 503, origin) };
  const result = await response.json() as { allowed?: boolean; retryAfterMs?: number };
  if (result.allowed) return { allowed: true };
  const retryAfterMs = Number.isFinite(result.retryAfterMs) ? Math.max(1, result.retryAfterMs ?? 1000) : 1000;
  return {
    allowed: false,
    response: json(
      { error: 'rate_limited', retryAfterMs },
      429,
      origin,
      { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) },
    ),
  };
}

async function createRoom(env: Env, origin: string, displayName: string, rules: GameRules): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomRoomCode();
    const participantToken = randomToken();
    const response = await roomStub(env, code).fetch(internalRequest('/internal/create', 'POST', {
      code,
      displayName,
      participantToken,
      format: rules.matchFormat,
      rules,
    }, { Origin: origin }));
    if (response.status === 409) continue;
    if (!response.ok) return json({ error: 'room_create_failed' }, 500, origin);
    const room = await response.json() as { createdAt: number; expiresAt: number; seats: unknown[]; format?: 'tonpu' | 'tonnan'; rules?: GameRules };
    return json({
      roomCode: code,
      participantToken,
      playerSeat: 0,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      format: room.format ?? rules.matchFormat,
      rules: room.rules ?? rulesForFormat(room.format ?? rules.matchFormat),
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
    const limited = await consumeRateLimit(request, env, 'create');
    if (!limited.allowed) return limited.response;
    const body = await parseJson(request);
    const displayName = cleanDisplayName(body?.displayName);
    if (!displayName) return json({ error: 'invalid_display_name' }, 400, origin);
    const rules = body?.rules === undefined
      ? rulesForFormat(body?.format === 'tonnan' ? 'tonnan' : 'tonpu')
      : normalizeGameRules(body.rules);
    return createRoom(env, origin, displayName, rules);
  }

  const match = path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|ticket|socket))?$/u);
  if (!match) return json({ error: 'not_found' }, 404, origin);
  const [, code, action] = match;
  if (!ROOM_CODE_PATTERN.test(code)) return json({ error: 'invalid_room_code' }, 400, origin);
  const stub = roomStub(env, code);

  if (action === undefined && request.method === 'GET') {
    return stub.fetch(internalRequest('/internal/state', 'GET', undefined, { Origin: origin }));
  }

  if (action === 'join' && request.method === 'POST') {
    const limited = await consumeRateLimit(request, env, 'join');
    if (!limited.allowed) return limited.response;
    const body = await parseJson(request);
    const displayName = cleanDisplayName(body?.displayName);
    if (!displayName) return json({ error: 'invalid_display_name' }, 400, origin);
    const participantToken = randomToken();
    const response = await stub.fetch(internalRequest('/internal/join', 'POST', {
      displayName,
      participantToken,
    }, { Origin: origin }));
    if (!response.ok) return response;
    const room = await response.json() as {
      playerSeat: number; roomCode: string; status: string; hostSeat: number | null; revision: number;
      createdAt: number; expiresAt: number; seats: unknown[]; format?: 'tonpu' | 'tonnan'; rules?: GameRules;
    };
    return json({
      roomCode: code,
      participantToken,
      playerSeat: room.playerSeat,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      format: room.format ?? 'tonpu',
      rules: room.rules ?? rulesForFormat(room.format ?? 'tonpu'),
      seats: room.seats,
    }, 201, origin);
  }

  if (action === 'ticket' && request.method === 'POST') {
    const limited = await consumeRateLimit(request, env, 'ticket');
    if (!limited.allowed) return limited.response;
    const participantToken = bearerToken(request);
    if (!participantToken || !PARTICIPANT_TOKEN_PATTERN.test(participantToken)) {
      return json({ error: 'unauthorized' }, 401, origin);
    }
    return stub.fetch(internalRequest('/internal/ticket', 'POST', { participantToken }, { Origin: origin }));
  }

  if (action === 'socket' && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    const limited = await consumeRateLimit(request, env, 'socket');
    if (!limited.allowed) return limited.response;
    return stub.fetch(request);
  }

  return json({ error: 'not_found' }, 404, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch {
      logWorker({ event: 'server_internal_error', level: 'ERROR', errorCode: 'request_handler_failed' });
      return new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  },
};

async function handleFetch(request: Request, env: Env): Promise<Response> {
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
}

export { RateLimitDurableObject, RoomDurableObject };
