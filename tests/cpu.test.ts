import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRandomDiscard } from '../src/game/cpu.ts';
import { startGame } from '../src/game/start.ts';
import { seeded } from './helpers.ts';

test('all fourteen physical IDs including the drawn tile are selectable without mutation', () => {
  const player = startGame(seeded(7), 1).players[1];
  const snapshot = structuredClone(player);
  const candidates = [...player.hand, player.drawnTile!];
  for (const [i, tile] of candidates.entries()) assert.equal(chooseRandomDiscard(player, () => i / 14), tile.id);
  const a = seeded(42), b = seeded(42);
  assert.deepEqual(Array.from({ length: 100 }, () => chooseRandomDiscard(player, a)), Array.from({ length: 100 }, () => chooseRandomDiscard(player, b)));
  for (let i = 0; i < 100; i++) {
    const selected = chooseRandomDiscard(player, a);
    assert.ok(candidates.some(t => t.id === selected));
  }
  assert.deepEqual(player, snapshot);
});

test('CPU strategy rejects invalid randomness and hands', () => {
  const player = startGame(undefined, 1).players[1];
  for (const value of [-1, 1, NaN, Infinity]) assert.throws(() => chooseRandomDiscard(player, () => value), RangeError);
  assert.throws(() => chooseRandomDiscard({ ...player, drawnTile: null }, () => 0), RangeError);
  assert.throws(() => chooseRandomDiscard({ ...player, hand: [] }, () => 0), RangeError);
});
