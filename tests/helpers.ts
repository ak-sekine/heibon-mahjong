import assert from 'node:assert/strict';
import type { GameState } from '../src/model/game.ts';
import { tileKindKey } from '../src/model/tile.ts';

export function seeded(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function freeze(value: object): void {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  Object.freeze(value);
}
export function allTiles(game: GameState) {
  return [...game.liveWall, ...game.deadWall, ...game.players.flatMap(p =>
    [...p.hand, ...p.river, ...(p.drawnTile ? [p.drawnTile] : [])])];
}
export function inventory(game: GameState, initial: GameState): void {
  const tiles = allTiles(game);
  const originals = new Map(allTiles(initial).map(tile => [tile.id, tile]));
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(t => t.id)).size, 136);
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(tileKindKey(tile.tile), (counts.get(tileKindKey(tile.tile)) ?? 0) + 1);
    assert.equal(tile, originals.get(tile.id));
  }
  assert.equal(counts.size, 34);
  assert.ok([...counts.values()].every(n => n === 4));
  assert.equal(tiles.filter(t => t.tile.isRed).length, 3);
  for (const suit of ['man', 'pin', 'sou']) {
    assert.equal(tiles.filter(t => t.tile.isRed && t.tile.category === 'suited' && t.tile.suit === suit).length, 1);
  }
  assert.equal(game.deadWall.length, 14);
  assert.deepEqual(game.deadWall, initial.deadWall);
  for (const p of game.players) {
    assert.equal(p.hand.length, 13);
    assert.equal(p.drawnTileSource === null, p.drawnTile === null);
    assert.equal(p.drawnTile !== null, (game.phase === 'awaiting-discard' || game.phase === 'won') && game.turnPlayerId === p.id);
  }
}

/** Freeze and compare every source, including intermediate states. */
export function transition(game: GameState, initial: GameState, update: (game: GameState) => GameState): GameState {
  const snapshot = structuredClone(game);
  freeze(game);
  const result = update(game);
  assert.notEqual(result, game);
  assert.deepEqual(game, snapshot);
  inventory(result, initial);
  return result;
}
