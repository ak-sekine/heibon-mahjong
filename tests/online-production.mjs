import { appendFileSync } from 'node:fs';
import WebSocket from 'ws';

const apiUrl = (process.env.ONLINE_API_URL ?? '').replace(/\/+$/u, '');
const pageOrigin = process.env.ONLINE_TEST_ORIGIN ?? 'https://ak-sekine.github.io';
const protocolName = 'heibon-mahjong.v1';
const privateSentinel = 'PRIVATE_TILE_DATA_MUST_NOT_LEAK';
const privateValues = [privateSentinel];
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
let requestNumber = 0;
const roomsForCleanup = [];

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

function waitForMessage(client, predicate, afterIndex = 0, timeoutMs = 10000) {
  const existing = client.messages.slice(afterIndex).find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.waiters.delete(onMessage);
      reject(new Error('Timed out waiting for a room protocol response.'));
    }, timeoutMs);
    const onMessage = message => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      client.waiters.delete(onMessage);
      resolve(message);
    };
    client.waiters.add(onMessage);
  });
}

function waitForRoomState(client, predicate, afterIndex = 0, timeoutMs = 10000) {
  return waitForMessage(client, message => message.type === 'room-state' && predicate(message), afterIndex, timeoutMs);
}

function waitForGameState(client, predicate, afterIndex = 0, timeoutMs = 15000) {
  return waitForMessage(client, message =>
    (message.type === 'game-state' || message.type === 'game-started') && predicate(message.view), afterIndex, timeoutMs);
}

function latestGameMessage(client) {
  return client.messages.filter(message => message.type === 'game-state' || message.type === 'game-started').at(-1);
}

async function sendGameAction(client, payload, expectedGameRevision, prefix = 'game-ci') {
  check(client.socket.readyState === WebSocket.OPEN, 'A WebSocket client needed for game action is closed.');
  const requestId = payload.requestId ?? nextRequestId(prefix);
  const before = client.messages.length;
  client.socket.send(JSON.stringify({ ...payload, requestId, expectedGameRevision }));
  const result = await waitForMessage(client,
    message => message.type === 'game-action-result' && message.requestId === requestId, before);
  if (result.ok) await waitForGameState(client,
    view => Number(view.gameRevision) >= Number(result.gameRevision), before);
  return { result, requestId, before };
}

async function passGameDecisions(clients) {
  for (let turn = 0; turn < 4; turn++) {
    let sent = false;
    for (const client of clients) {
      const view = latestGameMessage(client)?.view;
      const decision = view?.self?.decision;
      if (!decision || decision.answered) continue;
      sent = true;
      await sendGameAction(client, {
        type: decision.type === 'ron' ? 'pass-ron' : 'pass-call',
        windowId: decision.windowId,
      }, decision.expectedGameRevision, 'game-pass');
    }
    if (!sent) return;
  }
  throw new Error('Too many consecutive game decision windows.');
}

async function waitForHumanTurn(clients, afterRevision, timeoutMs = 20000) {
  const qualifies = view => Number(view?.gameRevision) > afterRevision && (
    view?.status !== 'playing' ||
    view?.phase === 'awaiting-discard' && view.viewerSeat === view.turnPlayerId &&
      view.seats?.[view.turnPlayerId]?.control === 'human'
  );
  const existing = clients.map(client => latestGameMessage(client)?.view).find(qualifies);
  if (existing) return existing;
  return Promise.race(clients.map(client => waitForGameState(client, qualifies, 0, timeoutMs).then(message => message.view)));
}

async function waitForCpuProgress(clients, afterRevision, previousRivers, timeoutMs = 15000) {
  const progressed = view => {
    if (!view || Number(view.gameRevision) <= afterRevision) return false;
    if (view.status !== 'playing') return true;
    return view.seats.some(seat => seat.control === 'cpu' && seat.river.length > (previousRivers[seat.seat] ?? 0));
  };
  for (let attempt = 0; attempt < 12; attempt++) {
    await passGameDecisions(clients);
    const current = clients.map(client => latestGameMessage(client)?.view).find(progressed);
    if (current) return current;
    const indexes = clients.map(client => client.messages.length);
    await Promise.race(clients.map((client, index) => waitForGameState(client,
      view => Number(view?.gameRevision) > afterRevision, indexes[index], timeoutMs)));
  }
  throw new Error('The server did not advance an automatic CPU action.');
}

