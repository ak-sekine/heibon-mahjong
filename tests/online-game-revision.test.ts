import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameRevisionTracker } from '../src/online/game-revision-tracker.ts';

test('game revision tracking resets for new rooms but retains the same-room reconnect revision', () => {
  const tracker = new GameRevisionTracker();
  tracker.enterRoom('ROOM01');
  assert.equal(tracker.observe('ROOM01', 40), true);
  assert.equal(tracker.latest, 40);
  assert.equal(tracker.enterRoom('ROOM01'), undefined);
  assert.equal(tracker.latest, 40, 'a WebSocket reconnect in the same room must keep its revision baseline');
  assert.equal(tracker.observe('ROOM01', 39), false, 'a delayed game-state must not move the revision backwards');
  tracker.enterRoom('ROOM02');
  assert.equal(tracker.latest, -1, 'joining another room must discard the old room revision');
  assert.equal(tracker.observe('ROOM02', 2), true);
  assert.equal(tracker.latest, 2);
});

test('a new match establishes a fresh baseline and ignores delayed views from the previous match', () => {
  const tracker = new GameRevisionTracker();
  tracker.enterRoom('ROOM01');
  tracker.observe('ROOM01', 90);
  tracker.startMatch('ROOM01', 91);
  assert.equal(tracker.latest, 91);
  assert.equal(tracker.observe('ROOM01', 90), false);
  assert.equal(tracker.observe('ROOM01', 92), true);
  assert.equal(tracker.latest, 92);
  tracker.startMatch('ROOM01', 91);
  assert.equal(tracker.latest, 92, 'a delayed game-started event must not roll back the room-wide revision');
  assert.equal(tracker.observe('ROOM01', 91), false);
});

test('leaving and rejoining the same room starts without a previous session revision', () => {
  const tracker = new GameRevisionTracker();
  tracker.enterRoom('ROOM01');
  tracker.observe('ROOM01', 12);
  tracker.clear();
  tracker.enterRoom('ROOM01');
  assert.equal(tracker.latest, -1);
  assert.equal(tracker.observe('ROOM01', 1), true);
});
