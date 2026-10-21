import {
  ONLINE_WS_PROTOCOL,
  type OnlineRoomSeat,
  type OnlineRoomState,
  type RoomActionResult,
  type RoomMutationMessage,
  type RoomStatus,
  type GameActionResult,
  type GameMutationMessage,
  type SeatTakenOverMessage,
} from '../src/online/protocol.ts';
import type { PlayerId } from '../src/model/game.ts';
import {
  advanceOnlineCpu,
  applyOnlineGameAction,
  hydrateOnlineGame,
  markOnlineGameAborted,
  onlineIdentitiesFromSeats,
  startNextOnlineRound,
  startOnlineGame,
  transferOnlineSeatToCpu,
  timeoutOnlineDecision,
  DECISION_TIMEOUT_MS,
  OnlineGameRuleError,
} from '../src/online/game-engine.ts';
import { createPlayerGameView, type OnlineGameSession } from '../src/online/game-view.ts';

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const MAX_MESSAGE_BYTES = 4096;
const MAX_OPERATIONS_PER_SEAT = 128;
const OPERATION_RETENTION_MS = 24 * 60 * 60 * 1000;
const WS_OPERATIONS_PER_MINUTE = 30;
const WS_RATE_WINDOW_MS = 60 * 1000;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const SEAT_LABELS = ['東', '南', '西', '北'] as const;

type RoomRow = {
  code: string;
  created_at: number;
  expires_at: number;
  status: RoomStatus;
  host_seat: number | null;
  revision: number;
};
type SeatRow = {
  seat: number;
  name: string;
  token_hash: string;
  connected: number;
  kind: 'human' | 'cpu';
  ready: number;
  connection_id: string | null;
};
type PublicSeat = OnlineRoomSeat;
type PublicRoomState = OnlineRoomState;
type SocketAttachment = { seat: number; connectionId: string; participantId: string };
type RoomAction = RoomMutationMessage;
type ActionResult = RoomActionResult;
type GameActionResultMessage = GameActionResult;
type ParsedSocketAction = RoomAction | GameMutationMessage | 'request-state' | 'request-game-state';
type GameRow = { state_json: string; game_revision: number; updated_at: number };
type GameOperationRow = { payload: string; response_json: string };
type ConnectedHumanSeat = PlayerId;

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

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 24 || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return name;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenHash(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function internalJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > 2048) return null;
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

