import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRedDora } from '../src/analysis/dora.ts';
import { ordinaryTile, redFive, SUITS, type Tile } from '../src/model/tile.ts';
import { freeze } from './helpers.ts';

for (const count of [0, 1, 2, 3]) test(`red dora: ${count} tiles give ${count} han`, () => {
  assert.equal(countRedDora(SUITS.slice(0, count).map(redFive)), count);
});
test('ordinary fives and honors are not red dora', () => {
  assert.equal(countRedDora([
    ...SUITS.map(suit => ordinaryTile({ category: 'suited', suit, rank: 5 })),
    ordinaryTile({ category: 'honor', honor: 'red' }),
  ]), 0);
});
test('red count is order independent and does not mutate frozen tiles or array', () => {
  const tiles = [redFive('man'), ordinaryTile({ category: 'suited', suit: 'sou', rank: 5 }), redFive('sou')];
  const snapshot = structuredClone(tiles); freeze(tiles);
  assert.equal(countRedDora(tiles), 2);
  assert.equal(countRedDora([...tiles].reverse()), 2);
  assert.deepEqual(tiles, snapshot);
});
for (const [name, tiles] of [
  ['red nonfive', [{ category: 'suited', suit: 'man', rank: 4, isRed: true }]],
  ['red honor', [{ category: 'honor', honor: 'red', isRed: true }]],
  ['unknown suit', [{ category: 'suited', suit: 'other', rank: 5, isRed: true }]],
  ['unknown rank', [{ category: 'suited', suit: 'man', rank: 10, isRed: false }]],
  ['unknown honor', [{ category: 'honor', honor: 'other', isRed: false }]],
  ['missing red flag', [{ category: 'suited', suit: 'man', rank: 5 }]],
  ['null tile', [null]],
  ['duplicate red suit', [redFive('man'), redFive('man')]],
  ['not an array', null],
] as const) test(`red dora rejects ${name}`, () => {
  assert.throws(() => countRedDora(tiles as unknown as readonly Tile[]), RangeError);
});
