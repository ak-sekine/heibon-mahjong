// Local-only two-Worker isolation probe; never touches a deployed room.
import assert from 'node:assert/strict';
const prod = process.env.PRODUCTION_API_URL, dev = process.env.DEVELOPMENT_API_URL;
for (const value of [prod, dev]) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert(['127.0.0.1', 'localhost'].includes(url.hostname));
}
assert.notEqual(prod, dev);
const origin = 'http://localhost:5173';
for (const [source, other] of [[prod, dev], [dev, prod]]) {
  const response = await fetch(source + '/api/rooms', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'CI-isolation-only' }) });
  assert.equal(response.status, 201);
  const room = await response.json();
  assert.match(room.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await fetch(source + '/api/rooms/' + room.roomCode, { headers: { Origin: origin } })).status, 200);
  // GET does not join or mutate an existing room in the other environment.
  assert.equal((await fetch(other + '/api/rooms/' + room.roomCode, { headers: { Origin: origin } })).status, 404);
  const wrongToken = await fetch(other + '/api/rooms/' + room.roomCode + '/ticket', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + room.participantToken } });
  assert([401, 404].includes(wrongToken.status));
}
console.log('Local Worker rooms and credentials are isolated; temporary stores expire with this runner.');