export class RoomDurableObject {
  private readonly ctx: DurableObjectState;
  private cpuProgressing = false;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.ensureTables();
  }

  private ensureColumn(table: 'room' | 'seats', column: string, declaration: string): boolean {
    const columns = this.ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`).toArray();
    if (columns.some(value => value.name === column)) return false;
    this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    return true;
  }

  private ensureTables(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room (
      code TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      host_seat INTEGER,
      revision INTEGER NOT NULL DEFAULT 0
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS seats (
      seat INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      connected INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'human',
      ready INTEGER NOT NULL DEFAULT 0,
      connection_id TEXT
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tickets (
      token_hash TEXT PRIMARY KEY,
      seat INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);

    // Step 14.0 databases already have these tables. Add only missing columns and
    // keep every existing seat row and authentication hash intact.
    const addedHostSeat = this.ensureColumn('room', 'host_seat', 'INTEGER');
    this.ensureColumn('room', 'status', "TEXT NOT NULL DEFAULT 'waiting'");
    this.ensureColumn('room', 'revision', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('seats', 'kind', "TEXT NOT NULL DEFAULT 'human'");
    this.ensureColumn('seats', 'ready', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('seats', 'connection_id', 'TEXT');
    if (addedHostSeat) {
      // Step 14.0 always created seat 0 first. If it is absent, preserve the room
      // without promoting another participant during migration.
      this.ctx.storage.sql.exec(`UPDATE room SET host_seat = CASE
        WHEN EXISTS (SELECT 1 FROM seats WHERE seat = 0 AND kind = 'human') THEN 0
        ELSE NULL END`);
    }
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS operations (
      seat INTEGER NOT NULL,
      participant_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (participant_id, request_id)
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS ws_rate_limit (
      seat INTEGER PRIMARY KEY,
      window_start INTEGER NOT NULL,
      request_count INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS online_game (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      game_revision INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS game_operations (
      participant_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (participant_id, request_id)
    )`);
  }

  private gameSession(): OnlineGameSession | null {
    const row = this.ctx.storage.sql.exec<GameRow>(
      'SELECT state_json, game_revision, updated_at FROM online_game WHERE singleton = 1',
    ).toArray()[0];
    if (!row) return null;
    const session = hydrateOnlineGame(row.state_json);
    if (!session || session.gameRevision !== row.game_revision) {
      throw new Error('Persisted online game state is invalid');
    }
    return session;
  }

  private saveGameSession(session: OnlineGameSession): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO online_game (singleton, game_revision, state_json, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET game_revision = excluded.game_revision,
       state_json = excluded.state_json, updated_at = excluded.updated_at`,
      session.gameRevision, JSON.stringify(session), Date.now(),
    );
  }

  private connectedHumanSeats(): Set<ConnectedHumanSeat> {
    const live = this.liveConnectionIds();
    return new Set(this.seats().filter(seat => seat.kind === 'human' && seat.connected === 1 &&
      Boolean(seat.connection_id && live.get(seat.seat)?.has(seat.connection_id)))
      .map(seat => seat.seat as PlayerId));
  }

  private gameView(session: OnlineGameSession, viewerSeat: PlayerId) {
    return createPlayerGameView(session, viewerSeat, this.room()?.code ?? '', this.connectedHumanSeats());
  }

  private sendGameState(socket: WebSocket, session = this.gameSession()): void {
    const attachment = this.attachment(socket);
    if (!attachment || !session || session.identities[attachment.seat]?.control !== 'human') return;
    const seat = this.seat(attachment.seat);
    if (!seat || seat.kind !== 'human' || seat.token_hash !== attachment.participantId ||
        seat.connection_id !== attachment.connectionId || seat.connected !== 1) return;
    const view = this.gameView(session, attachment.seat as PlayerId);
    try { socket.send(JSON.stringify({ type: 'game-state', view })); } catch { /* A closing connection is ignored. */ }
  }

  private broadcastGame(session = this.gameSession()): void {
    if (!session) return;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === 1) this.sendGameState(socket, session);
    }
    const result = this.gameView(session, session.identities[0].seat).result;
    if (session.status === 'round-ended' && result) {
      const message = JSON.stringify({ type: 'round-ended', gameRevision: session.gameRevision, result });
      for (const socket of this.ctx.getWebSockets()) if (socket.readyState === 1) {
        try { socket.send(message); } catch { /* A closing connection is ignored. */ }
      }
    } else if (session.status === 'match-ended' && result) {
      const rankings: { playerId: PlayerId; points: number; rank: number }[] =
        session.match.points.map((points: number, playerId: number) => ({ playerId: playerId as PlayerId, points }))
          .sort((a, b) => b.points - a.points || a.playerId - b.playerId)
          .map((player, index) => ({ ...player, rank: index + 1 }));
      const message = JSON.stringify({ type: 'match-ended', gameRevision: session.gameRevision, result, rankings });
      for (const socket of this.ctx.getWebSockets()) if (socket.readyState === 1) {
        try { socket.send(message); } catch { /* A closing connection is ignored. */ }
      }
    } else if (session.status === 'aborted') {
      const message = JSON.stringify({ type: 'game-aborted', gameRevision: session.gameRevision, reason: session.abortReason });
      for (const socket of this.ctx.getWebSockets()) if (socket.readyState === 1) {
        try { socket.send(message); } catch { /* A closing connection is ignored. */ }
      }
    }
  }

  private broadcastSeatTakenOver(message: SeatTakenOverMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = this.attachment(socket);
      if (!attachment || attachment.seat === message.seat) continue;
      const seat = this.seat(attachment.seat);
      if (!seat || seat.kind !== 'human' || seat.connected !== 1 ||
          seat.token_hash !== attachment.participantId || seat.connection_id !== attachment.connectionId) continue;
      try { socket.send(payload); } catch { /* A closing connection is ignored. */ }
    }
  }

  private storeGameOperation(participantId: string, requestId: string, payload: string, result: GameActionResultMessage): void {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM game_operations WHERE created_at < ?', now - OPERATION_RETENTION_MS);
    this.ctx.storage.sql.exec(
      'INSERT INTO game_operations (participant_id, request_id, payload, response_json, created_at) VALUES (?, ?, ?, ?, ?)',
      participantId, requestId, payload, JSON.stringify(result), now,
    );
    this.ctx.storage.sql.exec(`DELETE FROM game_operations WHERE participant_id = ? AND request_id IN (
      SELECT request_id FROM game_operations WHERE participant_id = ? ORDER BY created_at DESC, request_id DESC
      LIMIT -1 OFFSET ${MAX_OPERATIONS_PER_SEAT}
    )`, participantId, participantId);
  }

  private async scheduleNextAlarm(session = this.gameSession()): Promise<void> {
    const room = this.room();
    if (!room) return;
    let next = room.expires_at;
    if (session?.decision) next = Math.min(next, session.decision.expiresAt);
    else if (session?.status === 'playing' && (session.match.game.phase === 'awaiting-draw' ||
        session.match.game.phase === 'awaiting-discard' && session.match.game.players[session.match.game.turnPlayerId].control === 'cpu')) {
      next = Math.min(next, Date.now() + 20);
    }
    await this.ctx.storage.setAlarm(next);
  }

  private room(): RoomRow | undefined {
    return this.ctx.storage.sql.exec<RoomRow>(
      'SELECT code, created_at, expires_at, status, host_seat, revision FROM room LIMIT 1',
    ).toArray()[0];
  }

  private seats(): SeatRow[] {
    return this.ctx.storage.sql.exec<SeatRow>(
      'SELECT seat, name, token_hash, connected, kind, ready, connection_id FROM seats ORDER BY seat',
    ).toArray();
  }

  private seat(seat: number): SeatRow | undefined {
    return this.ctx.storage.sql.exec<SeatRow>(
      'SELECT seat, name, token_hash, connected, kind, ready, connection_id FROM seats WHERE seat = ?', seat,
    ).toArray()[0];
  }

  private publicState(room = this.room()): PublicRoomState | null {
    if (!room) return null;
    const stored = new Map(this.seats().map(value => [value.seat, value]));
    const seats: PublicSeat[] = [0, 1, 2, 3].map(seat => {
      const player = stored.get(seat);
      if (!player) return { seat, kind: 'empty', name: null, connected: false, ready: false, isHost: false };
      const kind = player.kind;
      return {
        seat,
        kind,
        name: player.name,
        connected: kind === 'human' && player.connected === 1,
        ready: kind === 'human' && player.ready === 1,
        isHost: kind === 'human' && room.host_seat === seat,
      };
    });
    return {
      roomCode: room.code,
      status: room.status,
      hostSeat: room.host_seat,
      revision: room.revision,
      createdAt: room.created_at,
      expiresAt: room.expires_at,
      seats,
    };
  }

  private attachment(socket: WebSocket): SocketAttachment | null {
    const extended = socket as WebSocket & { deserializeAttachment?: () => unknown };
    const value = extended.deserializeAttachment?.();
    if (!value || typeof value !== 'object') return null;
    const attachment = value as Partial<SocketAttachment>;
    return Number.isInteger(attachment.seat) && attachment.seat! >= 0 && attachment.seat! < 4 &&
      typeof attachment.connectionId === 'string' && /^[a-f0-9]{64}$/u.test(String(attachment.participantId ?? ''))
      ? { seat: attachment.seat!, connectionId: attachment.connectionId, participantId: String(attachment.participantId) }
      : null;
  }

  private liveConnectionIds(): Map<number, Set<string>> {
    const live = new Map<number, Set<string>>();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      const ids = live.get(attachment.seat) ?? new Set<string>();
      ids.add(attachment.connectionId);
      live.set(attachment.seat, ids);
    }
    return live;
  }

  private reconcileConnections(): boolean {
    const room = this.room();
    if (!room || room.status === 'closed') return false;
    const live = this.liveConnectionIds();
    let changed = false;
    for (const player of this.seats()) {
      if (player.kind !== 'human') continue;
      const connected = Boolean(player.connection_id && live.get(player.seat)?.has(player.connection_id));
      if ((player.connected === 1) !== connected || (!connected && player.ready === 1)) {
        this.ctx.storage.sql.exec(
          'UPDATE seats SET connected = ?, ready = ?, connection_id = ? WHERE seat = ?',
          connected ? 1 : 0,
          connected ? player.ready : 0,
          connected ? player.connection_id : null,
          player.seat,
        );
        changed = true;
      }
    }
    return changed;
  }

  private incrementRevision(): number {
    this.ctx.storage.sql.exec('UPDATE room SET revision = revision + 1');
    return this.room()?.revision ?? 0;
  }

  private sendState(socket: WebSocket, state = this.publicState()): void {
    if (!state) return;
    const payload = JSON.stringify({ type: 'room-state', ...state });
    try { socket.send(payload); } catch { /* A closing connection is ignored. */ }
  }

  private broadcast(reconcile = true): void {
    if (reconcile && this.reconcileConnections()) this.incrementRevision();
    const state = this.publicState();
    if (!state) return;
    const current = JSON.stringify({ type: 'room-state', ...state });
    // Keep the Step 14.0 alias during the v1 client transition. Both messages
    // carry the same complete state and revision; clients ignore duplicates.
    const legacy = JSON.stringify({ type: 'room_state', ...state });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      try {
        socket.send(current);
        socket.send(legacy);
        if (state.status === 'closed') socket.send(JSON.stringify({ type: 'room-closed', revision: state.revision }));
      } catch { /* A closing connection is ignored. */ }
    }
  }

  private sendError(socket: WebSocket, code: string, requestId?: string, retryAfterMs?: number): void {
    const error: Record<string, unknown> = { type: 'error', code };
    if (requestId) error.requestId = requestId;
    if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
    try { socket.send(JSON.stringify(error)); } catch { /* A closing connection is ignored. */ }
  }

  private closeSockets(code: number, reason: string, seat?: number): void {
    const sockets = seat === undefined ? this.ctx.getWebSockets() : this.ctx.getWebSockets(`seat-${seat}`);
    for (const socket of sockets) {
      try { socket.close(code, reason); } catch { /* Already closed. */ }
    }
  }

  private async clearExpired(): Promise<boolean> {
    const room = this.room();
    if (!room || room.expires_at > Date.now()) return false;
    if (room.status !== 'closed') {
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("UPDATE room SET status = 'closed', revision = revision + 1");
        this.ctx.storage.sql.exec('DELETE FROM tickets');
      });
      this.broadcast(false);
      this.closeSockets(4002, 'Room expired');
    }
    await this.ctx.storage.deleteAll();
    this.ensureTables();
    return true;
  }

  private async responseForState(origin?: string): Promise<Response> {
    if (await this.clearExpired()) return json({ error: 'room_expired' }, 410, origin);
    const state = this.publicState();
    if (!state) return json({ error: 'room_not_found' }, 404, origin);
    if (this.reconcileConnections()) {
      this.incrementRevision();
      this.broadcast(false);
      const session = this.gameSession();
      if (session) this.broadcastGame(session);
      return json(this.publicState(), 200, origin);
    }
    return json(state, 200, origin);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? undefined;

    if (url.pathname === '/internal/create' && request.method === 'POST') {
      const body = await internalJson(request);
      const displayName = cleanDisplayName(body?.displayName);
      if (!body || !CODE_PATTERN.test(String(body.code ?? '')) || !displayName ||
          !TOKEN_PATTERN.test(String(body.participantToken ?? ''))) {
        return json({ error: 'invalid_room' }, 400, origin);
      }
      if (this.room()) return json({ error: 'room_exists' }, 409, origin);
      const now = Date.now();
      const expiresAt = now + ROOM_TTL_MS;
      const hash = await tokenHash(String(body.participantToken));
      const created = this.ctx.storage.transactionSync(() => {
        if (this.room()) return false;
        this.ctx.storage.sql.exec(
          "INSERT INTO room (code, created_at, expires_at, status, host_seat, revision) VALUES (?, ?, ?, 'waiting', 0, 0)",
          body.code, now, expiresAt,
        );
        this.ctx.storage.sql.exec(
          'INSERT INTO seats (seat, name, token_hash, connected, kind, ready, connection_id) VALUES (0, ?, ?, 0, \'human\', 0, NULL)',
          displayName, hash,
        );
        return true;
      });
      if (!created) return json({ error: 'room_exists' }, 409, origin);
      await this.ctx.storage.setAlarm(expiresAt);
      return json(this.publicState(), 201, origin);
    }

    if (await this.clearExpired()) return json({ error: 'room_expired' }, 410, origin);

    if (url.pathname === '/internal/state' && request.method === 'GET') return this.responseForState(origin);

    if (url.pathname === '/internal/join' && request.method === 'POST') {
      const body = await internalJson(request);
      const displayName = cleanDisplayName(body?.displayName);
      if (!body || !displayName || !TOKEN_PATTERN.test(String(body.participantToken ?? ''))) {
        return json({ error: 'invalid_join' }, 400, origin);
      }
      const hash = await tokenHash(String(body.participantToken));
      const joined = this.ctx.storage.transactionSync(() => {
        const room = this.room();
        if (!room) return { status: 404, code: 'room_not_found' } as const;
        if (room.status === 'closed') return { status: 410, code: 'room_closed' } as const;
        if (room.status !== 'waiting') return { status: 409, code: 'room_finalized' } as const;
        const humans = this.seats().filter(seat => seat.kind === 'human');
        const occupied = new Set(humans.map(seat => seat.seat));
        const playerSeat = [0, 1, 2, 3].find(seat => !occupied.has(seat));
        if (playerSeat === undefined) return { status: 409, code: 'room_full' } as const;
        this.ctx.storage.sql.exec('UPDATE seats SET ready = 0 WHERE kind = \'human\'');
        this.ctx.storage.sql.exec(
          'INSERT INTO seats (seat, name, token_hash, connected, kind, ready, connection_id) VALUES (?, ?, ?, 0, \'human\', 0, NULL)',
          playerSeat, displayName, hash,
        );
        const revision = this.incrementRevision();
        return { status: 201, playerSeat, revision } as const;
      });
      if (joined.status !== 201) return json({ error: joined.code }, joined.status, origin);
      this.broadcast();
      const state = this.publicState();
      return json({ ...state, playerSeat: joined.playerSeat }, 201, origin);
    }

    if (url.pathname === '/internal/ticket' && request.method === 'POST') {
      const body = await internalJson(request);
      const participantToken = body?.participantToken;
      if (typeof participantToken !== 'string' || !TOKEN_PATTERN.test(participantToken)) {
        return json({ error: 'unauthorized' }, 401, origin);
      }
      const room = this.room();
      if (!room) return json({ error: 'room_not_found' }, 404, origin);
      if (room.status === 'closed') return json({ error: 'room_closed' }, 410, origin);
      const hash = await tokenHash(participantToken);
      const player = this.ctx.storage.sql.exec<{ seat: number; kind: string }>(
        "SELECT seat, kind FROM seats WHERE token_hash = ? AND kind = 'human'", hash,
      ).toArray()[0];
      if (!player) return json({ error: 'unauthorized' }, 401, origin);
      const ticket = randomToken();
      const digest = await tokenHash(ticket);
      const expiresAt = Date.now() + TICKET_TTL_MS;
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at <= ?', Date.now());
        this.ctx.storage.sql.exec(
          'INSERT INTO tickets (token_hash, seat, expires_at) VALUES (?, ?, ?)', digest, player.seat, expiresAt,
        );
      });
      return json({ ticket, expiresAt }, 200, origin);
    }

    if (url.pathname.endsWith('/socket') && request.method === 'GET') return this.connectWebSocket(request, origin);

    return json({ error: 'not_found' }, 404, origin);
  }

  private async connectWebSocket(request: Request, origin?: string): Promise<Response> {
    if (!origin) return json({ error: 'origin_required' }, 403);
    const room = this.room();
    if (!room) return json({ error: 'room_not_found' }, 404, origin);
    if (room.status === 'closed') return json({ error: 'room_closed' }, 410, origin);
    const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
      .split(',').map(value => value.trim()).filter(Boolean);
    if (!offered.includes(ONLINE_WS_PROTOCOL)) return json({ error: 'websocket_protocol_required' }, 400, origin);
    const ticketProtocol = offered.find(value => value.startsWith('ticket.'));
    const ticket = ticketProtocol?.slice('ticket.'.length) ?? '';
    if (!TOKEN_PATTERN.test(ticket)) return json({ error: 'invalid_ticket' }, 401, origin);

    const ticketDigest = await tokenHash(ticket);
    const row = this.ctx.storage.transactionSync(() => {
      const value = this.ctx.storage.sql.exec<{ seat: number; expires_at: number }>(
        'SELECT seat, expires_at FROM tickets WHERE token_hash = ?', ticketDigest,
      ).toArray()[0];
      if (!value || value.expires_at <= Date.now()) return undefined;
      this.ctx.storage.sql.exec('DELETE FROM tickets WHERE token_hash = ?', ticketDigest);
      return value;
    });
    if (!row) return json({ error: 'invalid_ticket' }, 401, origin);
    const player = this.seat(row.seat);
    if (!player || player.kind !== 'human' || (this.room()?.status ?? 'closed') === 'closed') {
      return json({ error: 'invalid_ticket' }, 401, origin);
    }

    const tag = `seat-${row.seat}`;
    for (const existing of this.ctx.getWebSockets(tag)) {
      try { existing.close(4001, 'Reconnected elsewhere'); } catch { /* Already closed. */ }
    }
    const pair = new WebSocketPair();
    const connectionId = randomToken();
    this.ctx.acceptWebSocket(pair[1], [tag]);
    const accepted = pair[1] as WebSocket & { serializeAttachment?: (attachment: unknown) => void };
    accepted.serializeAttachment?.({ seat: row.seat, connectionId, participantId: player.token_hash } satisfies SocketAttachment);
    const changed = player.connected !== 1 || player.ready !== 0;
    this.ctx.storage.sql.exec(
      'UPDATE seats SET connected = 1, ready = 0, connection_id = ? WHERE seat = ?', connectionId, row.seat,
    );
    if (changed) this.incrementRevision();
    this.broadcast();
    const game = this.gameSession();
    if (game) this.broadcastGame(game);
    else this.sendGameState(pair[1]);
    const headers = new Headers({
      'Sec-WebSocket-Protocol': ONLINE_WS_PROTOCOL,
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    });
    return new Response(null, { status: 101, headers, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket });
  }

  private consumeSocketRateLimit(seat: number): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.ctx.storage.sql.exec<{ window_start: number; request_count: number }>(
      'SELECT window_start, request_count FROM ws_rate_limit WHERE seat = ?', seat,
    ).toArray()[0];
    if (!entry || now - entry.window_start >= WS_RATE_WINDOW_MS) {
      this.ctx.storage.sql.exec(
        'INSERT INTO ws_rate_limit (seat, window_start, request_count) VALUES (?, ?, 1) ON CONFLICT(seat) DO UPDATE SET window_start = excluded.window_start, request_count = 1',
        seat, now,
      );
      return { allowed: true, retryAfterMs: 0 };
    }
    if (entry.request_count >= WS_OPERATIONS_PER_MINUTE) {
      return { allowed: false, retryAfterMs: Math.max(1, WS_RATE_WINDOW_MS - (now - entry.window_start)) };
    }
    this.ctx.storage.sql.exec('UPDATE ws_rate_limit SET request_count = request_count + 1 WHERE seat = ?', seat);
    return { allowed: true, retryAfterMs: 0 };
  }

  private parseSocketAction(value: unknown): ParsedSocketAction | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const message = value as Record<string, unknown>;
    if (message.type === 'request-state') return Object.keys(message).length === 1 ? 'request-state' : null;
    if (message.type === 'request-game-state') return Object.keys(message).length === 1 ? 'request-game-state' : null;
    const roomMutation = message.type === 'set-ready' || message.type === 'finalize-seats' ||
      message.type === 'leave-room' || message.type === 'close-room';
    const gameMutation = message.type === 'start-game' || message.type === 'discard' ||
      message.type === 'declare-riichi' || message.type === 'declare-tsumo' ||
      message.type === 'declare-ron' || message.type === 'pass-ron' ||
      message.type === 'declare-call' || message.type === 'pass-call' ||
      message.type === 'declare-kan' || message.type === 'declare-kyuushu-kyuuhai' ||
      message.type === 'next-round';
    if (!roomMutation && !gameMutation) return null;
    const expectedKey = roomMutation ? 'expectedRevision' : 'expectedGameRevision';
    if (typeof message.requestId !== 'string' || !REQUEST_ID_PATTERN.test(message.requestId) ||
        !Number.isSafeInteger(message[expectedKey]) || (message[expectedKey] as number) < 0) return null;
    const allowedByType: Record<string, string[]> = {
      'set-ready': ['type', 'requestId', 'expectedRevision', 'ready'],
      'finalize-seats': ['type', 'requestId', 'expectedRevision'],
      'leave-room': ['type', 'requestId', 'expectedRevision'],
      'close-room': ['type', 'requestId', 'expectedRevision'],
      'start-game': ['type', 'requestId', 'expectedGameRevision'],
      'discard': ['type', 'requestId', 'expectedGameRevision', 'tileId'],
      'declare-riichi': ['type', 'requestId', 'expectedGameRevision', 'tileId'],
      'declare-tsumo': ['type', 'requestId', 'expectedGameRevision'],
      'declare-ron': ['type', 'requestId', 'expectedGameRevision', 'windowId'],
      'pass-ron': ['type', 'requestId', 'expectedGameRevision', 'windowId'],
      'declare-call': ['type', 'requestId', 'expectedGameRevision', 'windowId', 'optionId'],
      'pass-call': ['type', 'requestId', 'expectedGameRevision', 'windowId'],
      'declare-kan': ['type', 'requestId', 'expectedGameRevision', 'optionId'],
      'declare-kyuushu-kyuuhai': ['type', 'requestId', 'expectedGameRevision'],
      'next-round': ['type', 'requestId', 'expectedGameRevision'],
    };
    const allowed = allowedByType[String(message.type)];
    if (!allowed) return null;
    if (Object.keys(message).some(key => !allowed.includes(key))) return null;
    if (message.type === 'set-ready' && typeof message.ready !== 'boolean') return null;
    if (['discard', 'declare-riichi'].includes(String(message.type)) &&
        (typeof message.tileId !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/u.test(message.tileId))) return null;
    if (['declare-kan', 'declare-call'].includes(String(message.type)) &&
        (typeof message.optionId !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/u.test(message.optionId))) return null;
    if (['declare-ron', 'pass-ron', 'declare-call', 'pass-call'].includes(String(message.type)) &&
        (typeof message.windowId !== 'string' || !/^[a-f0-9]{24}$/u.test(message.windowId))) return null;
    return roomMutation ? message as RoomAction : message as GameMutationMessage;
  }

  private rememberOperation(participantId: string, seat: number, requestId: string, payload: string, result: ActionResult): void {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      'DELETE FROM operations WHERE created_at < ?', now - OPERATION_RETENTION_MS,
    );
    this.ctx.storage.sql.exec(
      'INSERT INTO operations (seat, participant_id, request_id, payload, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      seat, participantId, requestId, payload, JSON.stringify(result), now,
    );
    this.ctx.storage.sql.exec(`DELETE FROM operations WHERE participant_id = ? AND request_id IN (
      SELECT request_id FROM operations WHERE participant_id = ? ORDER BY created_at DESC, request_id DESC
      LIMIT -1 OFFSET ${MAX_OPERATIONS_PER_SEAT}
    )`, participantId, participantId);
  }

  private applyAction(attachment: SocketAttachment, action: RoomAction): {
    result: ActionResult;
    changed: boolean;
    closeSeat?: number;
    closeRoom?: boolean;
    sendState: boolean;
    gameChanged?: boolean;
    gameSession?: OnlineGameSession | null;
    takeoverNotice?: SeatTakenOverMessage;
  } {
    const payload = JSON.stringify(action.type === 'set-ready'
      ? { type: action.type, expectedRevision: action.expectedRevision, ready: action.ready }
      : { type: action.type, expectedRevision: action.expectedRevision });
    return this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.sql.exec<{ payload: string; response_json: string }>(
        'SELECT payload, response_json FROM operations WHERE participant_id = ? AND request_id = ?',
        attachment.participantId, action.requestId,
      ).toArray()[0];
      if (previous) {
        if (previous.payload === payload) {
          return {
            result: JSON.parse(previous.response_json) as ActionResult,
            changed: false,
            sendState: true,
          };
        }
        return {
          result: { type: 'action-result', requestId: action.requestId, ok: false, revision: this.room()?.revision ?? 0, code: 'request_id_reused' },
          changed: false,
          sendState: false,
        };
      }

      const room = this.room();
      const actor = this.seat(attachment.seat);
      const currentRevision = room?.revision ?? 0;
      let code: string | undefined;
      let gameChanged = false;
      let changedGame: OnlineGameSession | null | undefined;
      let takeoverNotice: SeatTakenOverMessage | undefined;
      if (!room || !actor || actor.kind !== 'human') code = 'unauthorized';
      else if (actor.token_hash !== attachment.participantId) code = 'unauthorized';
      else if (actor.connection_id !== attachment.connectionId || actor.connected !== 1) code = 'stale_connection';
      else if (room.expires_at <= Date.now() || room.status === 'closed') code = 'room_closed';
      else if (action.expectedRevision !== room.revision) code = 'revision_conflict';
      else if (action.type === 'set-ready') {
        if (room.status !== 'waiting') code = 'room_finalized';
        else if (actor.ready !== (action.ready ? 1 : 0)) {
          this.ctx.storage.sql.exec('UPDATE seats SET ready = ? WHERE seat = ?', action.ready ? 1 : 0, actor.seat);
          this.incrementRevision();
        }
      } else if (action.type === 'finalize-seats') {
        if (room.host_seat !== actor.seat) code = 'not_host';
        else if (room.status !== 'waiting') code = room.status === 'finalized' ? 'already_finalized' : 'room_closed';
        else {
          const humans = this.seats().filter(seat => seat.kind === 'human');
          if (humans.length === 0) code = 'no_participants';
          else if (humans.some(seat => seat.connected !== 1)) code = 'player_disconnected';
          else if (humans.some(seat => seat.ready !== 1)) code = 'players_not_ready';
          else {
            const occupied = new Set(humans.map(seat => seat.seat));
            for (const seat of [0, 1, 2, 3]) {
              if (occupied.has(seat)) continue;
              this.ctx.storage.sql.exec(
                "INSERT INTO seats (seat, name, token_hash, connected, kind, ready, connection_id) VALUES (?, ?, ?, 0, 'cpu', 0, NULL)",
                seat, `CPU（${SEAT_LABELS[seat]}席）`, `cpu:${seat}`,
              );
            }
            this.ctx.storage.sql.exec("UPDATE room SET status = 'finalized'");
            this.incrementRevision();
          }
        }
      } else if (action.type === 'leave-room') {
        const session = this.gameSession();
        const wasHost = room.host_seat === actor.seat;
        const humans = this.seats().filter(seat => seat.kind === 'human');
        const remaining = humans.filter(seat => seat.seat !== actor.seat);
        if (session && session.status !== 'aborted' && remaining.length > 0) {
          const nextHost = wasHost
            ? Math.min(...remaining.map(seat => seat.seat))
            : room.host_seat;
          if (nextHost === null || !remaining.some(seat => seat.seat === nextHost)) {
            code = 'game_unavailable';
          } else {
            const cpuSeats = session.identities
              .filter(identity => identity.control === 'cpu' || identity.seat === actor.seat)
              .map(identity => identity.seat)
              .sort((a, b) => a - b);
            const cpuName = `CPU${cpuSeats.indexOf(actor.seat as PlayerId) + 1}`;
            const nextSession = transferOnlineSeatToCpu(
              session,
              actor.seat as PlayerId,
              nextHost as PlayerId,
              Date.now(),
            );
            this.ctx.storage.sql.exec('DELETE FROM tickets WHERE seat = ?', actor.seat);
            this.ctx.storage.sql.exec(
              "UPDATE seats SET name = ?, token_hash = ?, connected = 0, kind = 'cpu', ready = 0, connection_id = NULL WHERE seat = ? AND kind = 'human'",
              cpuName, `cpu:${actor.seat}`, actor.seat,
            );
            cpuSeats.forEach((cpuSeat, index) => {
              if (cpuSeat === actor.seat) return;
              this.ctx.storage.sql.exec("UPDATE seats SET name = ? WHERE seat = ? AND kind = 'cpu'", `CPU${index + 1}`, cpuSeat);
            });
            this.ctx.storage.sql.exec('UPDATE room SET status = \'finalized\', host_seat = ?', nextHost);
            this.saveGameSession(nextSession);
            this.incrementRevision();
            changedGame = nextSession;
            gameChanged = true;
            const newHost = this.seat(nextHost);
            if (!newHost || newHost.kind !== 'human') throw new Error('Online game host seat is invalid');
            takeoverNotice = {
              type: 'seat-taken-over',
              seat: actor.seat,
              departedName: actor.name,
              cpuName,
              hostChanged: wasHost,
              hostSeat: nextHost,
              hostName: newHost.name,
            };
          }
        } else if (session && session.status !== 'aborted') {
          if (session.status === 'playing' || session.status === 'round-ended') {
            changedGame = markOnlineGameAborted(session);
            this.saveGameSession(changedGame);
            gameChanged = true;
          }
          this.ctx.storage.sql.exec('DELETE FROM tickets');
          this.ctx.storage.sql.exec('DELETE FROM seats');
          this.ctx.storage.sql.exec("UPDATE room SET status = 'closed', host_seat = NULL");
          this.incrementRevision();
        } else {
          const wasHost = room.host_seat === actor.seat;
          const humans = this.seats().filter(seat => seat.kind === 'human');
          this.ctx.storage.sql.exec("DELETE FROM seats WHERE kind = 'cpu'");
          this.ctx.storage.sql.exec('DELETE FROM tickets WHERE seat = ?', actor.seat);
          this.ctx.storage.sql.exec('DELETE FROM seats WHERE seat = ? AND kind = \'human\'', actor.seat);
          const remaining = humans.filter(seat => seat.seat !== actor.seat);
          this.ctx.storage.sql.exec('UPDATE seats SET ready = 0 WHERE kind = \'human\'');
          if (remaining.length === 0) {
            this.ctx.storage.sql.exec("UPDATE room SET status = 'closed', host_seat = NULL");
          } else if (wasHost) {
            const successor = Math.min(...remaining.map(seat => seat.seat));
            this.ctx.storage.sql.exec('UPDATE room SET status = \'waiting\', host_seat = ?', successor);
          } else {
            this.ctx.storage.sql.exec("UPDATE room SET status = 'waiting'");
          }
          this.incrementRevision();
        }
      } else if (action.type === 'close-room') {
        if (room.host_seat !== actor.seat) code = 'not_host';
        else if (this.gameSession()?.status === 'playing' || this.gameSession()?.status === 'round-ended') code = 'game_in_progress';
        else if (room.status !== 'waiting' && room.status !== 'finalized') code = 'room_closed';
        else {
          this.ctx.storage.sql.exec("UPDATE room SET status = 'closed'");
          this.ctx.storage.sql.exec('DELETE FROM tickets');
          this.incrementRevision();
        }
      }

      const result: ActionResult = code
        ? { type: 'action-result', requestId: action.requestId, ok: false, revision: this.room()?.revision ?? currentRevision, code }
        : { type: 'action-result', requestId: action.requestId, ok: true, revision: this.room()?.revision ?? currentRevision };
      this.rememberOperation(attachment.participantId, attachment.seat, action.requestId, payload, result);
      const changed = result.ok && ['set-ready', 'finalize-seats', 'leave-room', 'close-room'].includes(action.type) &&
        result.revision !== currentRevision;
      return {
        result,
        changed,
        closeSeat: result.ok && action.type === 'leave-room' ? attachment.seat : undefined,
        closeRoom: code === 'room_closed' || result.ok && action.type === 'close-room' ||
          (result.ok && action.type === 'leave-room' && this.room()?.status === 'closed'),
        sendState: result.ok || code === 'revision_conflict',
        gameChanged,
        gameSession: changedGame,
        takeoverNotice,
      };
    });
  }

  private applyGameAction(attachment: SocketAttachment, action: GameMutationMessage): {
    result: GameActionResultMessage;
    changed: boolean;
    session: OnlineGameSession | null;
    started: boolean;
    sendState: boolean;
  } {
    const payload = JSON.stringify(Object.fromEntries(Object.entries(action)
      .filter(([key]) => key !== 'requestId').sort(([a], [b]) => a.localeCompare(b))));
    const connected = this.connectedHumanSeats();
    return this.ctx.storage.transactionSync(() => {
      const prior = this.ctx.storage.sql.exec<GameOperationRow>(
        'SELECT payload, response_json FROM game_operations WHERE participant_id = ? AND request_id = ?',
        attachment.participantId, action.requestId,
      ).toArray()[0];
      const previousSession = this.gameSession();
      if (prior) {
        if (prior.payload === payload) {
          return {
            result: JSON.parse(prior.response_json) as GameActionResultMessage,
            changed: false,
            session: previousSession,
            started: false,
            sendState: true,
          };
        }
        return {
          result: { type: 'game-action-result', requestId: action.requestId, ok: false,
            gameRevision: previousSession?.gameRevision ?? 0, code: 'request_id_reused' },
          changed: false,
          session: previousSession,
          started: false,
          sendState: false,
        };
      }

      const room = this.room();
      const actor = this.seat(attachment.seat);
      const currentRevision = previousSession?.gameRevision ?? 0;
      let nextSession: OnlineGameSession | null = previousSession;
      let code: string | undefined;
      let started = false;
      let expiredDecision = false;
      if (!room || room.status !== 'finalized') code = room?.status === 'closed' ? 'room_closed' : 'room_not_finalized';
      else if (!actor || actor.kind !== 'human' || actor.token_hash !== attachment.participantId) code = 'unauthorized';
      else if (actor.connection_id !== attachment.connectionId || actor.connected !== 1) code = 'stale_connection';
      else if (!connected.has(attachment.seat as PlayerId)) code = 'player_disconnected';
      else if (room.expires_at <= Date.now()) code = 'room_closed';
      else if (previousSession?.decision && previousSession.decision.expiresAt <= Date.now()) {
        nextSession = timeoutOnlineDecision(previousSession, Date.now());
        expiredDecision = true;
        code = 'stale_decision';
      }
      else {
        try {
          if (action.type === 'start-game') {
            if (room.host_seat !== actor.seat) throw new OnlineGameRuleError('not_host');
            if (previousSession) throw new OnlineGameRuleError('already_started');
            if (action.expectedGameRevision !== 0) throw new OnlineGameRuleError('stale_revision');
            const seats = this.seats();
            if (seats.length !== 4 || [0, 1, 2, 3].some(seat => !seats.some(item => item.seat === seat))) {
              throw new OnlineGameRuleError('seat_assignment_invalid');
            }
            const identities = onlineIdentitiesFromSeats(seats.map(item => ({
              seat: item.seat,
              name: item.name,
              kind: item.kind,
              connected: item.connected === 1,
            })));
            if (identities.some(identity => identity.control === 'human' && !connected.has(identity.seat))) {
              throw new OnlineGameRuleError('player_disconnected');
            }
            nextSession = startOnlineGame(identities, actor.seat as PlayerId);
            started = true;
          } else {
            if (!previousSession) throw new OnlineGameRuleError('game_not_started');
            if (action.type === 'next-round') {
              if (room.host_seat !== actor.seat) throw new OnlineGameRuleError('not_host');
              if (action.expectedGameRevision !== previousSession.gameRevision) throw new OnlineGameRuleError('stale_revision');
              if ([...previousSession.identities].some(identity => identity.control === 'human' && !connected.has(identity.seat))) {
                throw new OnlineGameRuleError('player_disconnected');
              }
              nextSession = startNextOnlineRound(previousSession);
            } else {
              nextSession = applyOnlineGameAction(previousSession, actor.seat as PlayerId, action, connected);
            }
          }
        } catch (error) {
          code = error instanceof OnlineGameRuleError ? error.code
            : error instanceof RangeError ? 'invalid_action' : 'game_unavailable';
          nextSession = previousSession;
        }
      }

      const result: GameActionResultMessage = code
        ? { type: 'game-action-result', requestId: action.requestId, ok: false,
          gameRevision: nextSession?.gameRevision ?? currentRevision, code }
        : { type: 'game-action-result', requestId: action.requestId, ok: true,
          gameRevision: nextSession?.gameRevision ?? currentRevision };
      if ((!code || expiredDecision) && nextSession && nextSession !== previousSession) this.saveGameSession(nextSession);
      this.storeGameOperation(attachment.participantId, action.requestId, payload, result);
      return {
        result,
        changed: (!code || expiredDecision) && nextSession !== previousSession,
        session: nextSession,
        started,
        sendState: !code || code === 'stale_revision' || code === 'stale_decision',
      };
    });
  }

  private broadcastGameStarted(session: OnlineGameSession): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      const seat = this.seat(attachment.seat);
      if (!seat || seat.token_hash !== attachment.participantId || seat.connection_id !== attachment.connectionId || seat.connected !== 1) continue;
      try { socket.send(JSON.stringify({ type: 'game-started', view: this.gameView(session, attachment.seat as PlayerId) })); }
      catch { /* A closing connection is ignored. */ }
    }
  }

  private async persistAutomaticProgress(session: OnlineGameSession): Promise<void> {
    if (this.cpuProgressing) return;
    this.cpuProgressing = true;
    const baseRevision = session.gameRevision;
    try {
      const updated = await advanceOnlineCpu(session, Date.now());
      if (updated === session) return;
      const saved = this.ctx.storage.transactionSync(() => {
        const current = this.gameSession();
        if (!current || current.gameRevision !== baseRevision || current.status !== 'playing' || current.decision) return null;
        this.saveGameSession(updated);
        return updated;
      });
      if (saved) this.broadcastGame(saved);
    } finally {
      this.cpuProgressing = false;
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = this.attachment(socket);
    if (!attachment) {
      this.sendError(socket, 'unauthorized');
      return;
    }
    const rate = this.consumeSocketRateLimit(attachment.seat);
    if (!rate.allowed) {
      this.sendError(socket, 'rate_limited', undefined, rate.retryAfterMs);
      return;
    }
    let text: string;
    try {
      if (typeof message === 'string') text = message;
      else if (message instanceof ArrayBuffer) text = new TextDecoder().decode(message);
      else {
        this.sendError(socket, 'invalid_message');
        return;
      }
    } catch {
      this.sendError(socket, 'invalid_message');
      return;
    }
    if (new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) {
      this.sendError(socket, 'message_too_large');
      try { socket.close(1009, 'Message too large'); } catch { /* Already closed. */ }
      return;
    }
    let decoded: unknown;
    try { decoded = JSON.parse(text); } catch {
      this.sendError(socket, 'invalid_json');
      return;
    }
    const action = this.parseSocketAction(decoded);
    if (!action) {
      this.sendError(socket, 'invalid_message');
      return;
    }

    if (action === 'request-state' || action === 'request-game-state') {
      const room = this.room();
      const participant = this.seat(attachment.seat);
      if (!participant || participant.kind !== 'human' || participant.token_hash !== attachment.participantId) {
        this.sendError(socket, 'unauthorized');
        try { socket.close(4003, 'Participant is no longer in the room'); } catch { /* Already closed. */ }
        return;
      }
      if (participant.connection_id !== attachment.connectionId || participant.connected !== 1) {
        this.sendError(socket, 'stale_connection');
        try { socket.close(4001, 'Reconnected elsewhere'); } catch { /* Already closed. */ }
        return;
      }
      if (!room || room.status === 'closed' || room.expires_at <= Date.now()) {
        this.sendError(socket, 'room_closed');
        try { socket.close(4002, 'Room closed or expired'); } catch { /* Already closed. */ }
        return;
      }
      if (this.reconcileConnections()) {
        this.incrementRevision();
        this.broadcast(false);
        const session = this.gameSession();
        if (session) this.broadcastGame(session);
      } else {
        if (action === 'request-state') this.sendState(socket);
        else this.sendGameState(socket);
      }
      return;
    }

    if (this.reconcileConnections()) {
      this.incrementRevision();
      this.broadcast(false);
      const session = this.gameSession();
      if (session) this.broadcastGame(session);
    }
    if ('expectedGameRevision' in action) {
      const outcome = this.applyGameAction(attachment, action);
      try { socket.send(JSON.stringify(outcome.result)); } catch { /* Result remains durable for requestId replay. */ }
      if (outcome.changed && outcome.session) {
        if (outcome.started) this.broadcastGameStarted(outcome.session);
        this.broadcastGame(outcome.session);
        await this.scheduleNextAlarm(outcome.session);
      } else if (outcome.sendState) this.sendGameState(socket, outcome.session);
      return;
    }

    const outcome = this.applyAction(attachment, action);
    try { socket.send(JSON.stringify(outcome.result)); } catch { /* Result remains durable for requestId replay. */ }
    if (outcome.changed) this.broadcast();
    else if (outcome.sendState) this.sendState(socket);
    if (outcome.gameChanged && outcome.gameSession) {
      this.broadcastGame(outcome.gameSession);
      await this.scheduleNextAlarm(outcome.gameSession);
    }
    if (outcome.takeoverNotice) this.broadcastSeatTakenOver(outcome.takeoverNotice);
    if (outcome.closeSeat !== undefined) this.closeSockets(4003, 'Participant left the room', outcome.closeSeat);
    if (outcome.closeRoom) this.closeSockets(4002, 'Room closed');
  }

  private socketEnded(socket: WebSocket): void {
    const attachment = this.attachment(socket);
    if (!attachment) return;
    const room = this.room();
    const player = this.seat(attachment.seat);
    // A delayed close from a replaced socket cannot mark the current connection offline.
    if (!room || room.status === 'closed' || !player || player.connection_id !== attachment.connectionId) return;
    const changed = player.connected === 1 || player.ready === 1;
    this.ctx.storage.sql.exec(
      'UPDATE seats SET connected = 0, ready = 0, connection_id = NULL WHERE seat = ?', attachment.seat,
    );
    if (changed) this.incrementRevision();
    this.broadcast(false);
    const session = this.gameSession();
    if (session) this.broadcastGame(session);
  }

  webSocketClose(socket: WebSocket): void {
    this.socketEnded(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.socketEnded(socket);
  }

  async alarm(): Promise<void> {
    const room = this.room();
    if (!room) return;
    const now = Date.now();
    if (now >= room.expires_at) {
      if (room.status !== 'closed') {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("UPDATE room SET status = 'closed', revision = revision + 1");
          this.ctx.storage.sql.exec('DELETE FROM tickets');
        });
        this.broadcast(false);
        this.closeSockets(4002, 'Room expired');
      }
      await this.ctx.storage.deleteAll();
      this.ensureTables();
      return;
    }

    let session = this.gameSession();
    if (session?.decision && session.decision.expiresAt <= now) {
      const expired = timeoutOnlineDecision(session, now);
      if (expired !== session) {
        const saved = this.ctx.storage.transactionSync(() => {
          const current = this.gameSession();
          if (!current || current.gameRevision !== session!.gameRevision ||
              current.decision?.windowId !== session!.decision?.windowId) return null;
          this.saveGameSession(expired);
          return expired;
        });
        if (saved) {
          session = saved;
          this.broadcastGame(saved);
        }
      }
    }
    if (session?.status === 'playing' && !session.decision &&
        (session.match.game.phase === 'awaiting-draw' ||
          session.match.game.phase === 'awaiting-discard' && session.match.game.players[session.match.game.turnPlayerId].control === 'cpu')) {
      await this.persistAutomaticProgress(session);
      session = this.gameSession();
    }
    await this.scheduleNextAlarm(session);
  }
}
