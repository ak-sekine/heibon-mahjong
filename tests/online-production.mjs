import { appendFileSync } from 'node:fs';
import WebSocket from 'ws';
import {
  latestGameMessage,
  waitForCpuProgress as waitForSynchronizedCpuProgress,
  waitForClientMessage,
  waitForHumanTurn as waitForSynchronizedHumanTurn,
} from './online-production-sync.mjs';

const apiUrl = (process.env.ONLINE_API_URL ?? '').replace(/\/+$/u, '');
const pageOrigin = process.env.ONLINE_TEST_ORIGIN ?? 'https://ak-sekine.github.io';
const protocolName = 'heibon-mahjong.v1';
const privateSentinel = 'PRIVATE_TILE_DATA_MUST_NOT_LEAK';
const privateValues = [privateSentinel];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const diagnosticsEnabled = process.env.PRODUCTION_TEST_DIAGNOSTICS === '1';
const diagnosticsStartedAt = Date.now();
const diagnosticHistory = [];
const diagnosticHistoryLimit = 60;
let requestNumber = 0;
const roomsForCleanup = [];

function diagnostic(event, details = {}) {
  if (!diagnosticsEnabled) return;
  const record = { ...details, event, elapsedMs: Date.now() - diagnosticsStartedAt };
  if (event === 'websocket-game-state') {
    diagnosticHistory.push(record);
    if (diagnosticHistory.length > diagnosticHistoryLimit) diagnosticHistory.shift();
  }
  console.log(`[production-diagnostic] ${JSON.stringify(record)}`);
}

function decisionInfo(view) {
  const decision = view?.self?.decision;
  return {
    pending: Boolean(decision && !decision.answered),
    type: decision?.type ?? null,
    windowIdSuffix: typeof decision?.windowId === 'string' ? decision.windowId.slice(-6) : null,
    answered: decision ? Boolean(decision.answered) : null,
    remainingMs: decision && Number.isFinite(decision.expiresAt)
      ? Math.max(0, Math.round(decision.expiresAt - Date.now()))
      : null,
  };
}

function socketState(client) {
  return ['connecting', 'open', 'closing', 'closed'][client.socket.readyState] ?? 'unknown';
}

function currentGameRevision(client) {
  const revision = latestGameMessage(client)?.view?.gameRevision;
  return Number.isSafeInteger(revision) ? revision : null;
}

function logGameState(client, message) {
  const view = message.view;
  const turnControl = view?.seats?.[view?.turnPlayerId]?.control ?? null;
  const decision = decisionInfo(view);
  diagnostic('websocket-game-state', {
    client: client.diagnosticLabel,
    messageType: message.type,
    gameRevision: Number.isSafeInteger(view?.gameRevision) ? view.gameRevision : null,
    status: view?.status ?? null,
    phase: view?.phase ?? null,
    turnPlayerId: view?.turnPlayerId ?? null,
    turnControl,
    turnIsHuman: turnControl === 'human' ? true : turnControl === 'cpu' ? false : null,
    decisionPending: decision.pending,
    decisionType: decision.type,
    decisionWindowIdSuffix: decision.windowIdSuffix,
    decisionAnswered: decision.answered,
    decisionRemainingMs: decision.remainingMs,
    socketState: socketState(client),
  });
}

