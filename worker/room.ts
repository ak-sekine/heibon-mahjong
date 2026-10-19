const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const WS_PROTOCOL = 'heibon-mahjong.v1';

type SeatRow = { seat: number; name: string; connected: number };
type RoomRow = { code: string; created_at: number; expires_at: number };

function json(body: unknown, status = 200, origin?: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenHash(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class RoomDurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.ensureTables();
  }

  private ensureTables(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room (
      code TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS seats (
      seat INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      connected INTEGER NOT NULL DEFAULT 0
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tickets (
      token_hash TEXT PRIMARY KEY,
      seat INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
  }

  private room(): RoomRow | undefined {
    return this.ctx.storage.sql.exec<RoomRow>('SELECT code, created_at, expires_at FROM room LIMIT 1').toArray()[0];
  }

  private seats(): SeatRow[] {
    return this.ctx.storage.sql.exec<SeatRow>('SELECT seat, name, connected FROM seats ORDER BY seat').toArray();
  }

  private publicState(room = this.room()): { roomCode: string; createdAt: number; expiresAt: number; seats: { seat: number; name: string; connected: boolean }[] } | null {
    if (!room) return null;
    return {
      roomCode: room.code,
      createdAt: room.created_at,
      expiresAt: room.expires_at,
      seats: this.seats().map(({ seat, name, connected }) => ({ seat, name, connected: connected === 1 })),
    };
  }

  private async clearExpired(): Promise<boolean> {
    const room = this.room();
    if (!room || room.expires_at > Date.now()) return false;
    await this.ctx.storage.deleteAll();
    this.ensureTables();
    return true;
  }

  private async responseForState(origin?: string): Promise<Response> {
    if (await this.clearExpired()) return json({ error: 'room_expired' }, 410, origin);
    const state = this.publicState();
    if (!state) return json({ error: 'room_not_found' }, 404, origin);
    return json(state, 200, origin);
  }

  private async broadcast(): Promise<void> {
    const state = this.publicState();
    if (!state) return;
    const message = JSON.stringify({ type: 'room_state', ...state });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* Closed sockets are discarded by the runtime. */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureTables();
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? undefined;

    if (url.pathname === '/internal/create' && request.method === 'POST') {
      const body = await request.json() as { code?: string; displayName?: string; participantToken?: string };
      if (this.room()) return json({ error: 'room_exists' }, 409, origin);
      if (!body.code || !body.displayName || !body.participantToken) return json({ error: 'invalid_room' }, 400, origin);
      const now = Date.now();
      const expiresAt = now + ROOM_TTL_MS;
      this.ctx.storage.sql.exec('INSERT INTO room (code, created_at, expires_at) VALUES (?, ?, ?)', body.code, now, expiresAt);
      this.ctx.storage.sql.exec('INSERT INTO seats (seat, name, token_hash, connected) VALUES (?, ?, ?, 0)', 0, body.displayName, await tokenHash(body.participantToken));
      await this.ctx.storage.setAlarm(expiresAt);
      return json({ ...this.publicState() }, 201, origin);
    }

    if (await this.clearExpired()) return json({ error: 'room_expired' }, 410, origin);

    if (url.pathname === '/internal/state' && request.method === 'GET') return this.responseForState(origin);

    if (url.pathname === '/internal/join' && request.method === 'POST') {
      const body = await request.json() as { displayName?: string; participantToken?: string };
      const room = this.room();
      if (!room) return json({ error: 'room_not_found' }, 404, origin);
      if (!body.displayName || !body.participantToken) return json({ error: 'invalid_join' }, 400, origin);
      const seats = this.seats();
      const used = new Set(seats.map(seat => seat.seat));
      const playerSeat = [0, 1, 2, 3].find(seat => !used.has(seat));
      if (playerSeat === undefined) return json({ error: 'room_full' }, 409, origin);
      this.ctx.storage.sql.exec('INSERT INTO seats (seat, name, token_hash, connected) VALUES (?, ?, ?, 0)', playerSeat, body.displayName, await tokenHash(body.participantToken));
      const state = this.publicState()!;
      await this.broadcast();
      return json({ playerSeat, createdAt: state.createdAt, expiresAt: state.expiresAt, seats: state.seats }, 201, origin);
    }

    if (url.pathname === '/internal/ticket' && request.method === 'POST') {
      const body = await request.json() as { participantToken?: string };
      if (!body.participantToken) return json({ error: 'unauthorized' }, 401, origin);
      const hash = await tokenHash(body.participantToken);
      const seat = this.ctx.storage.sql.exec<{ seat: number }>('SELECT seat FROM seats WHERE token_hash = ?', hash).toArray()[0];
      if (!seat) return json({ error: 'unauthorized' }, 401, origin);
      const ticket = randomToken();
      const expiresAt = Date.now() + TICKET_TTL_MS;
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at <= ?', Date.now());
      this.ctx.storage.sql.exec('INSERT INTO tickets (token_hash, seat, expires_at) VALUES (?, ?, ?)', await tokenHash(ticket), seat.seat, expiresAt);
      return json({ ticket, expiresAt }, 200, origin);
    }

    if (url.pathname.endsWith('/socket') && request.method === 'GET') return this.connectWebSocket(request, origin);

    return json({ error: 'not_found' }, 404, origin);
  }

  private async connectWebSocket(request: Request, origin?: string): Promise<Response> {
    if (!origin) return json({ error: 'origin_required' }, 403);
    const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (!offered.includes(WS_PROTOCOL)) return json({ error: 'websocket_protocol_required' }, 400, origin);
    const ticketProtocol = offered.find(value => value.startsWith('ticket.'));
    const ticket = ticketProtocol?.slice('ticket.'.length) ?? '';
    if (!/^[a-f0-9]{64}$/u.test(ticket)) return json({ error: 'invalid_ticket' }, 401, origin);

    const ticketDigest = await tokenHash(ticket);
    const row = this.ctx.storage.sql.exec<{ seat: number; expires_at: number }>(
      'SELECT seat, expires_at FROM tickets WHERE token_hash = ?', ticketDigest,
    ).toArray()[0];
    if (!row || row.expires_at < Date.now()) return json({ error: 'invalid_ticket' }, 401, origin);
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE token_hash = ?', ticketDigest);

    const tag = `seat-${row.seat}`;
    for (const existing of this.ctx.getWebSockets(tag)) {
      try { existing.close(4001, 'Reconnected elsewhere'); } catch { /* Already closed. */ }
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [tag]);
    const accepted = pair[1] as WebSocket & { serializeAttachment?: (attachment: unknown) => void };
    accepted.serializeAttachment?.({ seat: row.seat });
    this.ctx.storage.sql.exec('UPDATE seats SET connected = 1 WHERE seat = ?', row.seat);
    await this.broadcast();
    const headers = new Headers({
      'Sec-WebSocket-Protocol': WS_PROTOCOL,
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    });
    return new Response(null, { status: 101, headers, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketClose(socket: WebSocket): void {
    const extended = socket as WebSocket & { deserializeAttachment?: () => unknown };
    const attachment = extended.deserializeAttachment?.() as { seat?: number } | null | undefined;
    if (attachment?.seat === undefined) return;
    const stillConnected = this.ctx.getWebSockets(`seat-${attachment.seat}`).some(candidate => candidate !== socket);
    this.ctx.storage.sql.exec('UPDATE seats SET connected = ? WHERE seat = ?', stillConnected ? 1 : 0, attachment.seat);
    void this.broadcast();
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
