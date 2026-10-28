import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { RateLimitDurableObject } from '../worker/rate-limit.ts';
import { RoomDurableObject } from '../worker/room.ts';
import { startMatch } from '../src/game/match.ts';
import { ronGame } from './ron-fixture.ts';
import { callStart } from './calls-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { discardTileForOnline } from '../src/game/discard.ts';
import { getCallOptions } from '../src/game/calls.ts';
import { applyOnlineGameAction } from '../src/online/game-engine.ts';
import type { OnlineGameSession, PlayerDecisionWindow } from '../src/online/game-view.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';

type SqlResult<Row> = { toArray(): Row[] };

class TestSqlStorage {
  private readonly database = new DatabaseSync(':memory:');

  exec<Row extends Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlResult<Row> {
    const statement = this.database.prepare(query);
    if (statement.columns().length > 0) {
      return { toArray: () => statement.all(...bindings) as Row[] };
    }
    statement.run(...bindings);
    return { toArray: () => [] };
  }

  transactionSync<T>(closure: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = closure();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  deleteAll(): void {
    const tables = this.database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).all() as Array<{ name: string }>;
    for (const table of tables) this.database.exec(`DROP TABLE IF EXISTS "${table.name}"`);
  }

  close(): void {
    this.database.close();
  }
}

class TestRoomContext {
  readonly storage = {
    sql: new TestSqlStorage(),
    alarmAt: null as number | null,
    setAlarm: async (timestamp: number) => { this.storage.alarmAt = timestamp; },
    deleteAll: async () => { this.storage.sql.deleteAll(); },
    transactionSync: <T>(closure: () => T): T => this.storage.sql.transactionSync(closure),
  };
  readonly sockets: TestSocket[] = [];
  acceptWebSocket(socket: WebSocket, tags: string[] = []): void {
    const accepted = socket as TestSocket;
    accepted.tags = tags;
    this.sockets.push(accepted);
  }
  getWebSockets(tag?: string): WebSocket[] {
    return this.sockets.filter(socket => socket.readyState === 1 && (!tag || socket.tags.includes(tag)));
  }
}

class TestSocket {
  readyState = 1;
  tags: string[] = [];
  peer: TestSocket | null = null;
  sent: string[] = [];
  private attachment: unknown = null;

  send(value: string): void {
    this.sent.push(value);
    if (this.peer) this.peer.sent.push(value);
  }

  close(_code = 1000, _reason = ''): void {
    this.readyState = 3;
    if (this.peer) this.peer.readyState = 3;
  }

  serializeAttachment(value: unknown): void { this.attachment = structuredClone(value); }
  deserializeAttachment(): unknown { return structuredClone(this.attachment); }
}

class TestWebSocketPair {
  0: TestSocket;
  1: TestSocket;
  constructor() {
    this[0] = new TestSocket();
    this[1] = new TestSocket();
    this[0].peer = this[1];
    this[1].peer = this[0];
  }
}

class TestWorkerResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly webSocket?: TestSocket;
  private readonly value: string;
  constructor(body: BodyInit | null = null, init: ResponseInit & { webSocket?: TestSocket } = {}) {
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers);
    this.webSocket = init.webSocket;
    this.value = typeof body === 'string' ? body : '';
  }
  get ok(): boolean { return this.status >= 200 && this.status < 300; }
  async json(): Promise<unknown> { return JSON.parse(this.value); }
  async text(): Promise<string> { return this.value; }
}

type RoomFixture = {
  ctx: TestRoomContext;
  room: RoomDurableObject;
  code: string;
  hostToken: string;
};
type Participant = { token: string; ticket: string; seat: number; client: TestSocket; server: TestSocket };

let codeCounter = 0;
let participantCounter = 0;
let operationCounter = 0;
const participantTokenFills = ['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3', '4'] as const;
function nextCode(): string {
  codeCounter++;
  let value = codeCounter;
  let suffix = '';
  for (let digit = 0; digit < 5; digit++) {
    suffix = `${(value % 8) + 2}${suffix}`;
    value = Math.floor(value / 8);
  }
  return `A${suffix}`;
}
function nextOperationId(prefix: string): string { operationCounter++; return `${prefix}-${operationCounter}`; }
function token(fill: string): string { return fill.repeat(64); }
function responseObject(response: Response | TestWorkerResponse): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}
async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function makeRoom(displayName = 'Host', hostToken = token('a')): Promise<RoomFixture> {
  const ctx = new TestRoomContext();
  const room = new RoomDurableObject(ctx as unknown as DurableObjectState, {} as Env);
  const code = nextCode();
  const response = await room.fetch(new Request('https://room.internal/internal/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, displayName, participantToken: hostToken }),
  }));
  assert.equal(response.status, 201);
  return { ctx, room, code, hostToken };
}

async function joinRoom(fixture: RoomFixture, displayName: string, participantToken?: string): Promise<{ token: string; seat: number }> {
  participantCounter++;
  const validToken = participantToken ?? token(participantTokenFills[participantCounter % participantTokenFills.length]);
  const response = await fixture.room.fetch(new Request('https://room.internal/internal/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, participantToken: validToken }),
  }));
  const body = await responseObject(response);
  assert.equal(response.status, 201);
  return { token: validToken, seat: body.playerSeat as number };
}

async function readState(fixture: RoomFixture): Promise<Record<string, unknown>> {
  return responseObject(await fixture.room.fetch(new Request('https://room.internal/internal/state')));
}

async function connectParticipant(fixture: RoomFixture, participantToken: string): Promise<Participant> {
  const ticketResponse = await fixture.room.fetch(new Request('https://room.internal/internal/ticket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantToken }),
  }));
  assert.equal(ticketResponse.status, 200);
  const ticket = (await responseObject(ticketResponse)).ticket as string;
  const previousResponse = globalThis.Response;
  const previousPair = (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;
  Object.defineProperty(globalThis, 'Response', { configurable: true, writable: true, value: TestWorkerResponse });
  Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, writable: true, value: TestWebSocketPair });
  let response: TestWorkerResponse;
  try {
    response = await fixture.room.fetch(new Request(`https://room.internal/${fixture.code}/socket`, {
      headers: {
        Origin: 'https://ak-sekine.github.io',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `heibon-mahjong.v1, ticket.${ticket}`,
      },
    })) as unknown as TestWorkerResponse;
  } finally {
    Object.defineProperty(globalThis, 'Response', { configurable: true, writable: true, value: previousResponse });
    if (previousPair === undefined) delete (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;
    else Object.defineProperty(globalThis, 'WebSocketPair', { configurable: true, writable: true, value: previousPair });
  }
  assert.equal(response.status, 101);
  const client = response.webSocket!;
  const server = fixture.ctx.sockets.at(-1)!;
  return { token: participantToken, ticket, seat: (server.deserializeAttachment() as { seat: number }).seat, client, server };
}

function sendAction(fixture: RoomFixture, participant: Participant, value: Record<string, unknown>): Record<string, unknown> {
  const index = participant.client.sent.length;
  fixture.room.webSocketMessage(participant.server as unknown as WebSocket, JSON.stringify(value));
  const messages = participant.client.sent.slice(index).map(item => JSON.parse(item) as Record<string, unknown>);
  const result = messages.find(message => message.type === 'action-result');
  assert.ok(result, `missing action result for ${String(value.requestId)}`);
  return result;
}

async function sendGameAction(
  fixture: RoomFixture,
  participant: Participant,
  value: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const index = participant.client.sent.length;
  await fixture.room.webSocketMessage(participant.server as unknown as WebSocket, JSON.stringify(value));
  const messages = participant.client.sent.slice(index).map(item => JSON.parse(item) as Record<string, unknown>);
  const result = messages.find(message => message.type === 'game-action-result');
  assert.ok(result, `missing game action result for ${String(value.requestId)}`);
  return result;
}