function logGameWaitTimeout(clients, waitKind, afterRevision, timeoutMs) {
  if (!diagnosticsEnabled) return;
  const elapsedMs = Date.now() - diagnosticsStartedAt;
  console.error(`[production-diagnostic +${elapsedMs}ms] ${waitKind} timed out (afterRevision=${afterRevision}, timeoutMs=${timeoutMs})`);
  for (const client of clients) {
    const view = latestGameMessage(client)?.view;
    const decision = decisionInfo(view);
    const turnControl = view?.seats?.[view?.turnPlayerId]?.control ?? null;
    const decisionText = decision.type ? `${decision.type} (window …${decision.windowIdSuffix})` : 'none';
    console.error(`Client: ${client.diagnosticLabel}`);
    console.error(`revision: ${Number.isSafeInteger(view?.gameRevision) ? view.gameRevision : 'none'}`);
    console.error(`status: ${view?.status ?? 'none'}`);
    console.error(`phase: ${view?.phase ?? 'none'}`);
    console.error(`turnPlayerId: ${view?.turnPlayerId ?? 'none'}`);
    console.error(`turnControl: ${turnControl ?? 'unknown'}`);
    console.error(`decision: ${decisionText}`);
    console.error(`decisionAnswered: ${decision.answered ?? 'n/a'}`);
    console.error(`lastAction: ${client.lastAction ? JSON.stringify(client.lastAction) : 'none'}`);
    console.error(`lastActionResult: ${client.lastActionResult ? JSON.stringify(client.lastActionResult) : 'none'}`);
    console.error(`socketState: ${socketState(client)}`);
  }
  console.error('Recent game-state transitions:');
  for (const transition of diagnosticHistory.slice(-30)) {
    console.error(`[production-diagnostic] ${JSON.stringify(transition)}`);
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function nextRequestId(prefix = 'ci') {
  requestNumber++;
  return `${prefix}-${requestNumber}`;
}

function testName(label, suffix) {
  const prefix = [...label].slice(0, Math.max(1, 24 - [...suffix].length - 1)).join('');
  return `${prefix}-${suffix}`;
}

async function request(path, { method = 'GET', body, token, origin = pageOrigin } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error(`HTTPS request failed: ${method} ${path}`);
  }
  let value = {};
  try { value = await response.json(); } catch { /* Status checks report a safe, generic error. */ }
  return { response, value };
}

function waitForMessage(client, predicate, afterIndex = 0, timeoutMs = 10000, description = 'protocol response', signal) {
  return waitForClientMessage(client, predicate, {
    afterIndex,
    timeoutMs,
    description,
    signal,
    diagnostic,
  });
}

function waitForRoomState(client, predicate, afterIndex = 0, timeoutMs = 10000, description = 'room-state update') {
  return waitForMessage(client, message => message.type === 'room-state' && predicate(message), afterIndex, timeoutMs, description);
}

function waitForGameState(client, predicate, afterIndex = 0, timeoutMs = 15000, description = 'game-state update', signal) {
  const waitStartedAt = Date.now();
  return waitForMessage(client, message => {
    const matches = (message.type === 'game-state' || message.type === 'game-started') && predicate(message.view);
    if (matches) {
      const details = {
        client: client.diagnosticLabel,
        description,
        waitElapsedMs: Date.now() - waitStartedAt,
        gameRevision: Number.isSafeInteger(message.view?.gameRevision) ? message.view.gameRevision : null,
        status: message.view?.status ?? null,
        phase: message.view?.phase ?? null,
        turnPlayerId: message.view?.turnPlayerId ?? null,
      };
      if (diagnosticsEnabled) queueMicrotask(() => diagnostic('wait-for-game-state-satisfied', details));
    }
    return matches;
  }, afterIndex, timeoutMs, description, signal);
}

async function sendGameAction(client, payload, expectedGameRevision, prefix = 'game-ci', { signal } = {}) {
  check(client.socket.readyState === WebSocket.OPEN, 'A WebSocket client needed for game action is closed.');
  const requestId = payload.requestId ?? nextRequestId(prefix);
  const before = client.messages.length;
  const action = { type: payload.type, expectedGameRevision };
  const sentAt = Date.now();
  client.lastAction = action;
  client.pendingGameActions.set(requestId, { type: payload.type, expectedGameRevision, sentAt });
  diagnostic('game-action-sent', { client: client.diagnosticLabel, ...action });
  try {
    client.socket.send(JSON.stringify({ ...payload, requestId, expectedGameRevision }));
    const result = await waitForMessage(client,
      message => message.type === 'game-action-result' && message.requestId === requestId, before, 10000, `game-action-result for ${payload.type}`, signal);
    if (result.ok || result.code === 'stale_revision' || result.code === 'stale_decision') await waitForGameState(client,
      view => Number(view.gameRevision) >= Number(result.gameRevision), before, 15000, `game-state after ${payload.type}`, signal);
    return { result, requestId, before };
  } finally {
    client.pendingGameActions.delete(requestId);
  }
}

async function discardAtCurrentRevision(client, tileId, expectedGameRevision, prefix, options) {
  const first = await sendGameAction(client, { type: 'discard', tileId }, expectedGameRevision, prefix, options);
  if (first.result.code !== 'stale_revision') return first;
  const fresh = latestGameMessage(client)?.view;
  if (fresh?.phase !== 'awaiting-discard' || fresh.viewerSeat !== fresh.turnPlayerId ||
      !fresh.self.discardableTileIds.includes(tileId)) return null;
  return sendGameAction(client, { type: 'discard', tileId }, fresh.gameRevision, `${prefix}-retry`, options);
}

async function waitForHumanTurn(clients, minimumRevision, timeoutMs = 20000) {
  diagnostic('wait-for-human-turn-start', {
    afterRevision: minimumRevision,
    timeoutMs,
    clients: clients.map(client => ({
      client: client.diagnosticLabel,
      gameRevision: currentGameRevision(client),
      decision: decisionInfo(latestGameMessage(client)?.view),
    })),
  });
  return waitForSynchronizedHumanTurn(clients, minimumRevision, {
    timeoutMs,
    sendDecision: (client, payload, expectedGameRevision, signal) =>
      sendGameAction(client, payload, expectedGameRevision, 'game-pass', { signal }),
    diagnostic,
    onTimeout: () => logGameWaitTimeout(clients, 'waitForHumanTurn', minimumRevision, timeoutMs),
  });
}

async function waitForCpuProgress(clients, afterRevision, previousRivers, timeoutMs = 15000) {
  return waitForSynchronizedCpuProgress(clients, afterRevision, previousRivers, {
    timeoutMs,
    sendDecision: (client, payload, expectedGameRevision, signal) =>
      sendGameAction(client, payload, expectedGameRevision, 'game-pass', { signal }),
    handleHumanTurn: (client, view, signal) => discardAtCurrentRevision(
      client, view.self.discardableTileIds[0], view.gameRevision, 'next-human-discard', { signal },
    ).then(result => {
      if (!result || result.result.code === 'stale_revision') return;
      check(result.result.ok === true, `A later legal human discard was rejected (${result.result.code ?? 'unknown'}).`);
    }),
    diagnostic,
    onTimeout: () => logGameWaitTimeout(clients, 'waitForCpuProgress', afterRevision, timeoutMs),
  });
}

function inspectGameView(client, expectedSeat, privateValues, expectedRoomCode, message = latestGameMessage(client)) {
  const view = message?.view;
  check(view?.roomCode === expectedRoomCode && view.viewerSeat === expectedSeat, 'A seat-specific game state was not received.');
  check(Array.isArray(view.seats) && view.seats.length === 4, 'The game view did not contain all four public seats.');
  check(Array.isArray(view.seats[expectedSeat].hand), 'The authenticated player did not receive their own hand.');
  const wire = JSON.stringify(message);
  check(!privateValues.some(value => wire.includes(value)), 'A participant or ticket secret appeared in a game message.');
  check(!('liveWall' in view) && !('deadWall' in view) && !('match' in view), 'Private full game state was sent to a browser.');
  for (const seat of view.seats) {
    if (seat.seat === expectedSeat) continue;
    check(!('hand' in seat) && !('drawnTile' in seat), 'Another player hand or draw appeared in this seat view.');
  }
  return view;
}

function connect(url, ticket, privateValues, diagnosticLabel = 'participant') {
  const socket = new WebSocket(url, [protocolName, `ticket.${ticket}`], {
    headers: { Origin: pageOrigin },
    handshakeTimeout: 10000,
  });
  const client = {
    socket,
    messages: [],
    waiters: new Set(),
    decisionAttempts: new Set(),
    privacyLeak: false,
    diagnosticLabel,
    pendingGameActions: new Map(),
    lastAction: null,
    lastActionResult: null,
  };
  socket.on('message', data => {
    const serialized = data.toString();
    if (privateValues.some(value => serialized.includes(value))) {
      client.privacyLeak = true;
      return;
    }
    let message;
    try { message = JSON.parse(serialized); } catch { return; }
    client.messages.push(message);
    client.waiters.forEach(waiter => waiter(message));
    if (message.type === 'game-state' || message.type === 'game-started') logGameState(client, message);
    if (message.type === 'game-action-result') {
      const pending = client.pendingGameActions.get(message.requestId);
      if (pending) {
        const result = {
          ok: Boolean(message.ok),
          code: message.code ?? null,
          gameRevision: Number.isSafeInteger(message.gameRevision) ? message.gameRevision : null,
          responseElapsedMs: Date.now() - pending.sentAt,
        };
        client.lastActionResult = result;
        client.pendingGameActions.delete(message.requestId);
        diagnostic('game-action-result', {
          client: client.diagnosticLabel,
          actionType: pending.type,
          expectedGameRevision: pending.expectedGameRevision,
          ...result,
        });
      }
    }
  });
  socket.on('open', () => diagnostic('websocket-open', { client: client.diagnosticLabel }));
  socket.on('close', code => diagnostic('websocket-close', {
    client: client.diagnosticLabel,
    code,
    socketState: socketState(client),
  }));
  const opened = new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', () => reject(new Error('WebSocket connection failed.')));
    socket.once('unexpected-response', (_request, response) => {
      reject(new Error(`WebSocket handshake was rejected with status ${response.statusCode}.`));
    });
  });
  socket.on('error', () => diagnostic('websocket-error', { client: client.diagnosticLabel }));
  client.opened = opened;
  return client;
}

