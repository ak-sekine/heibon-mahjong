import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/start.ts';
import { discardTile, discardFromPlayer } from '../src/game/discard.ts';
import { deal } from '../src/game/deal.ts';
import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { tileKindKey } from '../src/model/tile.ts';
import type { GameState } from '../src/model/game.ts';

function freeze(value: object): void {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  Object.freeze(value);
}
function inventory(game: GameState): void {
  const tiles = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(p =>
    [...p.hand, ...p.river, ...(p.drawnTile ? [p.drawnTile] : [])])];
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(t => t.id)).size, 136);
  const counts = new Map<string, number>();
  for (const t of tiles) counts.set(tileKindKey(t.tile), (counts.get(tileKindKey(t.tile)) ?? 0) + 1);
  assert.equal(counts.size, 34);
  assert.ok([...counts.values()].every(n => n === 4));
  assert.equal(game.liveWall.length, 69);
  assert.equal(game.deadWall.length, 14);
  assert.deepEqual(game.players.map(p => p.hand.length), [13, 13, 13, 13]);
  assert.deepEqual(game.players.map(p => p.river.length), [1, 0, 0, 0]);
  assert.ok(game.players.every(p => p.drawnTile === null));
  assert.equal(game.phase, 'stopped');
}

test('drawn and hand discards preserve inventory, identities and frozen source over 100 games', () => {
  for (let i = 0; i < 100; i++) {
    const game = startGame();
    assert.ok(game.players.every(p => p.river.length === 0));
    assert.equal(game.phase, 'awaiting-discard');
    assert.equal(game.turnPlayerId, 0);
    const snapshot = structuredClone(game);
    freeze(game);
    const player = game.players[0];
    for (const tile of [player.drawnTile!, ...player.hand]) {
      const result = discardTile(game, 0, tile.id);
      inventory(result);
      assert.equal(result.players[0].river[0], tile);
      assert.equal(result.players[0].drawnTile, null);
      if (tile === player.drawnTile) assert.equal(result.players[0].hand, player.hand);
      else {
        assert.ok(result.players[0].hand.includes(player.drawnTile!));
        assert.ok(!result.players[0].hand.includes(tile));
      }
      assert.deepEqual(game, snapshot);
      assert.throws(() => discardTile(result, 0, result.players[0].hand[0].id), RangeError);
    }
  }
});

test('red five and same-kind copies retain exact physical identity', () => {
  const wall = createWall();
  const red = wall.find(t => t.tile.isRed)!;
  // Put all four copies into the dealer hand without fabricating any tile.
  const copies = wall.filter(t => tileKindKey(t.tile) === tileKindKey(red.tile));
  const remaining = wall.filter(t => !copies.includes(t));
  const ordered = [...remaining];
  for (const [i, tile] of copies.entries()) ordered.splice(i * 4, 0, tile);
  const game = deal(reserveDeadWall(ordered));
  for (const tile of copies) {
    const result = discardTile(game, 0, tile.id);
    assert.equal(result.players[0].river[0], tile);
    assert.equal(result.players[0].river[0].tile.isRed, tile.tile.isRed);
    assert.ok(copies.filter(t => t !== tile).every(t => result.players[0].hand.includes(t)));
    inventory(result);
  }
});

test('invalid ownership, CPU, dealer, turn, phase and malformed hands are rejected without changes', () => {
  const game = startGame();
  const snapshot = structuredClone(game);
  const id = game.players[0].drawnTile!.id;
  assert.throws(() => discardTile(game, 0, 'missing'), RangeError);
  assert.throws(() => discardTile(game, 0, game.players[1].hand[0].id), RangeError);
  assert.throws(() => discardTile(game, 0, game.liveWall[0].id), RangeError);
  assert.throws(() => discardTile(game, 1, game.players[1].hand[0].id), RangeError);
  assert.throws(() => discardTile(game, 99 as 0, id), RangeError);
  assert.throws(() => discardTile({ ...game, dealerId: 1 }, 0, id), RangeError);
  assert.throws(() => discardTile({ ...game, turnPlayerId: 1 }, 0, id), RangeError);
  assert.throws(() => discardTile({ ...game, phase: 'stopped' }, 0, id), RangeError);
  const cpuDealer = startGame(undefined, 1);
  assert.throws(() => discardTile(cpuDealer, 1, cpuDealer.players[1].drawnTile!.id), RangeError);
  assert.throws(() => discardTile(cpuDealer, 0, cpuDealer.players[0].hand[0].id), RangeError);
  assert.throws(() => discardFromPlayer({ ...game.players[0], drawnTile: null }, id), RangeError);
  assert.deepEqual(game, snapshot);
});

test('common movement supports CPU state and appends in discard order without mutating river', () => {
  const game = startGame(undefined, 1);
  const player = game.players[1];
  const previous = game.liveWall[0];
  const source = { ...player, river: [previous] };
  const result = discardFromPlayer(source, player.drawnTile!.id);
  assert.deepEqual(result.river, [previous, player.drawnTile]);
  assert.deepEqual(source.river, [previous]);
});