function inspectGameView(client, expectedSeat, privateValues, expectedRoomCode) {
  const message = latestGameMessage(client);
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

function connect(url, ticket, privateValues) {
  const socket = new WebSocket(url, [protocolName, `ticket.${ticket}`], {
    headers: { Origin: pageOrigin },
    handshakeTimeout: 10000,
  });
  const client = { socket, messages: [], waiters: new Set(), privacyLeak: false };
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
  });
  const opened = new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', () => reject(new Error('WebSocket connection failed.')));
    socket.once('unexpected-response', (_request, response) => {
      reject(new Error(`WebSocket handshake was rejected with status ${response.statusCode}.`));
    });
  });
  socket.on('error', () => {});
  client.opened = opened;
  return client;
}

async function issueTicket(roomCode, token) {
  const result = await request(`/api/rooms/${roomCode}/ticket`, { method: 'POST', token });
  check(result.response.status === 200 && typeof result.value.ticket === 'string', 'WebSocket ticket could not be issued.');
  privateValues.push(result.value.ticket);
  return result.value.ticket;
}

async function connectParticipant(roomCode, token) {
  const wsUrl = `${apiUrl.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:')}/api/rooms/${roomCode}/socket`;
  const client = connect(wsUrl, await issueTicket(roomCode, token), privateValues);
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
  await syncState(client);
  const requestId = nextRequestId(prefix);
  const before = client.messages.length;
  const beforeRevision = currentRevision(client);
  const expectedRevision = payload.expectedRevision ?? currentRevision(client);
  client.socket.send(JSON.stringify({ ...payload, requestId, expectedRevision }));
  const result = await waitForMessage(client, message => message.type === 'action-result' && message.requestId === requestId, before);
  if (result.ok && result.revision > beforeRevision) {
    await waitForRoomState(client, state => state.revision >= result.revision, before);
  }
  return { result, requestId, expectedRevision };
}

async function syncState(client) {
  check(client.socket.readyState === WebSocket.OPEN, 'A WebSocket client needed for state sync is closed.');
  const before = client.messages.length;
  client.socket.send(JSON.stringify({ type: 'request-state' }));
  await waitForRoomState(client, () => true, before);
}