async function issueTicket(roomCode, token) {
  const result = await request(`/api/rooms/${roomCode}/ticket`, { method: 'POST', token });
  check(result.response.status === 200 && typeof result.value.ticket === 'string', 'WebSocket ticket could not be issued.');
  privateValues.push(result.value.ticket);
  return result.value.ticket;
}

async function connectParticipant(roomCode, token, diagnosticLabel = 'participant') {
  const wsUrl = `${apiUrl.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:')}/api/rooms/${roomCode}/socket`;
  const client = connect(wsUrl, await issueTicket(roomCode, token), privateValues, diagnosticLabel);
  await client.opened;
  await waitForRoomState(client, state => state.roomCode === roomCode && Array.isArray(state.seats));
  return client;
}

async function createRoom(label) {
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { displayName: testName(label, 'A'), privateTileData: privateSentinel },
  });
  check(created.response.status === 201, 'Room creation failed.');
  const roomCode = created.value.roomCode;
  const token = created.value.participantToken;
  check(/^[A-HJ-NP-Z2-9]{6}$/u.test(roomCode), 'Room code format was invalid.');
  check(typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token), 'Room creation did not return a valid participant token.');
  privateValues.push(token);
  check(created.value.playerSeat === 0, 'The creator was not assigned the first seat.');
  check(!JSON.stringify(created.value).includes(privateSentinel), 'Private request data was echoed by room creation.');
  const room = {
    roomCode,
    hostToken: token,
    createdAt: created.value.createdAt,
    expiresAt: created.value.expiresAt,
    sockets: [],
  };
  roomsForCleanup.push(room);
  return room;
}

async function joinRoom(room, name) {
  const joined = await request(`/api/rooms/${room.roomCode}/join`, {
    method: 'POST',
    body: { displayName: [...name].slice(0, 24).join(''), privateTileData: privateSentinel },
  });
  check(joined.response.status === 201, 'Joining by room code failed.');
  check(!JSON.stringify(joined.value).includes(privateSentinel), 'Private request data was echoed by room join.');
  privateValues.push(joined.value.participantToken);
  return { token: joined.value.participantToken, seat: joined.value.playerSeat };
}

function currentRevision(client) {
  const state = client.messages.filter(message => message.type === 'room-state').at(-1);
  return state?.revision ?? -1;
}