function latestState(participant: Participant): Record<string, unknown> {
  const messages = participant.client.sent.map(item => JSON.parse(item) as Record<string, unknown>);
  const state = messages.filter(message => message.type === 'room-state').at(-1);
  assert.ok(state, 'missing complete room state');
  return state;
}

function latestGameView(participant: Participant): Record<string, unknown> {
  const messages = participant.client.sent.map(item => JSON.parse(item) as Record<string, unknown>);
  const state = messages.filter(message => message.type === 'game-state' || message.type === 'game-started').at(-1);
  assert.ok(state && state.view && typeof state.view === 'object', 'missing seat-specific game view');
  return state.view as Record<string, unknown>;
}

function persistedGame(fixture: RoomFixture): Record<string, unknown> {
  const row = fixture.ctx.storage.sql.exec<{ state_json: string; game_revision: number }>(
    'SELECT state_json, game_revision FROM online_game WHERE singleton = 1',
  ).toArray()[0];
  assert.ok(row, 'game state was not saved to SQLite');
  const value = JSON.parse(row.state_json) as Record<string, unknown>;
  assert.equal(value.gameRevision, row.game_revision);
  return value;
}

function saveGameSession(fixture: RoomFixture, session: OnlineGameSession): void {
  fixture.ctx.storage.sql.exec(
    'UPDATE online_game SET game_revision = ?, state_json = ?, updated_at = ? WHERE singleton = 1',
    session.gameRevision, JSON.stringify(session), Date.now(),
  );
}

function onlineSessionForGame(
  fixture: RoomFixture,
  game: GameState,
  gameRevision: number,
  decision: PlayerDecisionWindow | null = null,
): OnlineGameSession {
  const base = persistedGame(fixture) as unknown as OnlineGameSession;
  const players = game.players.map((player, seat) => ({
    ...player,
    control: base.identities[seat as PlayerId].control,
  })) as [PlayerState, PlayerState, PlayerState, PlayerState];
  const match = startMatch({ ...game, players });
  return {
    schemaVersion: 1,
    gameRevision,
    match,
    status: match.status,
    identities: base.identities,
    hostSeat: base.hostSeat,
    decision,
  };
}

async function passVisibleDecisions(fixture: RoomFixture, participants: Participant[]): Promise<void> {
  let sequence = 0;
  for (let pass = 0; pass < 4; pass++) {
    let answered = false;
    for (const participant of participants) {
      const view = latestGameView(participant);
      const self = view.self as Record<string, unknown>;
      const decision = self.decision as Record<string, unknown> | null;
      if (!decision || decision.answered !== false) continue;
      answered = true;
      sequence++;
      const action = decision.type === 'ron' ? 'pass-ron' : 'pass-call';
      const result = await sendGameAction(fixture, participant, {
        type: action,
        requestId: nextOperationId(`pass-${sequence}`),
        expectedGameRevision: decision.expectedGameRevision,
        windowId: decision.windowId,
      });
      assert.equal(result.ok, true, `a visible ${String(decision.type)} pass should be accepted`);
    }
    if (!answered) return;
  }
  assert.fail('too many consecutive online response windows');
}

function publicSeats(state: Record<string, unknown>): Array<Record<string, unknown>> {
  return state.seats as Array<Record<string, unknown>>;
}

async function readyAndFinalize(fixture: RoomFixture, participants: Participant[]): Promise<Record<string, unknown>> {
  for (const participant of participants) {
    const state = await readState(fixture);
    const result = sendAction(fixture, participant, {
      type: 'set-ready', requestId: nextOperationId(`ready-${participant.seat}`),
      expectedRevision: state.revision, ready: true,
    });
    assert.equal(result.ok, true);
  }
  const state = await readState(fixture);
  const host = participants.find(value => value.seat === 0) ?? participants[0];
  const result = sendAction(fixture, host, {
    type: 'finalize-seats', requestId: nextOperationId('finalize'),
    expectedRevision: state.revision,
  });
  assert.equal(result.ok, true);
  return latestState(host);
}

