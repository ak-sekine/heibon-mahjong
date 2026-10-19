import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { RateLimitDurableObject } from '../worker/rate-limit.ts';
import { RoomDurableObject } from '../worker/room.ts';

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

function latestState(participant: Participant): Record<string, unknown> {
  const messages = participant.client.sent.map(item => JSON.parse(item) as Record<string, unknown>);
  const state = messages.filter(message => message.type === 'room-state').at(-1);
  assert.ok(state, 'missing complete room state');
  return state;
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