async function sendAction(client, payload, prefix = 'ci') {
  for (let attempt = 0; attempt < 2; attempt++) {
    await syncState(client);
    const requestId = nextRequestId(prefix);
    const before = client.messages.length;
    const beforeRevision = currentRevision(client);
    const expectedRevision = payload.expectedRevision ?? beforeRevision;
    client.socket.send(JSON.stringify({ ...payload, requestId, expectedRevision }));
    const result = await waitForMessage(client, message => message.type === 'action-result' && message.requestId === requestId,
      before, 10000, `action-result for ${payload.type}`);
    if (result.code === 'revision_conflict' && payload.expectedRevision === undefined && attempt === 0) continue;
    if (result.ok && result.revision > beforeRevision) {
      await waitForRoomState(client, state => state.revision >= result.revision, before, 10000, `room-state after ${payload.type}`);
    }
    return { result, requestId, expectedRevision };
  }
  throw new Error('The room action did not complete after a revision refresh.');
}

async function syncState(client) {
  check(client.socket.readyState === WebSocket.OPEN, 'A WebSocket client needed for state sync is closed.');
  const before = client.messages.length;
  client.socket.send(JSON.stringify({ type: 'request-state' }));
  await waitForRoomState(client, () => true, before, 10000, 'request-state snapshot');
}

async function ready(client, shouldBeReady = true) {
  const sent = await sendAction(client, { type: 'set-ready', ready: shouldBeReady }, 'ready');
  check(sent.result.ok === true, `A connected human could not change their own Ready state (${sent.result.code ?? 'unknown'}).`);
  return sent;
}

async function closeRoom(room, hostClient) {
  if (!hostClient || hostClient.socket.readyState !== WebSocket.OPEN) return;
  const state = hostClient.messages.filter(message => message.type === 'room-state').at(-1);
  const host = state?.seats?.find(seat => seat.isHost);
  if (!host || state.status === 'closed') return;
  const result = await sendAction(hostClient, { type: 'close-room' }, 'cleanup');
  check(result.result.ok === true, 'Normal room-close cleanup failed.');
}

function inspectPublicState(client, privateValues, expectedRoomCode) {
  const state = client.messages.filter(message => message.type === 'room-state').at(-1);
  check(state?.roomCode === expectedRoomCode, 'A complete room state was not received.');
  check(state.seats.length === 4 && state.seats.map(seat => seat.seat).join(',') === '0,1,2,3', 'The room state did not contain four ordered seats.');
  const serialized = JSON.stringify(state);
  check(!privateValues.some(value => serialized.includes(value)), 'A secret value appeared in public room state.');
  check(!serialized.includes('physicalTileId') && !serialized.includes(privateSentinel), 'Private game data appeared in public room state.');
  return state;
}

async function createAndConnectTwo(label) {
  const room = await createRoom(label);
  const guest = await joinRoom(room, testName(label, 'B'));
  room.guestToken = guest.token;
  room.host = await connectParticipant(room.roomCode, room.hostToken, 'host');
  room.guest = await connectParticipant(room.roomCode, room.guestToken, 'guest');
  room.sockets.push(room.host, room.guest);
  return room;
}

