import { appendFileSync } from 'node:fs';
import WebSocket from 'ws';

const apiUrl = (process.env.ONLINE_API_URL ?? '').replace(/\/+$/u, '');
const pageOrigin = process.env.ONLINE_TEST_ORIGIN ?? 'https://ak-sekine.github.io';
const protocolName = 'heibon-mahjong.v1';
const privateSentinel = 'PRIVATE_TILE_DATA_MUST_NOT_LEAK';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function check(condition, message) {
  if (!condition) throw new Error(message);
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

function waitForRoomState(client, predicate, afterIndex = 0, timeoutMs = 10000) {
  const existing = client.messages.slice(afterIndex).find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.waiters.delete(onMessage);
      reject(new Error('Timed out waiting for a public room state update.'));
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
    if (message.type !== 'room_state') return;
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

function writeSummary(roomCode, createdAt, expiresAt, label) {
  if (!summaryPath) return;
  appendFileSync(summaryPath,
    `\n## Cloudflare production communication test\n\n` +
    `- Worker URL: ${apiUrl}\n` +
    `- CI room label: ${label}\n` +
    `- Room code: ${roomCode}\n` +
    `- Created: ${new Date(createdAt).toISOString()}\n` +
    `- Expires: ${new Date(expiresAt).toISOString()} (automatic Durable Object cleanup)\n`);
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
  const created = await request('/api/rooms', {
    method: 'POST',
    body: { displayName: `${label}-A`, privateTileData: privateSentinel },
  });
  check(created.response.status === 201, 'Room creation failed.');
  const roomCode = created.value.roomCode;
  const hostToken = created.value.participantToken;
  const createdAt = created.value.createdAt;
  const expiresAt = created.value.expiresAt;
  check(/^[A-HJ-NP-Z2-9]{6}$/u.test(roomCode), 'Room code format was invalid.');
  check(Number.isSafeInteger(expiresAt) && expiresAt > Date.now() + 23 * 60 * 60 * 1000, 'The room did not receive a future expiry time.');
  check(typeof hostToken === 'string' && /^[a-f0-9]{64}$/u.test(hostToken), 'Room creation did not return a valid participant token.');
  check(created.value.playerSeat === 0, 'The creator was not assigned the first seat.');
  check(!JSON.stringify(created.value).includes(privateSentinel), 'Private request data was echoed by room creation.');
  writeSummary(roomCode, createdAt, expiresAt, label);
  console.log(`Created CI room ${roomCode} (${label}); automatic expiry ${new Date(expiresAt).toISOString()}.`);

  const joined = await request(`/api/rooms/${roomCode}/join`, {
    method: 'POST',
    body: { displayName: `${label}-B`, privateTileData: privateSentinel },
  });
  check(joined.response.status === 201, 'Joining by room code failed.');
  const guestToken = joined.value.participantToken;
  check(joined.value.playerSeat === 1, 'The joining client did not receive the second seat.');
  check(typeof guestToken === 'string' && /^[a-f0-9]{64}$/u.test(guestToken), 'Join did not return a valid participant token.');
  check(!JSON.stringify(joined.value).includes(privateSentinel), 'Private request data was echoed by room join.');

  const badAuth = await request(`/api/rooms/${roomCode}/ticket`, { method: 'POST', token: '0'.repeat(64) });
  check(badAuth.response.status === 401, 'An invalid participant token was accepted.');

  const publicState = await request(`/api/rooms/${roomCode}`);
  check(publicState.response.status === 200, 'Room state could not be read.');
  const publicStateText = JSON.stringify(publicState.value);
  check(publicState.value.seats.some(seat => seat.name === `${label}-A`), 'The CI room label was not visible in its public seat list.');
  check(!publicStateText.includes(hostToken) && !publicStateText.includes(guestToken), 'A participant token was sent in public room state.');
  check(!publicStateText.includes(privateSentinel), 'Private request data appeared in public room state.');

  const wsUrl = `${apiUrl.replace(/^https:/u, 'wss:')}/api/rooms/${roomCode}/socket`;
  async function issueTicket(token) {
    const result = await request(`/api/rooms/${roomCode}/ticket`, { method: 'POST', token });
    check(result.response.status === 200 && typeof result.value.ticket === 'string', 'WebSocket ticket could not be issued.');
    return result.value.ticket;
  }
  const host = connect(wsUrl, await issueTicket(hostToken), [hostToken, guestToken, privateSentinel]);
  await host.opened;
  const hostConnected = await waitForRoomState(host, state => state.seats.some(seat => seat.seat === 0 && seat.connected));
  check(hostConnected.roomCode === roomCode, 'The WebSocket room identity did not match.');

  const guest = connect(wsUrl, await issueTicket(guestToken), [hostToken, guestToken, privateSentinel]);
  await guest.opened;
  const bothConnected = state => state.seats.some(seat => seat.seat === 0 && seat.name === `${label}-A` && seat.connected) &&
    state.seats.some(seat => seat.seat === 1 && seat.name === `${label}-B` && seat.connected);
  const hostSeesBoth = waitForRoomState(host, bothConnected);
  const guestSeesBoth = waitForRoomState(guest, bothConnected);
  await Promise.all([hostSeesBoth, guestSeesBoth]);

  const disconnectIndex = host.messages.length;
  const guestDisconnected = waitForRoomState(host, state => state.seats.some(seat => seat.seat === 1 && !seat.connected), disconnectIndex);
  guest.socket.close(1000, 'production reconnect check');
  await guestDisconnected;

  const reconnectIndex = host.messages.length;
  const guestAgain = connect(wsUrl, await issueTicket(guestToken), [hostToken, guestToken, privateSentinel]);
  await guestAgain.opened;
  const hostSeesReconnect = waitForRoomState(host, bothConnected, reconnectIndex);
  const guestSeesReconnect = waitForRoomState(guestAgain, bothConnected);
  await Promise.all([hostSeesReconnect, guestSeesReconnect]);
  check(!host.privacyLeak && !guest.privacyLeak && !guestAgain.privacyLeak, 'A WebSocket update contained private information.');
  host.socket.close(1000, 'production test complete');
  guestAgain.socket.close(1000, 'production test complete');

  console.log('Production HTTPS, room create/join, WebSocket seat sync, disconnect/reconnect, auth rejection, privacy, and Origin checks passed.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Production communication test failed.');
  process.exitCode = 1;
});