test('Step 14.0.1 local Durable Object protocol and state lifecycle', { timeout: 30_000 }, async t => {
  await t.test('migrates Step 14.0 SQLite rows without changing the participant hash or TTL', async () => {
    const ctx = new TestRoomContext();
    const legacyToken = token('d');
    const legacyHash = await digest(legacyToken);
    const createdAt = Date.now() - 1000;
    const expiresAt = createdAt + 24 * 60 * 60 * 1000;
    ctx.storage.sql.exec('CREATE TABLE room (code TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE seats (seat INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, connected INTEGER NOT NULL DEFAULT 0)');
    ctx.storage.sql.exec('CREATE TABLE tickets (token_hash TEXT PRIMARY KEY, seat INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('INSERT INTO room (code, created_at, expires_at) VALUES (?, ?, ?)', 'A2CDEF', createdAt, expiresAt);
    ctx.storage.sql.exec('INSERT INTO seats (seat, name, token_hash, connected) VALUES (0, ?, ?, 0)', 'Legacy host', legacyHash);
    const room = new RoomDurableObject(ctx as unknown as DurableObjectState, {} as Env);
    const fixture = { ctx, room, code: 'A2CDEF', hostToken: legacyToken };
    const state = await readState(fixture);
    assert.equal(state.status, 'waiting');
    assert.equal(state.hostSeat, 0);
    assert.equal(state.revision, 0);
    assert.equal(state.expiresAt, expiresAt);
    assert.deepEqual(publicSeats(state).map(seat => seat.kind), ['human', 'empty', 'empty', 'empty']);
    assert.equal(ctx.storage.sql.exec<{ token_hash: string }>('SELECT token_hash FROM seats WHERE seat = 0').toArray()[0].token_hash, legacyHash);
    const client = await connectParticipant(fixture, legacyToken);
    assert.equal(client.seat, 0, 'the original token hash did not authenticate after migration');
    const reused = await room.fetch(new Request(`https://room.internal/${fixture.code}/socket`, {
      headers: {
        Origin: 'https://ak-sekine.github.io',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `heibon-mahjong.v1, ticket.${client.ticket}`,
      },
    }));
    assert.equal(reused.status, 401, 'the WebSocket ticket was reusable');
  });

  await t.test('supports two humans, Ready, conflict responses, CPU fill and idempotent finalization', async () => {
    const fixture = await makeRoom();
    const guestInfo = await joinRoom(fixture, 'Guest', token('b'));
    assert.equal(guestInfo.seat, 1);
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    const waiting = await readState(fixture);
    assert.deepEqual(publicSeats(waiting).map(seat => seat.seat), [0, 1, 2, 3]);
    assert.deepEqual(publicSeats(waiting).map(seat => seat.kind), ['human', 'human', 'empty', 'empty']);
    assert.equal((waiting.expiresAt as number) - (waiting.createdAt as number), 24 * 60 * 60 * 1000);
    assert.equal(publicSeats(waiting)[0].isHost, true);
    assert.equal(JSON.stringify(waiting).includes(fixture.hostToken), false);

    const unready = sendAction(fixture, host, { type: 'finalize-seats', requestId: 'unready', expectedRevision: waiting.revision });
    assert.equal(unready.code, 'players_not_ready');
    const nonHost = sendAction(fixture, guest, { type: 'finalize-seats', requestId: 'non-host', expectedRevision: waiting.revision });
    assert.equal(nonHost.code, 'not_host');
    const stale = sendAction(fixture, guest, {
      type: 'set-ready', requestId: 'stale-ready', expectedRevision: Math.max(0, (waiting.revision as number) - 1), ready: true,
    });
    assert.equal(stale.code, 'revision_conflict');

    const latestBeforeReady = await readState(fixture);
    const guestReady = sendAction(fixture, guest, {
      type: 'set-ready', requestId: 'guest-ready', expectedRevision: latestBeforeReady.revision, ready: true,
    });
    assert.equal(guestReady.ok, true);
    const hostReady = sendAction(fixture, host, {
      type: 'set-ready', requestId: 'host-ready', expectedRevision: guestReady.revision, ready: true,
    });
    assert.equal(hostReady.ok, true);
    assert.equal(hostReady.revision, (guestReady.revision as number) + 1);

    const beforeFinalize = await readState(fixture);
    const finalize = sendAction(fixture, host, {
      type: 'finalize-seats', requestId: 'finalize-once', expectedRevision: beforeFinalize.revision,
    });
    assert.equal(finalize.ok, true);
    const finalized = await readState(fixture);
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.revision, (beforeFinalize.revision as number) + 1);
    assert.deepEqual(publicSeats(finalized).map(seat => seat.kind), ['human', 'human', 'cpu', 'cpu']);
    assert.deepEqual(publicSeats(finalized).map(seat => seat.seat), [0, 1, 2, 3]);
    assert.equal(publicSeats(finalized)[2].name, 'CPU（西席）');
    assert.equal(publicSeats(finalized)[3].name, 'CPU（北席）');
    fixture.room = new RoomDurableObject(fixture.ctx as unknown as DurableObjectState, {} as Env);
    const duplicate = sendAction(fixture, host, {
      type: 'finalize-seats', requestId: 'finalize-once', expectedRevision: beforeFinalize.revision,
    });
    assert.equal(duplicate.ok, true);
    assert.equal((await readState(fixture)).revision, finalized.revision);
    const lateJoin = await fixture.room.fetch(new Request('https://room.internal/internal/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Late', participantToken: token('c') }),
    }));
    assert.equal(lateJoin.status, 409);
    assert.equal((await responseObject(lateJoin)).error, 'room_finalized');
    const readyAfterFinalize = sendAction(fixture, host, {
      type: 'set-ready', requestId: 'frozen-ready', expectedRevision: finalized.revision, ready: false,
    });
    assert.equal(readyAfterFinalize.code, 'room_finalized');
  });

  await t.test('clears CPU seats on explicit departure and revokes tickets and tokens', async () => {
    const fixture = await makeRoom();
    const guestInfo = await joinRoom(fixture, 'Guest', token('e'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    const before = await readState(fixture);
    const leave = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'guest-leaves-finalized', expectedRevision: before.revision,
    });
    assert.equal(leave.ok, true);
    const waiting = await readState(fixture);
    assert.equal(waiting.status, 'waiting');
    assert.equal(waiting.hostSeat, 0);
    assert.deepEqual(publicSeats(waiting).map(seat => seat.kind), ['human', 'empty', 'empty', 'empty']);
    assert.equal(publicSeats(waiting)[0].ready, false);
    const invalidTicket = await fixture.room.fetch(new Request('https://room.internal/internal/ticket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantToken: guestInfo.token }),
    }));
    assert.equal(invalidTicket.status, 401);
    const repeatedLeave = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'guest-leaves-finalized', expectedRevision: before.revision,
    });
    assert.equal(repeatedLeave.ok, true);
    assert.equal((await readState(fixture)).revision, waiting.revision);
    const oldAction = sendAction(fixture, guest, {
      type: 'set-ready', requestId: 'old-seat-action', expectedRevision: waiting.revision, ready: true,
    });
    assert.equal(oldAction.code, 'unauthorized');
    const afterLeaveMessageIndex = guest.client.sent.length;
    fixture.room.webSocketMessage(guest.server as unknown as WebSocket, JSON.stringify({ type: 'request-state' }));
    assert.ok(guest.client.sent.slice(afterLeaveMessageIndex).some(message => JSON.parse(message).code === 'unauthorized'));

    const newGuestInfo = await joinRoom(fixture, 'New guest', token('6'));
    assert.equal(newGuestInfo.seat, 1, 'the departed seat was not reused');
    const afterReuse = await readState(fixture);
    const oldDuplicateAfterReuse = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'guest-leaves-finalized', expectedRevision: before.revision,
    });
    assert.equal(oldDuplicateAfterReuse.ok, true);
    assert.equal((await readState(fixture)).revision, afterReuse.revision, 'the departed participant changed a reused seat');
    const newGuest = await connectParticipant(fixture, newGuestInfo.token);
    const afterReconnect = await readState(fixture);
    const sameIdNewParticipant = sendAction(fixture, newGuest, {
      type: 'set-ready', requestId: 'guest-leaves-finalized', expectedRevision: afterReconnect.revision, ready: true,
    });
    assert.equal(sameIdNewParticipant.ok, true, 'request history from a previous occupant blocked a new participant');
    const newGuestLeave = sendAction(fixture, newGuest, {
      type: 'leave-room', requestId: 'new-person-leaves', expectedRevision: sameIdNewParticipant.revision,
    });
    assert.equal(newGuestLeave.ok, true);

    const lastLeave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'last-person-leaves', expectedRevision: newGuestLeave.revision,
    });
    assert.equal(lastLeave.ok, true);
    const closed = await readState(fixture);
    assert.equal(closed.status, 'closed');
    assert.equal(closed.hostSeat, null);
    assert.deepEqual(publicSeats(closed).map(seat => seat.kind), ['empty', 'empty', 'empty', 'empty']);
  });

  await t.test('transfers host only on explicit exit and keeps host ownership on disconnect', async () => {
    const fixture = await makeRoom();
    const firstGuest = await joinRoom(fixture, 'Seat one', token('f'));
    const secondGuest = await joinRoom(fixture, 'Seat two', token('1'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guestOne = await connectParticipant(fixture, firstGuest.token);
    const guestTwo = await connectParticipant(fixture, secondGuest.token);
    guestTwo.server.close(1000, 'network disconnected');
    fixture.room.webSocketClose(guestTwo.server as unknown as WebSocket);
    const disconnected = await readState(fixture);
    assert.equal(disconnected.hostSeat, 0);
    assert.equal(publicSeats(disconnected)[0].isHost, true);
    assert.equal(publicSeats(disconnected)[2].connected, false);
    const hostBeforeExit = await readState(fixture);
    const exit = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'creator-exits', expectedRevision: hostBeforeExit.revision,
    });
    assert.equal(exit.ok, true);
    const afterExit = await readState(fixture);
    assert.equal(afterExit.hostSeat, 1);
    assert.equal(publicSeats(afterExit)[1].isHost, true);
    assert.equal(publicSeats(afterExit)[2].ready, false);
    const invalidOldHost = await fixture.room.fetch(new Request('https://room.internal/internal/ticket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantToken: fixture.hostToken }),
    }));
    assert.equal(invalidOldHost.status, 401);
    assert.equal(publicSeats(afterExit)[1].isHost, true);
    const successorReady = sendAction(fixture, guestOne, {
      type: 'set-ready', requestId: 'successor-ready', expectedRevision: afterExit.revision, ready: true,
    });
    assert.equal(successorReady.ok, true);
    const current = await readState(fixture);
    const finalized = sendAction(fixture, guestOne, {
      type: 'finalize-seats', requestId: 'successor-finalize', expectedRevision: current.revision,
    });
    assert.equal(finalized.ok, false);
    assert.equal(finalized.code, 'player_disconnected');
  });

  await t.test('fills exactly 4 minus human count CPU seats and never replaces humans', async () => {
    for (const humanCount of [1, 2, 3, 4]) {
      const fixture = await makeRoom(`Host-${humanCount}`, token(String.fromCharCode(97 + humanCount)));
      const participants = [await connectParticipant(fixture, fixture.hostToken)];
      for (let index = 1; index < humanCount; index++) {
        const joined = await joinRoom(fixture, `Human-${index}`, token(participantTokenFills[(humanCount + index) % participantTokenFills.length]));
        participants.push(await connectParticipant(fixture, joined.token));
      }
      const state = await readyAndFinalize(fixture, participants);
      const seats = publicSeats(state);
      assert.equal(seats.filter(seat => seat.kind === 'human').length, humanCount);
      assert.equal(seats.filter(seat => seat.kind === 'cpu').length, 4 - humanCount);
      assert.equal(new Set(seats.map(seat => seat.seat)).size, 4);
      for (const participant of participants) {
        assert.equal(seats[participant.seat].kind, 'human');
        assert.equal(seats[participant.seat].name, participant.seat === 0 ? `Host-${humanCount}` : seats[participant.seat].name);
      }
      assert.equal(new Set(seats.filter(seat => seat.kind === 'cpu').map(seat => seat.name)).size, 4 - humanCount);
    }
  });

  await t.test('serializes simultaneous joins and keeps seats distinct', async () => {
    const fixture = await makeRoom();
    const joins = await Promise.all([
      joinRoom(fixture, 'Concurrent one', token('2')),
      joinRoom(fixture, 'Concurrent two', token('3')),
      joinRoom(fixture, 'Concurrent three', token('4')),
    ]);
    assert.deepEqual(joins.map(value => value.seat).sort(), [1, 2, 3]);
    const state = await readState(fixture);
    assert.equal(publicSeats(state).filter(seat => seat.kind === 'human').length, 4);
    assert.equal(new Set(publicSeats(state).map(seat => seat.seat)).size, 4);
  });

  await t.test('reconnect resets Ready, survives hibernation and ignores an old close event', async () => {
    const fixture = await makeRoom();
    const first = await connectParticipant(fixture, fixture.hostToken);
    let state = await readState(fixture);
    const ready = sendAction(fixture, first, {
      type: 'set-ready', requestId: 'before-reconnect', expectedRevision: state.revision, ready: true,
    });
    assert.equal(ready.ok, true);
    const oldRevision = ready.revision as number;
    const second = await connectParticipant(fixture, fixture.hostToken);
    state = await readState(fixture);
    assert.equal(state.revision, oldRevision + 1);
    assert.equal(publicSeats(state)[0].connected, true);
    assert.equal(publicSeats(state)[0].ready, false);
    fixture.room.webSocketClose(first.server as unknown as WebSocket);
    const afterOldClose = await readState(fixture);
    assert.equal(publicSeats(afterOldClose)[0].connected, true);
    assert.equal(afterOldClose.hostSeat, 0);
    const restoredObject = new RoomDurableObject(fixture.ctx as unknown as DurableObjectState, {} as Env);
    const restoredState = await responseObject(await restoredObject.fetch(new Request('https://room.internal/internal/state')));
    assert.equal(restoredState.revision, afterOldClose.revision);
    assert.equal(publicSeats(restoredState)[0].connected, true);
    const before = second.client.sent.length;
    restoredObject.webSocketMessage(second.server as unknown as WebSocket, JSON.stringify({ type: 'request-state' }));
    assert.ok(second.client.sent.slice(before).some(message => JSON.parse(message).type === 'room-state'));
    const oldBeforeRequest = first.client.sent.length;
    restoredObject.webSocketMessage(first.server as unknown as WebSocket, JSON.stringify({ type: 'request-state' }));
    assert.ok(first.client.sent.slice(oldBeforeRequest).some(message => JSON.parse(message).code === 'stale_connection'));
  });

  await t.test('validates websocket messages and applies a per-seat request rate limit', async () => {
    const fixture = await makeRoom();
    const host = await connectParticipant(fixture, fixture.hostToken);
    fixture.room.webSocketMessage(host.server as unknown as WebSocket, '{');
    assert.equal(JSON.parse(host.client.sent.at(-1)!).code, 'invalid_json');
    fixture.room.webSocketMessage(host.server as unknown as WebSocket, JSON.stringify({ type: 'set-ready', requestId: 'spoof', expectedRevision: 1, ready: true, seat: 1 }));
    assert.equal(JSON.parse(host.client.sent.at(-1)!).code, 'invalid_message');
    fixture.room.webSocketMessage(host.server as unknown as WebSocket, JSON.stringify({ type: 'unknown-action' }));
    assert.equal(JSON.parse(host.client.sent.at(-1)!).code, 'invalid_message');
    fixture.room.webSocketMessage(host.server as unknown as WebSocket, 'x'.repeat(4097));
    assert.equal(JSON.parse(host.client.sent.at(-1)!).code, 'message_too_large');
    assert.equal(host.server.readyState, 3);

    const secondFixture = await makeRoom('Rate host', token('5'));
    const rateClient = await connectParticipant(secondFixture, secondFixture.hostToken);
    for (let index = 0; index < 31; index++) {
      secondFixture.room.webSocketMessage(rateClient.server as unknown as WebSocket, JSON.stringify({ type: 'request-state' }));
    }
    assert.ok(rateClient.client.sent.some(message => JSON.parse(message).code === 'rate_limited'));
  });

  await t.test('starts, persists, isolates, resumes and advances a two-human online game', { timeout: 30_000 }, async () => {
    const fixture = await makeRoom('Game host', token('7'));
    const guestInfo = await joinRoom(fixture, 'Game guest', token('8'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    let guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);

    const nonHostStart = await sendGameAction(fixture, guest, {
      type: 'start-game', requestId: 'game-non-host-start', expectedGameRevision: 0,
    });
    assert.equal(nonHostStart.ok, false);
    assert.equal(nonHostStart.code, 'not_host');
    const start = await sendGameAction(fixture, host, {
      type: 'start-game', requestId: 'game-start-once', expectedGameRevision: 0,
    });
    assert.equal(start.ok, true);
    const initial = persistedGame(fixture);
    assert.equal(initial.gameRevision, 1);
    const hostView = latestGameView(host);
    const guestView = latestGameView(guest);
    const hostSeats = hostView.seats as Array<Record<string, unknown>>;
    const guestSeats = guestView.seats as Array<Record<string, unknown>>;
    const hostHand = hostSeats[0].hand as Array<Record<string, unknown>>;
    const guestHand = guestSeats[1].hand as Array<Record<string, unknown>>;
    assert.equal(hostHand.length, 13);
    assert.equal(hostSeats[0].drawnTile !== null, true);
    assert.equal(guestHand.length, 13);
    assert.equal(guestSeats[1].drawnTile, null);
    assert.equal('hand' in hostSeats[1], false);
    assert.equal('drawnTile' in hostSeats[1], false);
    assert.equal('liveWall' in hostView, false);
    assert.equal('deadWall' in hostView, false);
    assert.equal('match' in hostView, false);
    const guestPrivateId = String(guestHand[0].id);
    assert.equal(JSON.stringify(hostView).includes(guestPrivateId), false);
    assert.equal(JSON.stringify(guestView).includes(guestPrivateId), true);

    const duplicateStart = await sendGameAction(fixture, host, {
      type: 'start-game', requestId: 'game-start-once', expectedGameRevision: 0,
    });
    assert.equal(duplicateStart.ok, true);
    assert.equal(persistedGame(fixture).gameRevision, 1, 'a duplicate start did not deal a second wall');

    // Recreate the DO and replace one socket. The same participant token recovers
    // the same seat hand from the persisted authoritative state.
    const hostHandIds = hostHand.map(tile => tile.id).sort();
    const previousGuest = guest;
    previousGuest.server.close(1000, 'browser refresh');
    fixture.room.webSocketClose(previousGuest.server as unknown as WebSocket);
    const disconnectedRoom = await readState(fixture);
    assert.equal(publicSeats(disconnectedRoom)[1].kind, 'human');
    assert.equal(publicSeats(disconnectedRoom)[1].connected, false);
    assert.equal((persistedGame(fixture).identities as Array<Record<string, unknown>>)[1].control, 'human');
    fixture.room = new RoomDurableObject(fixture.ctx as unknown as DurableObjectState, {} as Env);
    guest = await connectParticipant(fixture, guestInfo.token);
    assert.equal(guest.seat, 1);
    const recoveredGuest = latestGameView(guest);
    assert.deepEqual(((recoveredGuest.seats as Array<Record<string, unknown>>)[1].hand as Array<Record<string, unknown>>)
      .map(tile => tile.id).sort(), guestHand.map(tile => tile.id).sort());
    assert.deepEqual(((latestGameView(host).seats as Array<Record<string, unknown>>)[0].hand as Array<Record<string, unknown>>)
      .map(tile => tile.id).sort(), hostHandIds);
    fixture.room.webSocketClose(previousGuest.server as unknown as WebSocket);

    const revision = Number(latestGameView(host).gameRevision);
    const currentGuestHand = (latestGameView(guest).seats as Array<Record<string, unknown>>)[1].hand as Array<Record<string, unknown>>;
    const wrongTurn = await sendGameAction(fixture, guest, {
      type: 'discard', requestId: 'game-wrong-turn', expectedGameRevision: revision,
      tileId: String(currentGuestHand[0].id),
    });
    assert.equal(wrongTurn.ok, false);
    assert.equal(wrongTurn.code, 'not_your_turn');
    const illegalOwner = await sendGameAction(fixture, host, {
      type: 'discard', requestId: 'game-other-hand', expectedGameRevision: revision,
      tileId: String(currentGuestHand[0].id),
    });
    assert.equal(illegalOwner.ok, false);
    assert.equal(illegalOwner.code, 'invalid_action');
    assert.equal(persistedGame(fixture).gameRevision, revision, 'rejected operations changed game state');

    const initialHostHand = (latestGameView(host).seats as Array<Record<string, unknown>>)[0].hand as Array<Record<string, unknown>>;
    const discardTileId = String(initialHostHand[0].id);
    const hostDiscard = await sendGameAction(fixture, host, {
      type: 'discard', requestId: 'game-host-discard', expectedGameRevision: revision, tileId: discardTileId,
    });
    assert.equal(hostDiscard.ok, true);
    const afterDiscardRevision = Number(persistedGame(fixture).gameRevision);
    const duplicateDiscard = await sendGameAction(fixture, host, {
      type: 'discard', requestId: 'game-host-discard', expectedGameRevision: revision, tileId: discardTileId,
    });
    assert.equal(duplicateDiscard.ok, true);
    assert.equal(persistedGame(fixture).gameRevision, afterDiscardRevision, 'duplicate discard was applied twice');
    await passVisibleDecisions(fixture, [host, guest]);

    // Advance the server until the guest has a discard. A CPU can call the
    // host's discard, which returns the turn to the host before the guest gets
    // a turn, so drive any such host discard through its legal server view.
    for (let step = 0; step < 16; step++) {
      const currentView = latestGameView(host);
      if (Number(currentView.turnPlayerId) === 1 && currentView.phase === 'awaiting-discard') break;
      if (Number(currentView.turnPlayerId) === 0 && currentView.phase === 'awaiting-discard') {
        const hostDiscardIds = (currentView.self as Record<string, unknown>).discardableTileIds as string[];
        assert.ok(hostDiscardIds.length > 0, 'the host turn exposes a legal discard');
        const hostFollowup = await sendGameAction(fixture, host, {
          type: 'discard', requestId: nextOperationId('game-host-followup'),
          expectedGameRevision: Number(currentView.gameRevision), tileId: hostDiscardIds[0],
        });
        assert.equal(hostFollowup.ok, true);
      } else {
        await fixture.room.alarm();
      }
      await passVisibleDecisions(fixture, [host, guest]);
    }
    let guestTurn = latestGameView(guest);
    assert.equal(guestTurn.turnPlayerId, 1);
    assert.equal(guestTurn.phase, 'awaiting-discard');
    const guestDiscardIds = (guestTurn.self as Record<string, unknown>).discardableTileIds as string[];
    assert.ok(guestDiscardIds.length > 0);
    const beforeCpuRevision = Number(guestTurn.gameRevision);
    const guestDiscard = await sendGameAction(fixture, guest, {
      type: 'discard', requestId: 'game-guest-discard', expectedGameRevision: beforeCpuRevision,
      tileId: guestDiscardIds[0],
    });
    assert.equal(guestDiscard.ok, true);
    await passVisibleDecisions(fixture, [host, guest]);
    let cpuProgressed = false;
    let lastCpuProgressState = persistedGame(fixture);
    for (let step = 0; step < 12 && !cpuProgressed; step++) {
      await fixture.room.alarm();
      await passVisibleDecisions(fixture, [host, guest]);
      const state = persistedGame(fixture);
      lastCpuProgressState = state;
      const match = state.match as Record<string, unknown>;
      const game = match.game as Record<string, unknown>;
      const players = game.players as Array<Record<string, unknown>>;
      cpuProgressed = Number(state.gameRevision) > beforeCpuRevision + 1 &&
        (Boolean((players[2].river as unknown[]).length) || state.status !== 'playing');
    }
    const failedGame = (lastCpuProgressState.match as Record<string, unknown>).game as Record<string, unknown>;
    const failedPlayers = failedGame.players as Array<Record<string, unknown>>;
    assert.equal(cpuProgressed, true, `the server did not advance a CPU turn after the human discard: ${JSON.stringify({
      beforeCpuRevision,
      gameRevision: lastCpuProgressState.gameRevision,
      status: lastCpuProgressState.status,
      decision: lastCpuProgressState.decision,
      turnPlayerId: failedGame.turnPlayerId,
      phase: failedGame.phase,
      pendingRiichi: failedGame.pendingRiichi,
      playerControls: failedPlayers.map(player => player.control),
      player2RiverCount: (failedPlayers[2].river as unknown[]).length,
    })}`);

    const roomBeforeLeave = await readState(fixture);
    const leave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'game-host-leaves', expectedRevision: roomBeforeLeave.revision,
    });
    assert.equal(leave.ok, true);
    const afterHostLeave = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.ok(afterHostLeave.status === 'playing' || afterHostLeave.status === 'round-ended',
      'host leave preserves the active or just-ended online game');
    assert.equal(afterHostLeave.identities[0].control, 'cpu');
    assert.equal(afterHostLeave.match.game.players[0].control, 'cpu');
    const afterHostLeaveRoom = await readState(fixture);
    assert.equal(afterHostLeaveRoom.status, 'finalized');
    assert.equal(afterHostLeaveRoom.hostSeat, 1);
    assert.equal(publicSeats(afterHostLeaveRoom)[0].kind, 'cpu');
    const end = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'game-ci-last-human-leaves', expectedRevision: afterHostLeaveRoom.revision,
    });
    assert.equal(end.ok, true);
    assert.equal((await readState(fixture)).status, 'closed');
  });

  await t.test('turns an exiting host into a CPU, keeps the game moving through sequential exits, and rejects stale authority', { timeout: 30_000 }, async () => {
    const fixture = await makeRoom('Handoff host', token('2'));
    const firstInfo = await joinRoom(fixture, 'First guest', token('3'));
    const secondInfo = await joinRoom(fixture, 'Second guest', token('4'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const firstGuest = await connectParticipant(fixture, firstInfo.token);
    const lastGuest = await connectParticipant(fixture, secondInfo.token);
    await readyAndFinalize(fixture, [host, firstGuest, lastGuest]);
    assert.equal((await sendGameAction(fixture, host, {
      type: 'start-game', requestId: 'handoff-start', expectedGameRevision: 0,
    })).ok, true);

    const pendingTicketResponse = await fixture.room.fetch(new Request('https://room.internal/internal/ticket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantToken: fixture.hostToken }),
    }));
    assert.equal(pendingTicketResponse.status, 200);
    const pendingTicket = (await responseObject(pendingTicketResponse)).ticket as string;
    const original = persistedGame(fixture) as unknown as OnlineGameSession;
    const originalRevision = original.gameRevision;
    const oldPrivateId = original.match.game.players[0].hand[0].id;
    const beforeLeaveRoom = await readState(fixture);
    const leave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'handoff-host-leaves', expectedRevision: beforeLeaveRoom.revision,
    });
    assert.equal(leave.ok, true);

    const afterHostLeave = await readState(fixture);
    let session = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(afterHostLeave.status, 'finalized');
    assert.equal(afterHostLeave.revision, (beforeLeaveRoom.revision as number) + 1);
    assert.equal(afterHostLeave.hostSeat, 1);
    assert.equal(publicSeats(afterHostLeave)[0].kind, 'cpu');
    assert.equal(publicSeats(afterHostLeave)[0].name, 'CPU1');
    assert.equal(publicSeats(afterHostLeave)[1].isHost, true);
    assert.equal(session.hostSeat, 1, 'the game host seat did not follow the room host');
    assert.equal(session.gameRevision, originalRevision + 1);
    assert.equal(session.identities[0].control, 'cpu');
    assert.equal(session.match.game.players[0].control, 'cpu');
    assert.deepEqual(session.match.points, original.match.points);
    assert.deepEqual(session.match.game.liveWall, original.match.game.liveWall);
    assert.deepEqual(session.match.game.deadWall, original.match.game.deadWall);
    assert.deepEqual(session.match.game.players.map((player, seat) => ({
      ...player,
      control: original.match.game.players[seat].control,
    })), original.match.game.players);
    const survivorView = latestGameView(firstGuest);
    const publicViewSeats = survivorView.seats as Array<Record<string, unknown>>;
    assert.equal(publicViewSeats[0].control, 'cpu');
    assert.equal('hand' in publicViewSeats[0], false);
    assert.equal(JSON.stringify(survivorView).includes(oldPrivateId), false);
    const notice = firstGuest.client.sent.map(message => JSON.parse(message) as Record<string, unknown>)
      .filter(message => message.type === 'seat-taken-over').at(-1);
    assert.equal(notice?.cpuName, 'CPU1');
    assert.equal(notice?.hostChanged, true);
    assert.equal(notice?.hostName, 'First guest');

    const replay = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'handoff-host-leaves', expectedRevision: beforeLeaveRoom.revision,
    });
    assert.equal(replay.ok, true);
    assert.equal((persistedGame(fixture) as unknown as OnlineGameSession).gameRevision, session.gameRevision,
      'a repeated leave request applied a second takeover');
    const revokedToken = await fixture.room.fetch(new Request('https://room.internal/internal/ticket', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantToken: fixture.hostToken }),
    }));
    assert.equal(revokedToken.status, 401);
    const revokedTicket = await fixture.room.fetch(new Request(`https://room.internal/${fixture.code}/socket`, {
      headers: {
        Origin: 'https://ak-sekine.github.io',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `heibon-mahjong.v1, ticket.${pendingTicket}`,
      },
    }));
    assert.equal(revokedTicket.status, 401);
    const staleGameAction = await sendGameAction(fixture, host, {
      type: 'declare-tsumo', requestId: 'exited-host-action', expectedGameRevision: session.gameRevision,
    });
    assert.equal(staleGameAction.code, 'unauthorized');

    // Start a CPU turn computation, then hand off another seat before its
    // asynchronous evaluator attempts to persist its old game revision.
    const expectedSecondLeave = afterHostLeave.revision;
    const cpuInFlight = fixture.room.alarm();
    const secondLeave = sendAction(fixture, firstGuest, {
      type: 'leave-room', requestId: 'handoff-first-guest-leaves', expectedRevision: expectedSecondLeave as number,
    });
    assert.equal(secondLeave.ok, true);
    const afterSecondLeave = persistedGame(fixture) as unknown as OnlineGameSession;
    await cpuInFlight;
    session = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.deepEqual(session, afterSecondLeave, 'a stale CPU calculation overwrote the newer handoff state');
    assert.equal(session.hostSeat, 2);
    assert.deepEqual(session.identities.map(identity => identity.control), ['cpu', 'cpu', 'human', 'cpu']);
    const oneHumanRoom = await readState(fixture);
    assert.equal(oneHumanRoom.hostSeat, 2);
    assert.equal(publicSeats(oneHumanRoom).filter(seat => seat.kind === 'human').length, 1);
    assert.equal(publicSeats(oneHumanRoom).filter(seat => seat.kind === 'cpu').length, 3);
    assert.equal(new Set(publicSeats(oneHumanRoom).filter(seat => seat.kind === 'cpu').map(seat => seat.name)).size, 3);
    const lateJoin = await fixture.room.fetch(new Request('https://room.internal/internal/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Late joiner', participantToken: token('5') }),
    }));
    assert.equal(lateJoin.status, 409);

    const afterHandoffRevision = session.gameRevision;
    for (let step = 0; step < 6; step++) {
      await passVisibleDecisions(fixture, [lastGuest]);
      await fixture.room.alarm();
      await passVisibleDecisions(fixture, [lastGuest]);
      session = persistedGame(fixture) as unknown as OnlineGameSession;
      if (session.gameRevision > afterHandoffRevision) break;
    }
    assert.ok(session.gameRevision > afterHandoffRevision, 'the remaining human plus CPU3 seats did not resume play');

    const beforeLastLeave = await readState(fixture);
    const lastLeave = sendAction(fixture, lastGuest, {
      type: 'leave-room', requestId: 'handoff-last-player-leaves', expectedRevision: beforeLastLeave.revision as number,
    });
    assert.equal(lastLeave.ok, true);
    assert.equal((await readState(fixture)).status, 'closed');
  });

  await t.test('a non-host exit hands over only that seat and keeps the existing host', async () => {
    const fixture = await makeRoom('Existing host', token('6'));
    const guestInfo = await joinRoom(fixture, 'Departing guest', token('7'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'non-host-start', expectedGameRevision: 0 });
    const before = persistedGame(fixture) as unknown as OnlineGameSession;
    const beforeRoom = await readState(fixture);

    const leave = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'non-host-leaves-game', expectedRevision: beforeRoom.revision as number,
    });
    assert.equal(leave.ok, true);
    const afterRoom = await readState(fixture);
    const after = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(afterRoom.hostSeat, 0);
    assert.equal(afterRoom.revision, (beforeRoom.revision as number) + 1);
    assert.equal(after.hostSeat, 0);
    assert.equal(after.gameRevision, before.gameRevision + 1);
    assert.equal(after.identities[1].control, 'cpu');
    assert.deepEqual(after.match.game.liveWall, before.match.game.liveWall);
    assert.deepEqual(after.match.points, before.match.points);
  });

  await t.test('a host exit during a pending ron keeps the other human answer and applies CPU ron', async () => {
    const fixture = await makeRoom('Ron host', token('8'));
    const guestInfo = await joinRoom(fixture, 'Ron guest', token('9'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'ron-handoff-start', expectedGameRevision: 0 });
    const decision: PlayerDecisionWindow = {
      windowId: 'd'.repeat(24), type: 'ron', openedAt: Date.now(), expiresAt: Date.now() + 30_000,
      baseGameRevision: 40, requiredSeats: [0, 1], responses: { 0: 'pending', 1: 'pending' },
    };
    const waiting = onlineSessionForGame(fixture, ronGame(2, [0, 1]), 40, decision);
    saveGameSession(fixture, waiting);
    const roomBefore = await readState(fixture);

    const leave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'ron-host-leaves', expectedRevision: roomBefore.revision as number,
    });
    assert.equal(leave.ok, true);
    let transferred = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(transferred.status, 'playing');
    assert.equal(transferred.hostSeat, 1);
    assert.equal(transferred.gameRevision, 41);
    assert.deepEqual(transferred.decision?.requiredSeats, [1]);
    assert.deepEqual(transferred.decision?.responses, { 1: 'pending' });
    assert.equal((latestGameView(guest).self as Record<string, unknown>).isHost, true);
    const oldAnswer = await sendGameAction(fixture, host, {
      type: 'declare-ron', requestId: 'revoked-ron-answer', expectedGameRevision: 40, windowId: decision.windowId,
    });
    assert.equal(oldAnswer.code, 'unauthorized');
    const validAnswer = await sendGameAction(fixture, guest, {
      type: 'declare-ron', requestId: 'remaining-ron-answer', expectedGameRevision: 40, windowId: decision.windowId,
    });
    assert.equal(validAnswer.ok, true);
    transferred = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(transferred.status, 'round-ended');
    assert.deepEqual(transferred.match.game.winResult?.winMethod === 'ron'
      ? transferred.match.game.winResult.winners.map(winner => winner.winnerId).sort() : [], [0, 1]);
  });

  await t.test('a pending call for an exiting seat is resolved by the CPU and resumes its turn', async () => {
    const fixture = await makeRoom('Call host', token('a'));
    const guestInfo = await joinRoom(fixture, 'Call guest', token('b'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'call-handoff-start', expectedGameRevision: 0 });
    const dealt = callStart();
    const discarded = discardTileForOnline(dealt, 3, dealt.players[3].drawnTile!.id);
    const game = { ...discarded, phase: 'awaiting-call' as const };
    assert.ok(getCallOptions(game, 0).some(option => option.type === 'pon'));
    const decision: PlayerDecisionWindow = {
      windowId: 'e'.repeat(24), type: 'call', openedAt: 1000, expiresAt: 31_000,
      baseGameRevision: 50, requiredSeats: [0], responses: { 0: 'pending' },
    };
    saveGameSession(fixture, onlineSessionForGame(fixture, game, 50, decision));
    const roomBefore = await readState(fixture);

    const leave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'call-host-leaves', expectedRevision: roomBefore.revision as number,
    });
    assert.equal(leave.ok, true);
    let transferred = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(transferred.decision, null);
    assert.equal(transferred.match.game.phase, 'awaiting-discard');
    assert.equal(transferred.match.game.turnPlayerId, 0);
    assert.equal(transferred.match.game.players[0].control, 'cpu');
    assert.equal(transferred.match.game.players[0].melds?.at(-1)?.type, 'pon');
    assert.ok(fixture.ctx.storage.alarmAt, 'the new CPU turn did not schedule an alarm');
    await fixture.room.alarm();
    transferred = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.ok(transferred.gameRevision > 50);
    assert.ok(transferred.match.game.players[0].river.length > 0, 'the CPU did not discard after its call');
    const view = latestGameView(guest);
    const seatZero = (view.seats as Array<Record<string, unknown>>)[0];
    assert.equal('hand' in seatZero, false);
    assert.ok(Array.isArray(seatZero.melds) && (seatZero.melds as unknown[]).length > 0);
  });

  for (const count of [1, 2, 4]) await t.test(`${count} humans confirm once, persist and start only after everyone`, async () => {
    const fixture = await makeRoom('Ready host', token('a'));
    const participants = [await connectParticipant(fixture, fixture.hostToken)];
    const tokens = [fixture.hostToken];
    for (let i = 1; i < count; i++) {
      const joined = await joinRoom(fixture, `Ready ${i}`, token(String(i)));
      tokens.push(joined.token);
      participants.push(await connectParticipant(fixture, joined.token));
    }
    await readyAndFinalize(fixture, participants);
    await sendGameAction(fixture, participants[0], { type: 'start-game', requestId: 'ready-start', expectedGameRevision: 0 });
    const active = onlineSessionForGame(fixture, tsumoGame(undefined, true), 80);
    const ended = applyOnlineGameAction(active, 0, {
      type: 'declare-tsumo', requestId: 'ready-tsumo', expectedGameRevision: 80,
    }, new Set(participants.map(p => p.seat as PlayerId)), 1000);
    saveGameSession(fixture, ended);
    if (count > 1) {
      participants[0].server.close(1000, 'unready refresh');
      fixture.room.webSocketClose(participants[0].server as unknown as WebSocket);
      fixture.room = new RoomDurableObject(fixture.ctx as unknown as DurableObjectState, {} as Env);
      participants[0] = await connectParticipant(fixture, tokens[0]);
      assert.equal((latestGameView(participants[0]).self as Record<string, unknown>).nextRoundReady, false);
      assert.equal(persistedGame(fixture).status, 'round-ended');
    }
    const stale = await sendGameAction(fixture, participants[0], {
      type: 'next-round', requestId: 'old-round-ready', expectedGameRevision: 80,
    });
    assert.equal(stale.code, 'stale_revision');
    // Guests can confirm first, all with the same snapshot revision.
    const order = [...participants.keys()].reverse();
    for (const [index, seat] of order.entries()) {
      const action = { type: 'next-round', requestId: `ready-${seat}`, expectedGameRevision: ended.gameRevision };
      const result = await sendGameAction(fixture, participants[seat], action);
      assert.equal(result.ok, true);
      const saved = persistedGame(fixture) as unknown as OnlineGameSession;
      await sendGameAction(fixture, participants[seat], action);
      assert.deepEqual(persistedGame(fixture), saved, 'request ID replay must not apply twice');
      if (index < count - 1) {
        assert.equal(saved.status, 'round-ended');
        assert.deepEqual(saved.match, ended.match);
        const duplicate = await sendGameAction(fixture, participants[seat], { ...action, requestId: `repeat-${seat}` });
        assert.equal(duplicate.ok, true);
        assert.deepEqual(persistedGame(fixture), saved);
        participants[seat].server.close(1000, 'refresh');
        fixture.room.webSocketClose(participants[seat].server as unknown as WebSocket);
        fixture.room = new RoomDurableObject(fixture.ctx as unknown as DurableObjectState, {} as Env);
        participants[seat] = await connectParticipant(fixture, tokens[seat]);
        assert.equal((latestGameView(participants[seat]).self as Record<string, unknown>).nextRoundReady, true);
        assert.deepEqual((persistedGame(fixture) as unknown as OnlineGameSession).roundReady, saved.roundReady);
      } else {
        assert.equal(saved.status, 'playing');
        assert.equal(saved.match.roundNumber, 2);
        const old = await sendGameAction(fixture, participants[seat], { ...action, requestId: 'late-old-ready' });
        assert.equal(old.ok, false);
        assert.deepEqual(persistedGame(fixture), saved);
      }
    }
    if (count === 2) {
      const second = applyOnlineGameAction(onlineSessionForGame(fixture, tsumoGame(undefined, true), 120), 0, {
        type: 'declare-tsumo', requestId: 'second-tsumo', expectedGameRevision: 120,
      }, new Set<PlayerId>([0, 1]), 1000);
      saveGameSession(fixture, second);
      assert.equal((await sendGameAction(fixture, participants[0], {
        type: 'next-round', requestId: 'previous-round', expectedGameRevision: ended.gameRevision,
      })).code, 'stale_revision');
      const simultaneous = await Promise.all(participants.map((participant, seat) => sendGameAction(fixture, participant, {
        type: 'next-round', requestId: `simultaneous-${seat}`, expectedGameRevision: second.gameRevision,
      })));
      assert.ok(simultaneous.every(result => result.ok));
      const next = persistedGame(fixture) as unknown as OnlineGameSession;
      assert.equal(next.status, 'playing');
      assert.equal(next.gameRevision, second.gameRevision + 3, 'two confirmations plus one start');
      assert.equal(next.roundReady, undefined);
    }
  });

  await t.test('leaving the last unready human starts the next round for ready survivors', async () => {
    const fixture = await makeRoom('Leaving host', token('a'));
    const info = await joinRoom(fixture, 'Ready guest', token('b'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, info.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'leave-start', expectedGameRevision: 0 });
    const ended = applyOnlineGameAction(onlineSessionForGame(fixture, tsumoGame(undefined, true), 90), 0, {
      type: 'declare-tsumo', requestId: 'leave-tsumo', expectedGameRevision: 90,
    }, new Set<PlayerId>([0, 1]), 1000);
    saveGameSession(fixture, ended);
    await sendGameAction(fixture, guest, { type: 'next-round', requestId: 'guest-ready', expectedGameRevision: ended.gameRevision });
    const room = await readState(fixture);
    assert.equal(sendAction(fixture, host, { type: 'leave-room', requestId: 'unready-leaves', expectedRevision: room.revision }).ok, true);
    const next = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(next.status, 'playing');
    assert.equal(next.hostSeat, 1);
    assert.equal(next.identities[0].control, 'cpu');
    assert.equal(next.match.roundNumber, 2);
  });

  await t.test('a round-result exit preserves settlement and lets the successor start the next round', async () => {
    const fixture = await makeRoom('Round host', token('c'));
    const guestInfo = await joinRoom(fixture, 'Round guest', token('d'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'round-handoff-start', expectedGameRevision: 0 });
    const active = onlineSessionForGame(fixture, tsumoGame(undefined, true), 60);
    const ended = applyOnlineGameAction(active, 0, {
      type: 'declare-tsumo', requestId: 'worker-round-tsumo', expectedGameRevision: 60,
    }, new Set<PlayerId>([0, 1]), 1000);
    assert.equal(ended.status, 'round-ended');
    saveGameSession(fixture, ended);
    const beforePoints = [...ended.match.points];
    const beforeSettlement = structuredClone(ended.match.lastSettlement);
    const roomBefore = await readState(fixture);

    const leave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'round-host-leaves', expectedRevision: roomBefore.revision as number,
    });
    assert.equal(leave.ok, true);
    const transferred = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(transferred.status, 'round-ended');
    assert.deepEqual(transferred.match.points, beforePoints);
    assert.deepEqual(transferred.match.lastSettlement, beforeSettlement);
    assert.equal(transferred.hostSeat, 1);
    assert.equal(transferred.identities[0].control, 'cpu');

    const nextRound = await sendGameAction(fixture, guest, {
      type: 'next-round', requestId: 'successor-starts-next-round', expectedGameRevision: transferred.gameRevision,
    });
    assert.equal(nextRound.ok, true);
    const resumed = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(resumed.status, 'playing');
    assert.equal(resumed.match.roundNumber, 2);
    assert.deepEqual(resumed.match.points, beforePoints);
    assert.equal(resumed.identities[0].control, 'cpu');
    assert.equal(resumed.match.game.players[0].control, 'cpu');
  });

  await t.test('the last human leaving an active game closes the room without CPU-only play', async () => {
    const fixture = await makeRoom('Last host', token('e'));
    const guestInfo = await joinRoom(fixture, 'Last guest', token('f'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    await sendGameAction(fixture, host, { type: 'start-game', requestId: 'last-player-start', expectedGameRevision: 0 });
    let roomState = await readState(fixture);
    const firstLeave = sendAction(fixture, host, {
      type: 'leave-room', requestId: 'first-human-leaves', expectedRevision: roomState.revision as number,
    });
    assert.equal(firstLeave.ok, true);
    roomState = await readState(fixture);
    assert.equal(roomState.status, 'finalized');
    const finalLeave = sendAction(fixture, guest, {
      type: 'leave-room', requestId: 'final-human-leaves', expectedRevision: roomState.revision as number,
    });
    assert.equal(finalLeave.ok, true);
    const closed = await readState(fixture);
    assert.equal(closed.status, 'closed');
    assert.equal(closed.hostSeat, null);
    assert.deepEqual(publicSeats(closed).map(seat => seat.kind), ['empty', 'empty', 'empty', 'empty']);
    const ended = persistedGame(fixture) as unknown as OnlineGameSession;
    assert.equal(ended.status, 'aborted');
    const revision = ended.gameRevision;
    await fixture.room.alarm();
    assert.equal((persistedGame(fixture) as unknown as OnlineGameSession).gameRevision, revision,
      'CPU-only play continued after the final human left');
  });

  await t.test('an answer racing a delayed alarm expires atomically and is rejected', async () => {
    const fixture = await makeRoom('Timeout host', token('9'));
    const guestInfo = await joinRoom(fixture, 'Timeout guest', token('a'));
    const host = await connectParticipant(fixture, fixture.hostToken);
    const guest = await connectParticipant(fixture, guestInfo.token);
    await readyAndFinalize(fixture, [host, guest]);
    const started = await sendGameAction(fixture, host, {
      type: 'start-game', requestId: 'timeout-game-start', expectedGameRevision: 0,
    });
    assert.equal(started.ok, true);

    const source = ronGame(1, [0]);
    const players = source.players.map((player, seat) => ({
      ...player,
      control: seat === 0 ? 'human' : 'cpu',
    })) as typeof source.players;
    const match = startMatch({ ...source, players });
    const identities = [0, 1, 2, 3].map(seat => ({
      seat,
      name: seat === 0 ? 'Timeout host' : `CPU ${seat}`,
      control: seat === 0 ? 'human' : 'cpu',
      connected: seat === 0,
    }));
    const session = {
      schemaVersion: 1,
      gameRevision: 77,
      match,
      status: 'playing',
      identities,
      hostSeat: 0,
      decision: {
        windowId: 'c'.repeat(24),
        type: 'ron',
        openedAt: Date.now() - 31_000,
        expiresAt: Date.now() - 1,
        baseGameRevision: 77,
        requiredSeats: [0],
        responses: { 0: 'pending' },
      },
    };
    fixture.ctx.storage.sql.exec(
      'UPDATE online_game SET game_revision = ?, state_json = ?, updated_at = ? WHERE singleton = 1',
      session.gameRevision, JSON.stringify(session), Date.now(),
    );

    const late = await sendGameAction(fixture, host, {
      type: 'pass-ron', requestId: 'timeout-late-response',
      expectedGameRevision: 77, windowId: session.decision.windowId,
    });
    assert.equal(late.ok, false);
    assert.equal(late.code, 'stale_decision');
    assert.equal(late.gameRevision, 78);
    const expired = persistedGame(fixture);
    assert.equal(expired.gameRevision, 78, 'the timeout was not committed before rejecting the late answer');
    const expiredMatch = expired.match as Record<string, unknown>;
    const expiredGame = expiredMatch.game as Record<string, unknown>;
    const expiredPlayers = expiredGame.players as Array<Record<string, unknown>>;
    assert.equal(expiredPlayers[0].temporaryFuriten, true, 'timeout did not apply furiten to the ron passer');
  });

  await t.test('uses bounded, expiring IP rate buckets', async () => {
    const ctx = new TestRoomContext();
    const limiter = new RateLimitDurableObject(ctx as unknown as DurableObjectState, {} as Env);
    const bucket = `${'a'.repeat(64)}:join`;
    const consume = () => limiter.fetch(new Request('https://rate.internal/internal/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, limit: 2, windowMs: 60_000 }),
    }));
    assert.equal((await responseObject(await consume())).allowed, true);
    assert.equal((await responseObject(await consume())).allowed, true);
    const limited = await consume();
    assert.equal(limited.status, 200);
    assert.equal((await responseObject(limited)).allowed, false);
    const separateScope = await limiter.fetch(new Request('https://rate.internal/internal/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: `${'b'.repeat(64)}:join`, limit: 2, windowMs: 60_000 }),
    }));
    assert.equal((await responseObject(separateScope)).allowed, true);
  });
});