async function main() {
  let api;
  try { api = new URL(apiUrl); } catch { throw new Error('The deployed Worker URL is missing or invalid.'); }
  const isLocalTest = ['localhost', '127.0.0.1'].includes(api.hostname) && pageOrigin === 'http://localhost:5173';
  check(api.protocol === 'https:' || (api.protocol === 'http:' && isLocalTest), 'The deployed Worker URL must use HTTPS.');
  const health = await request('/health');
  check(health.response.status === 200 && health.value.ok === true, 'HTTPS health check failed.');
  check(health.response.headers.get('access-control-allow-origin') === pageOrigin, 'GitHub Pages Origin was not allowed.');
  const blocked = await request('/health', { origin: 'https://not-the-pages-origin.example' });
  check(blocked.response.status === 403, 'An unapproved Origin was accepted.');

  const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
  const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
  const label = `CI-${runId.slice(-10)}-${attempt}`;
  const roomSummaries = [];
  let activeHostForCleanup = null;
  try {
    // Scenario 1: two people, CPU seats, Ready and one-time finalization.
    const two = await createAndConnectTwo(`${label}-two`);
    activeHostForCleanup = two.host;
    const hostInitial = inspectPublicState(two.host, [two.hostToken, two.guestToken], two.roomCode);
    check(hostInitial.status === 'waiting' && hostInitial.seats.filter(seat => seat.kind === 'cpu').length === 0, 'CPU seats appeared before finalization.');
    const nonHost = await sendAction(two.guest, { type: 'finalize-seats' }, 'nonhost');
    check(nonHost.result.ok === false && nonHost.result.code === 'not_host', 'A non-host finalized the seats.');
    const stale = await sendAction(two.guest, {
      type: 'set-ready', ready: true, expectedRevision: Math.max(0, currentRevision(two.guest) - 1),
    }, 'stale');
    check(stale.result.ok === false && stale.result.code === 'revision_conflict', 'A stale revision was accepted.');
    const guestReady = await ready(two.guest);
    await ready(two.host);
    const finalizeRequestId = nextRequestId('finalize');
    await syncState(two.host);
    const beforeFinalize = two.host.messages.length;
    const finalizeRevision = currentRevision(two.host);
    two.host.socket.send(JSON.stringify({ type: 'finalize-seats', requestId: finalizeRequestId, expectedRevision: finalizeRevision }));
    const finalizedResult = await waitForMessage(two.host,
      message => message.type === 'action-result' && message.requestId === finalizeRequestId,
      beforeFinalize, 10000, 'finalize-seats action-result');
    check(finalizedResult.ok === true, 'The host could not finalize ready players.');
    const hostFinal = await waitForRoomState(two.host, state => state.status === 'finalized' && state.revision > finalizeRevision, beforeFinalize);
    await waitForRoomState(two.guest, state => state.status === 'finalized');
    check(hostFinal.seats.filter(seat => seat.kind === 'human').length === 2, 'Human seats were replaced during finalization.');
    check(hostFinal.seats.filter(seat => seat.kind === 'cpu').length === 2, 'Two empty seats were not filled with CPUs.');
    check(hostFinal.seats.every((seat, index) => seat.seat === index), 'Seat identifiers were duplicated or reordered.');
    check(new Set(hostFinal.seats.filter(seat => seat.kind === 'cpu').map(seat => seat.name)).size === 2, 'CPU names were not unique by seat.');
    const revisionAfterFinalize = currentRevision(two.host);
    const beforeDuplicate = two.host.messages.length;
    two.host.socket.send(JSON.stringify({ type: 'finalize-seats', requestId: finalizeRequestId, expectedRevision: finalizeRevision }));
    const replay = await waitForMessage(two.host,
      message => message.type === 'action-result' && message.requestId === finalizeRequestId,
      beforeDuplicate, 10000, 'duplicate finalize-seats action-result');
    check(replay.ok === true && currentRevision(two.host) === revisionAfterFinalize, 'A duplicate request changed the room twice.');
    const tooLateJoin = await joinRoomStatus(two.roomCode, testName(label, 'late'));
    check(tooLateJoin === 409, 'A new participant joined after seat finalization.');
    inspectPublicState(two.host, [two.hostToken, two.guestToken, privateSentinel], two.roomCode);
    check(!two.host.privacyLeak && !two.guest.privacyLeak, 'A WebSocket update included a secret.');

    // Scenario 1 continues through the authoritative game protocol. Both browser
    // connections receive only their own concealed tiles.
    const nonHostStart = await sendGameAction(two.guest, { type: 'start-game' }, 0, 'nonhost-game-start');
    check(nonHostStart.result.ok === false && nonHostStart.result.code === 'not_host', 'A non-host started the game.');
    const gameStarted = await sendGameAction(two.host, { type: 'start-game', requestId: nextRequestId('game-start') }, 0, 'game-start');
    check(gameStarted.result.ok === true && gameStarted.result.gameRevision === 1, 'The host could not start the server-owned game.');
    const [hostStarted, guestStarted] = await Promise.all([two.host, two.guest].map((client, participantSeat) => waitForGameState(client, view =>
      view?.roomCode === two.roomCode && Number(view.gameRevision) >= Number(gameStarted.result.gameRevision),
    0, 15000, `game-started view for participant seat ${participantSeat}`)));
    const hostGameSeat = hostStarted.view.viewerSeat;
    const guestGameSeat = guestStarted.view.viewerSeat;
    check(Number.isInteger(hostGameSeat) && Number.isInteger(guestGameSeat) && hostGameSeat !== guestGameSeat,
      'Participants did not receive distinct randomized game seats.');
    const hostView = inspectGameView(two.host, hostGameSeat, privateValues, two.roomCode, hostStarted);
    const guestView = inspectGameView(two.guest, guestGameSeat, privateValues, two.roomCode, guestStarted);
    check(hostView.self.isHost && !guestView.self.isHost, 'Host authority did not stay with the original participant after seating.');
    check(hostView.seats.map(seat => seat.name).join('\0') === guestView.seats.map(seat => seat.name).join('\0'),
      'Participants received different game-seat assignments.');
    check(hostView.seats[hostGameSeat].control === 'human' && guestView.seats[guestGameSeat].control === 'human' &&
      hostView.seats[hostGameSeat].name === hostFinal.seats[0].name &&
      guestView.seats[guestGameSeat].name === hostFinal.seats[1].name,
    'The randomized game seats did not preserve each participant identity.');
    const hostPrivateIds = new Set([
      ...hostView.seats[hostGameSeat].hand.map(tile => tile.id),
      hostView.seats[hostGameSeat].drawnTile?.id,
    ].filter(Boolean));
    const guestPrivateIds = new Set([
      ...guestView.seats[guestGameSeat].hand.map(tile => tile.id),
      guestView.seats[guestGameSeat].drawnTile?.id,
    ].filter(Boolean));
    for (const [view, gameSeat, participant] of [[hostView, hostGameSeat, 'host'], [guestView, guestGameSeat, 'guest']]) {
      check(view.seats[gameSeat].hand.length === 13 && Boolean(view.seats[gameSeat].drawnTile) === (gameSeat === 0),
        `The ${participant} did not receive the correct private opening hand for randomized seat ${gameSeat}.`);
    }
    check([...guestPrivateIds].every(id => !JSON.stringify(hostStarted).includes(id)), 'The host received the guest concealed hand.');
    check([...hostPrivateIds].every(id => !JSON.stringify(guestStarted).includes(id)), 'The guest received the host concealed hand.');
    const revisionAfterStart = Number(gameStarted.result.gameRevision);
    const duplicateStart = await sendGameAction(two.host,
      { type: 'start-game', requestId: gameStarted.requestId }, 0, 'unused');
    check(duplicateStart.result.ok && Number(duplicateStart.result.gameRevision) === revisionAfterStart &&
      Number(latestGameMessage(two.host).view.gameRevision) >= revisionAfterStart,
      'A duplicate start operation dealt another wall.');
    const secondStart = await sendGameAction(two.host, { type: 'start-game' }, 0, 'second-start');
    check(secondStart.result.ok === false && secondStart.result.code === 'already_started', 'A second start operation was accepted.');

    const humanTurn = await waitForHumanTurn([two.host, two.guest], revisionAfterStart);
    if (humanTurn.status === 'playing') {
      check(humanTurn.phase === 'awaiting-discard', 'The active human turn did not allow a discard.');
      const [hostAtHumanTurn, guestAtHumanTurn] = await Promise.all([two.host, two.guest].map((client, participantSeat) => waitForGameState(client,
        view => view?.roomCode === two.roomCode && Number(view.gameRevision) >= Number(humanTurn.gameRevision),
      0, 15000, `human-turn state for participant seat ${participantSeat}`)));
      const activeHuman = humanTurn.viewerSeat === hostGameSeat ? two.host
        : humanTurn.viewerSeat === guestGameSeat ? two.guest : null;
      check(activeHuman !== null, 'The active human turn did not map to either connected participant.');
      const otherHuman = activeHuman === two.host ? two.guest : two.host;
      const otherHumanGameSeat = activeHuman === two.host ? guestGameSeat : hostGameSeat;
      const otherHumanView = activeHuman === two.host ? guestAtHumanTurn.view : hostAtHumanTurn.view;
      const otherHumanTile = otherHumanView.seats[otherHumanGameSeat].hand[0].id;
      const outOfTurn = await sendGameAction(otherHuman, { type: 'discard', tileId: otherHumanTile }, humanTurn.gameRevision, 'out-of-turn');
      check(outOfTurn.result.ok === false && outOfTurn.result.code === 'not_your_turn', 'An out-of-turn discard was accepted.');
      const stealTile = await sendGameAction(activeHuman, { type: 'discard', tileId: otherHumanTile }, humanTurn.gameRevision, 'other-hand');
      check(stealTile.result.ok === false && stealTile.result.code === 'invalid_action', 'A player discarded a tile owned by another seat.');

      const activeTileId = humanTurn.self.discardableTileIds[0];
      check(typeof activeTileId === 'string', 'The active human did not receive a legal discard candidate.');
      const cpuBaselineView = hostAtHumanTurn.view;
      const cpuRiversBefore = Object.fromEntries(cpuBaselineView.seats.map(seat => [seat.seat, seat.river.length]));
      const humanDiscard = await sendGameAction(activeHuman, { type: 'discard', tileId: activeTileId }, humanTurn.gameRevision, 'human-discard');
      check(humanDiscard.result.ok === true, 'A legal human discard was rejected.');
      const cpuUpdate = await waitForCpuProgress([two.host, two.guest], humanTurn.gameRevision, cpuRiversBefore);
      check(cpuUpdate.status !== 'playing' || cpuUpdate.seats.some(seat => seat.control === 'cpu' && seat.river.length > cpuRiversBefore[seat.seat]),
        'CPU auto progress was not visible to either client.');
    } else {
      check(humanTurn.status === 'round-ended' && Boolean(humanTurn.result),
        'The game ended before a human turn without a public round result.');
    }

    const guestBeforeReconnect = latestGameMessage(two.guest).view;
    const guestHandBeforeReconnect = guestBeforeReconnect.seats[guestGameSeat].hand.map(tile => tile.id).sort();
    const disconnectAt = two.host.messages.length;
    const disconnected = waitForRoomState(two.host,
      state => state.seats.some(seat => seat.seat === 1 && !seat.connected), disconnectAt);
    two.guest.socket.close(1000, 'online game reconnect test');
    await disconnected;
    const gameReconnect = await connectParticipant(two.roomCode, two.guestToken, 'guest-reconnected');
    two.sockets.push(gameReconnect);
    two.guest = gameReconnect;
    const resumedGame = await waitForGameState(gameReconnect, view => view.viewerSeat === guestGameSeat && view.status !== 'aborted');
    check(resumedGame.view.seats[guestGameSeat].hand.map(tile => tile.id).sort().join(',') === guestHandBeforeReconnect.join(','),
      'Reconnection did not restore the same private hand.');
    inspectGameView(gameReconnect, guestGameSeat, privateValues, two.roomCode);
    check(!two.host.privacyLeak && !two.guest.privacyLeak && !gameReconnect.privacyLeak, 'A game WebSocket update included a secret.');

    const beforeGuestGameExit = two.guest.messages.length;
    const leaveGame = await sendAction(two.host, { type: 'leave-room' }, 'game-host-leave');
    check(leaveGame.result.ok, 'A participant could not explicitly leave an active online game.');
    const takeoverNotice = await waitForMessage(two.guest,
      message => message.type === 'seat-taken-over' && message.seat === 0,
      beforeGuestGameExit, 10000, 'seat takeover notification');
    check(takeoverNotice.cpuName === 'CPU1' && takeoverNotice.hostChanged === true,
      'The exiting host seat was not announced as a CPU takeover with host transfer.');
    activeHostForCleanup = two.guest;
    const roomAfterHandoff = await waitForRoomState(two.guest,
      state => state.status === 'finalized' && state.hostSeat === 1 && state.seats[0].kind === 'cpu');
    check(roomAfterHandoff.seats[0].name === 'CPU1', 'The replacement seat did not use the CPU1 display name.');
    check(roomAfterHandoff.seats[1].isHost, 'Room host control was not transferred after explicit game exit.');
    const resumedAfterExit = await waitForGameState(two.guest, view =>
      (view.status === 'playing' || view.status === 'round-ended') &&
      view.seats[hostGameSeat].control === 'cpu' && view.self.isHost === true &&
      Number(view.gameRevision) > revisionAfterStart, 0, 15000, 'CPU takeover game state');
    check(!('hand' in resumedAfterExit.view.seats[hostGameSeat]) && !('drawnTile' in resumedAfterExit.view.seats[hostGameSeat]),
      'The CPU takeover exposed the departed seat concealed hand.');
    check(resumedAfterExit.view.seats[hostGameSeat].name === 'CPU1', 'The online game view did not use the CPU1 display name.');
    const departedGameToken = await request(`/api/rooms/${two.roomCode}/ticket`, { method: 'POST', token: two.hostToken });
    check(departedGameToken.response.status === 401, 'An exited host token was accepted after CPU takeover.');
    const finalLeave = await sendAction(two.guest, { type: 'leave-room' }, 'game-final-human-leave');
    check(finalLeave.result.ok === true, 'The final human could not close the CPU-only room.');
    await waitForRoomState(two.guest, state => state.status === 'closed');
    roomSummaries.push({ scenario: 'two-human-game-host-cpu-handoff-reconnect', roomCode: two.roomCode, revision: currentRevision(two.guest) });
    activeHostForCleanup = null;

    // Scenario 2: disconnection clears Ready; the same token receives a complete state on reconnect.
    const reconnect = await createAndConnectTwo(`${label}-reconnect`);
    activeHostForCleanup = reconnect.host;
    await ready(reconnect.host);
    await ready(reconnect.guest);
    const disconnectIndex = reconnect.host.messages.length;
    const guestDisconnected = waitForRoomState(reconnect.host,
      state => state.seats.some(seat => seat.seat === 1 && !seat.connected && !seat.ready), disconnectIndex);
    reconnect.guest.socket.close(1000, 'production reconnect check');
    await guestDisconnected;
    const reconnecting = await connectParticipant(reconnect.roomCode, reconnect.guestToken);
    reconnect.sockets.push(reconnecting);
    const resumed = inspectPublicState(reconnecting, [reconnect.hostToken, reconnect.guestToken, privateSentinel], reconnect.roomCode);
    check(resumed.seats[1].connected && !resumed.seats[1].ready, 'Reconnection did not restore the seat while clearing Ready.');
    const readyAgain = await ready(reconnecting);
    check(readyAgain.result.ok && currentRevision(reconnecting) >= resumed.revision, 'Ready could not be set after reconnect.');
    await closeRoom(reconnect, reconnect.host);
    roomSummaries.push({ scenario: 'disconnect-reconnect', roomCode: reconnect.roomCode, revision: currentRevision(reconnecting) });
    activeHostForCleanup = null;

    // Scenario 3: host exit transfers the role to the lowest remaining human seat.
    const handoff = await createAndConnectTwo(`${label}-handoff`);
    activeHostForCleanup = handoff.host;
    const handoffResult = await sendAction(handoff.host, { type: 'leave-room' }, 'host-leave');
    check(handoffResult.result.ok === true, 'Explicit host exit failed.');
    activeHostForCleanup = handoff.guest;
    const successorState = await waitForRoomState(handoff.guest, state => state.status === 'waiting' && state.hostSeat === 1);
    check(successorState.seats[1].isHost && !successorState.seats[0].isHost, 'Host authority was not transferred to the remaining player.');
    const departedToken = await request(`/api/rooms/${handoff.roomCode}/ticket`, { method: 'POST', token: handoff.hostToken });
    check(departedToken.response.status === 401, 'An exited participant token was accepted.');
    await ready(handoff.guest);
    const soloFinalize = await sendAction(handoff.guest, { type: 'finalize-seats' }, 'new-host-finalize');
    check(soloFinalize.result.ok === true, 'The successor host could not finalize the room.');
    const oneHuman = await waitForRoomState(handoff.guest, state => state.status === 'finalized');
    check(oneHuman.seats.filter(seat => seat.kind === 'human').length === 1 && oneHuman.seats.filter(seat => seat.kind === 'cpu').length === 3,
      'A one-person room did not receive three CPU seats.');
    check(oneHuman.seats[1].isHost, 'The successor host identity was lost at finalization.');
    await closeRoom(handoff, handoff.guest);
    roomSummaries.push({ scenario: 'host-handoff-one-human-three-cpu', roomCode: handoff.roomCode, revision: oneHuman.revision });
    activeHostForCleanup = null;

    // Scenario 4: concurrent joins get distinct seats and four humans require no CPUs.
    const concurrent = await createRoom(`${label}-concurrent`);
    activeHostForCleanup = await connectParticipant(concurrent.roomCode, concurrent.hostToken);
    concurrent.host = activeHostForCleanup;
    concurrent.sockets.push(concurrent.host);
    const parallelJoins = await Promise.all([
      joinRoom(concurrent, testName(label, 'C1')),
      joinRoom(concurrent, testName(label, 'C2')),
      joinRoom(concurrent, testName(label, 'C3')),
    ]);
    check(new Set(parallelJoins.map(join => join.seat)).size === 3 && parallelJoins.every(join => [1, 2, 3].includes(join.seat)),
      'Concurrent joins received duplicate seats.');
    const connectedGuests = await Promise.all(parallelJoins.map(join => connectParticipant(concurrent.roomCode, join.token)));
    concurrent.sockets.push(...connectedGuests);

    const invalidToken = '0'.repeat(64);
    privateValues.push(invalidToken);
    const badTokenResponse = await request(`/api/rooms/${concurrent.roomCode}/ticket`, { method: 'POST', token: invalidToken });
    check(badTokenResponse.response.status === 401, 'An invalid participant token was accepted.');
    const nonHostClose = await sendAction(connectedGuests[0], { type: 'close-room' }, 'nonhost-close');
    check(nonHostClose.result.ok === false && nonHostClose.result.code === 'not_host', 'A non-host closed the room.');
    const staleRevision = await sendAction(connectedGuests[1], {
      type: 'set-ready', ready: true, expectedRevision: Math.max(0, currentRevision(connectedGuests[1]) - 1),
    }, 'revision-conflict');
    check(staleRevision.result.ok === false && staleRevision.result.code === 'revision_conflict', 'A stale revision was accepted.');

    const badJsonStart = connectedGuests[0].messages.length;
    connectedGuests[0].socket.send('{');
    const badJson = await waitForMessage(connectedGuests[0], message => message.type === 'error' && message.code === 'invalid_json',
      badJsonStart, 10000, 'invalid-json error');
    check(badJson.type === 'error', 'Malformed JSON was not rejected.');
    const oversizedSocket = concurrent.host.socket;
    const oversizedClosed = new Promise(resolve => oversizedSocket.once('close', resolve));
    oversizedSocket.send('x'.repeat(4097));
    await oversizedClosed;
    const replacementHost = await connectParticipant(concurrent.roomCode, concurrent.hostToken);
    concurrent.sockets.push(replacementHost);
    concurrent.host = replacementHost;
    activeHostForCleanup = replacementHost;

    for (const client of [concurrent.host, ...connectedGuests]) await ready(client);
    const fourReady = await sendAction(concurrent.host, { type: 'finalize-seats' }, 'four-player-finalize');
    check(fourReady.result.ok, 'Four connected, ready players could not finalize.');
    const fourHumanState = await waitForRoomState(concurrent.host, state => state.status === 'finalized');
    check(fourHumanState.seats.filter(seat => seat.kind === 'human').length === 4 &&
      fourHumanState.seats.filter(seat => seat.kind === 'cpu').length === 0, 'A four-human room received an unexpected CPU.');
    await closeRoom(concurrent, concurrent.host);
    roomSummaries.push({ scenario: 'four-humans-zero-cpu', roomCode: concurrent.roomCode, revision: fourHumanState.revision });
    activeHostForCleanup = null;

    // Scenario 5: three humans receive one deterministic CPU seat.
    const three = await createRoom(`${label}-three`);
    activeHostForCleanup = await connectParticipant(three.roomCode, three.hostToken);
    three.host = activeHostForCleanup;
    three.sockets.push(three.host);
    const threeJoiners = await Promise.all([joinRoom(three, testName(label, 'T1')), joinRoom(three, testName(label, 'T2'))]);
    const threeGuests = await Promise.all(threeJoiners.map(join => connectParticipant(three.roomCode, join.token)));
    three.sockets.push(...threeGuests);
    for (const client of [three.host, ...threeGuests]) await ready(client);
    const threeFinalize = await sendAction(three.host, { type: 'finalize-seats' }, 'three-player-finalize');
    check(threeFinalize.result.ok, 'Three connected, ready players could not finalize.');
    const threeState = await waitForRoomState(three.host, state => state.status === 'finalized');
    const cpuSeats = threeState.seats.filter(seat => seat.kind === 'cpu');
    check(threeState.seats.filter(seat => seat.kind === 'human').length === 3 && cpuSeats.length === 1 && cpuSeats[0].seat === 3,
      'A three-human room did not receive one CPU in the empty north seat.');
    await closeRoom(three, three.host);
    roomSummaries.push({ scenario: 'three-humans-one-cpu', roomCode: three.roomCode, revision: threeState.revision });
    activeHostForCleanup = null;

    check(![reconnect, handoff, concurrent, three].some(room => room.sockets.some(client => client.privacyLeak)),
      'A WebSocket update included a secret.');
  } finally {
    if (activeHostForCleanup) {
      const room = roomsForCleanup.find(candidate => candidate.host === activeHostForCleanup || candidate.sockets.includes(activeHostForCleanup));
      if (room) {
        try { await closeRoom(room, activeHostForCleanup); } catch { /* The CI room still expires automatically. */ }
      }
    }
    for (const room of roomsForCleanup) {
      for (const client of room.sockets) {
        try { client.socket.close(1000, 'production test complete'); } catch { /* Already closed. */ }
      }
    }
  }

  if (summaryPath) {
    appendFileSync(summaryPath,
      `\n## Cloudflare production communication test\n\n` +
      `- Worker URL: ${apiUrl}\n` +
      `- CI label prefix: ${label}\n` +
      `- Dedicated CI rooms: ${roomSummaries.map(room => `\`${room.roomCode}\` (${room.scenario})`).join(', ')}\n` +
      `- Test rooms were ended through the normal host close action.\n`);
  }
  console.log(`Production scenarios passed: ${roomSummaries.map(room => room.scenario).join(', ')}. No participant token or WebSocket ticket was written to logs.`);
}

async function joinRoomStatus(roomCode, name) {
  const result = await request(`/api/rooms/${roomCode}/join`, { method: 'POST', body: { displayName: name } });
  return result.response.status;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Production communication test failed.');
  process.exitCode = 1;
});