async function ready(client, shouldBeReady = true) {
  const sent = await sendAction(client, { type: 'set-ready', ready: shouldBeReady }, 'ready');
  check(sent.result.ok === true, 'A connected human could not change their own Ready state.');
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
  room.host = await connectParticipant(room.roomCode, room.hostToken);
  room.guest = await connectParticipant(room.roomCode, room.guestToken);
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
      message => message.type === 'action-result' && message.requestId === finalizeRequestId, beforeFinalize);
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
      message => message.type === 'action-result' && message.requestId === finalizeRequestId, beforeDuplicate);
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
    await Promise.all([two.host, two.guest].map((client, seat) => waitForGameState(client, view =>
      view?.roomCode === two.roomCode && view.viewerSeat === seat &&
      Number(view.gameRevision) >= Number(gameStarted.result.gameRevision), 0, 15000)));
    const hostView = inspectGameView(two.host, 0, privateValues, two.roomCode);
    const guestView = inspectGameView(two.guest, 1, privateValues, two.roomCode);
    const hostPrivateIds = new Set([
      ...hostView.seats[0].hand.map(tile => tile.id),
      hostView.seats[0].drawnTile?.id,
    ].filter(Boolean));
    const guestPrivateIds = new Set([
      ...guestView.seats[1].hand.map(tile => tile.id),
      guestView.seats[1].drawnTile?.id,
    ].filter(Boolean));
    check(hostView.seats[0].hand.length === 13 && hostView.seats[0].drawnTile, 'The host did not receive their own 14-tile opening hand.');
    check(guestView.seats[1].hand.length === 13 && guestView.seats[1].drawnTile === null, 'The guest did not receive their own 13-tile opening hand.');
    check([...guestPrivateIds].every(id => !JSON.stringify(latestGameMessage(two.host)).includes(id)), 'The host received the guest concealed hand.');
    check([...hostPrivateIds].every(id => !JSON.stringify(latestGameMessage(two.guest)).includes(id)), 'The guest received the host concealed hand.');
    const revisionAfterStart = Number(hostView.gameRevision);
    const duplicateStart = await sendGameAction(two.host,
      { type: 'start-game', requestId: gameStarted.requestId }, 0, 'unused');
    check(duplicateStart.result.ok && Number(latestGameMessage(two.host).view.gameRevision) === revisionAfterStart,
      'A duplicate start operation dealt another wall.');
    const secondStart = await sendGameAction(two.host, { type: 'start-game' }, 0, 'second-start');
    check(secondStart.result.ok === false && secondStart.result.code === 'already_started', 'A second start operation was accepted.');

    const guestFirstTile = guestView.self.discardableTileIds?.[0] ?? guestView.seats[1].hand[0].id;
    const outOfTurn = await sendGameAction(two.guest, { type: 'discard', tileId: guestFirstTile }, revisionAfterStart, 'out-of-turn');
    check(outOfTurn.result.ok === false && outOfTurn.result.code === 'not_your_turn', 'An out-of-turn discard was accepted.');
    const stealTile = await sendGameAction(two.host, { type: 'discard', tileId: guestFirstTile }, revisionAfterStart, 'other-hand');
    check(stealTile.result.ok === false && stealTile.result.code === 'invalid_action', 'A host discarded a tile owned by another seat.');

    const hostDiscardId = hostView.self.discardableTileIds[0];
    const hostDiscard = await sendGameAction(two.host, { type: 'discard', tileId: hostDiscardId,
      requestId: nextRequestId('game-discard') }, revisionAfterStart, 'host-discard');
    check(hostDiscard.result.ok === true, 'A legal host discard was rejected.');
    await passGameDecisions([two.host, two.guest]);
    const afterHostRevision = Math.max(Number(latestGameMessage(two.host).view.gameRevision), Number(latestGameMessage(two.guest).view.gameRevision));
    const humanTurn = await waitForHumanTurn([two.host, two.guest], afterHostRevision - 1);
    check(humanTurn.status === 'playing' && humanTurn.phase === 'awaiting-discard', 'A human turn did not resume after the discard window.');
    const activeHuman = humanTurn.viewerSeat === 0 ? two.host : two.guest;
    const activeTileId = humanTurn.self.discardableTileIds[0];
    check(typeof activeTileId === 'string', 'The active human did not receive a legal discard candidate.');
    const cpuBaselineView = latestGameMessage(two.host).view;
    const cpuRiversBefore = Object.fromEntries(cpuBaselineView.seats.map(seat => [seat.seat, seat.river.length]));
    const humanDiscard = await sendGameAction(activeHuman, { type: 'discard', tileId: activeTileId }, humanTurn.gameRevision, 'human-discard');
    check(humanDiscard.result.ok === true, 'A legal human discard was not accepted.');
    let cpuUpdate = null;
    let lastGameRevision = Math.max(Number(latestGameMessage(two.host).view.gameRevision), Number(latestGameMessage(two.guest).view.gameRevision));
    for (let step = 0; step < 20 && !cpuUpdate; step++) {
      await passGameDecisions([two.host, two.guest]);
      const current = latestGameMessage(two.host).view;
      if (current.gameRevision > humanTurn.gameRevision && current.status !== 'playing' ||
          current.status === 'playing' && current.seats.some(seat => seat.control === 'cpu' && seat.river.length > cpuRiversBefore[seat.seat])) {
        cpuUpdate = current;
        break;
      }
      if (current.status === 'playing' && current.phase === 'awaiting-discard' &&
          current.seats[current.turnPlayerId].control === 'human') {
        const client = current.turnPlayerId === 0 ? two.host : two.guest;
        const humanViewMessage = await waitForGameState(client, view =>
          Number(view?.gameRevision) >= Number(current.gameRevision) &&
          view?.viewerSeat === current.turnPlayerId && view.phase === 'awaiting-discard' &&
          view.seats?.[view.turnPlayerId]?.control === 'human' &&
          Array.isArray(view.self?.discardableTileIds) && view.self.discardableTileIds.length > 0, 0, 15000);
        const legalId = humanViewMessage.view.self.discardableTileIds[0];
        check(typeof legalId === 'string', 'A later human turn did not receive a legal discard candidate.');
        const result = await sendGameAction(client, { type: 'discard', tileId: legalId }, humanViewMessage.view.gameRevision, 'next-human-discard');
        check(result.result.ok === true, 'A later legal human discard was rejected.');
        continue;
      }
      const indexes = [two.host.messages.length, two.guest.messages.length];
      await Promise.race([two.host, two.guest].map((client, index) => waitForGameState(client,
        view => Number(view.gameRevision) > lastGameRevision, indexes[index], 15000)));
      lastGameRevision = Math.max(Number(latestGameMessage(two.host).view.gameRevision), Number(latestGameMessage(two.guest).view.gameRevision));
    }
    check(cpuUpdate !== null, 'The server did not advance an automatic CPU action.');
    check(cpuUpdate.status !== 'playing' || cpuUpdate.seats.some(seat => seat.control === 'cpu' && seat.river.length > cpuRiversBefore[seat.seat]),
      'CPU auto progress was not visible to either client.');

    const guestBeforeReconnect = latestGameMessage(two.guest).view;
    const guestHandBeforeReconnect = guestBeforeReconnect.seats[1].hand.map(tile => tile.id).sort();
    const disconnectAt = two.host.messages.length;
    const disconnected = waitForRoomState(two.host,
      state => state.seats.some(seat => seat.seat === 1 && !seat.connected), disconnectAt);
    two.guest.socket.close(1000, 'online game reconnect test');
    await disconnected;
    const gameReconnect = await connectParticipant(two.roomCode, two.guestToken);
    two.sockets.push(gameReconnect);
    two.guest = gameReconnect;
    const resumedGame = await waitForGameState(gameReconnect, view => view.viewerSeat === 1 && view.status !== 'aborted');
    check(resumedGame.view.seats[1].hand.map(tile => tile.id).sort().join(',') === guestHandBeforeReconnect.join(','),
      'Reconnection did not restore the same private hand.');
    inspectGameView(gameReconnect, 1, privateValues, two.roomCode);
    check(!two.host.privacyLeak && !two.guest.privacyLeak && !gameReconnect.privacyLeak, 'A game WebSocket update included a secret.');

    const beforeGameExit = two.host.messages.length;
    const leaveGame = await sendAction(two.host, { type: 'leave-room' }, 'game-host-leave');
    check(leaveGame.result.ok, 'A participant could not explicitly leave an active online game.');
    const abortedMessage = await waitForMessage(two.guest,
      message => message.type === 'game-aborted' || message.type === 'game-state' && message.view?.status === 'aborted', beforeGameExit);
    check(abortedMessage.type === 'game-aborted' || abortedMessage.view.status === 'aborted', 'The remaining player did not receive an abort reason.');
    activeHostForCleanup = two.guest;
    const roomAfterAbort = await waitForRoomState(two.guest, state => state.status === 'finalized' && state.hostSeat === 1);
    check(roomAfterAbort.seats[1].isHost, 'Room host control was not transferred after explicit game exit.');
    await closeRoom(two, two.guest);
    roomSummaries.push({ scenario: 'two-human-two-cpu-game-start-discard-cpu-reconnect-abort', roomCode: two.roomCode, revision: currentRevision(two.guest) });
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
    const badJson = await waitForMessage(connectedGuests[0], message => message.type === 'error' && message.code === 'invalid_json', badJsonStart);
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
