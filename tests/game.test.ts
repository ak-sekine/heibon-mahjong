import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUITS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId } from '../src/model/game.ts';
import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { deal } from '../src/game/deal.ts';
import { startGame } from '../src/game/start.ts';

function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function inventory(tiles: readonly PhysicalTile[]): void {
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(t => t.id)).size, 136);
  const counts = new Map<string, number>();
  for (const { tile } of tiles) {
    const key = tileKindKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 34);
  assert.ok([...counts.values()].every(count => count === 4));
  for (const suit of SUITS) {
    const fives = tiles.filter(({ tile }) => tile.category === 'suited' && tile.suit === suit && tile.rank === 5);
    assert.equal(fives.filter(t => t.tile.isRed).length, 1);
    assert.equal(fives.filter(t => !t.tile.isRed).length, 3);
  }
  assert.equal(tiles.filter(t => t.tile.isRed).length, 3);
}
function checkGame(game: GameState): void {
  assert.equal(game.liveWall.length, 69);
  assert.equal(game.deadWall.length, 14);
  assert.deepEqual(game.players.map(p => p.id), [0, 1, 2, 3]);
  for (const player of game.players) {
    assert.equal(player.hand.length, 13);
    assert.equal(player.drawnTile !== null, player.id === game.dealerId);
    assert.equal(player.hand.length + (player.drawnTile ? 1 : 0), player.id === game.dealerId ? 14 : 13);
  }
  inventory([...game.liveWall, ...game.deadWall, ...game.players.flatMap(p => [...p.hand, ...(p.drawnTile ? [p.drawnTile] : [])])]);
}

test('wall has 136 distinct physical tiles, four of each kind and one red five per suit', () => {
  inventory(createWall());
  assert.deepEqual(createWall(), createWall());
  assert.notEqual(createWall()[0], createWall()[0]);
});
test('shuffle conserves inventory and does not mutate its input', () => {
  const wall = createWall();
  const snapshot = [...wall];
  const result = shuffle(Object.freeze(wall), seeded(42));
  inventory(result);
  assert.deepEqual(wall, snapshot);
  assert.notEqual(result, wall);
  assert.notDeepEqual(result, wall);
  assert.deepEqual([...result].sort((a,b) => a.id.localeCompare(b.id)), [...wall].sort((a,b) => a.id.localeCompare(b.id)));
});
test('Fisher-Yates follows injected random sequence reproducibly', () => {
  assert.deepEqual(shuffle([0, 1, 2, 3], () => 0), [1, 2, 3, 0]);
  assert.deepEqual(shuffle(createWall(), seeded(7)), shuffle(createWall(), seeded(7)));
  assert.notDeepEqual(shuffle(createWall(), seeded(7)), shuffle(createWall(), seeded(8)));
  for (const invalid of [-1, 1, NaN, Infinity]) assert.throws(() => shuffle([1, 2], () => invalid), RangeError);
});
test('dead wall is reserved before dealing; dealer extra is separate after 13 rounds', () => {
  const tiles = createWall();
  const wall = reserveDeadWall(tiles);
  assert.equal(wall.liveWall.length, 122);
  assert.deepEqual(wall.deadWall, tiles.slice(122));
  const snapshot = structuredClone(wall);
  const game = deal(wall);
  checkGame(game);
  assert.deepEqual(game.players[0].hand, Array.from({ length: 13 }, (_, i) => tiles[i * 4]));
  assert.equal(game.players[0].drawnTile, tiles[52]);
  assert.deepEqual(game.liveWall, tiles.slice(53, 122));
  assert.deepEqual(wall, snapshot);
  assert.deepEqual(game.players.map(p => p.wind), ['east', 'south', 'west', 'north']);
  assert.deepEqual(game.players.map(p => p.control), ['human', 'cpu', 'cpu', 'cpu']);
});
test('repeated starts with different randomness preserve all invariants and previous game', () => {
  const previous = startGame(seeded(1));
  const snapshot = structuredClone(previous);
  for (let seed = 0; seed < 100; seed++) checkGame(startGame(seeded(seed)));
  assert.deepEqual(previous, snapshot);
  assert.deepEqual(startGame(seeded(10)), startGame(seeded(10)));
  assert.notDeepEqual(startGame(seeded(10)), startGame(seeded(11)));
});
test('dealer can be changed while human identity remains player zero', () => {
  for (const id of [0, 1, 2, 3] as PlayerId[]) {
    const game = startGame(seeded(1), id);
    checkGame(game);
    assert.equal(game.players[id].wind, 'east');
    assert.equal(game.players[0].control, 'human');
  }
});
test('invalid wall sizes are rejected', () => {
  assert.throws(() => reserveDeadWall([]), RangeError);
  assert.throws(() => deal({ liveWall: [], deadWall: [] }), RangeError);
});
