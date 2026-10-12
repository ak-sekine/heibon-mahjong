import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_KINDS, ordinaryTile, redFive, tileKindKey } from '../src/model/tile.ts';
import type { Tile } from '../src/model/tile.ts';
import { analyzeWinningShapes, isWinningShape } from '../src/analysis/winning-shape.ts';

// Compact fixtures: m/p/s = suits, z = honors in the model's canonical order.
function hand(...groups: string[]): Tile[] {
  return groups.flatMap(group => {
    const base = { m: 0, p: 9, s: 18, z: 27 }[group.at(-1)!]!;
    return [...group.slice(0, -1)].map(rank => ordinaryTile(TILE_KINDS[base + Number(rank) - 1]));
  });
}
const winning = [
  ['four sequences', ['123456m', '123p', '789s', '11z']],
  ['four triplets', ['111999m', '222p', '888s', '11z']],
  ['mixed melds', ['123999m', '456p', '777s', '11z']],
  ['honor triplet and pair', ['123m', '456p', '789s', '11122z']],
  ['four copies used legally', ['111123m', '456p', '789s', '22z']],
] as const;
for (const [name, groups] of winning) test(`standard: ${name}`, () => {
  const result = analyzeWinningShapes(hand(...groups));
  assert.equal(result.standard.isWinning, true);
  assert.equal(result.isWinning, true);
  assert.ok(result.standard.decompositions.every(d => d.melds.length === 4));
});
const losing = [
  ['unrelated tiles', ['124578m', '124p', '789s', '11z']],
  ['cross-suit sequence', ['12m', '3p', '456p', '789s', '11122z']],
  ['honor sequence', ['123m', '456p', '789s', '12344z']],
  ['wrapped sequence', ['891m', '456p', '789s', '11122z']],
  ['missing meld and pair', ['123m', '456p', '789s', '11234z']],
] as const;
for (const [name, groups] of losing) test(`non-winning: ${name}`, () => {
  assert.equal(isWinningShape(hand(...groups)), false);
});
test('standard melds and pair include red fives without changing logical output', () => {
  const tiles = hand('123m', '456p', '789s', '555m', '22z');
  const expected = analyzeWinningShapes(tiles);
  tiles[4] = redFive('pin'); tiles[9] = redFive('man');
  assert.deepEqual(analyzeWinningShapes(tiles), expected);
  const paired = hand('123m', '123p', '123s', '111z', '55p');
  paired[12] = redFive('pin');
  assert.equal(isWinningShape(paired), true);
});
test('seven distinct pairs return their exact kinds', () => {
  const tiles = hand('1122m', '3344p', '55s', '1144z');
  const result = analyzeWinningShapes(tiles);
  assert.equal(result.sevenPairs.isWinning, true);
  assert.deepEqual(result.sevenPairs.pairs?.map(tileKindKey), ['man-1', 'man-2', 'pin-3', 'pin-4', 'sou-5', 'east', 'north']);
  assert.equal(result.standard.isWinning, false);
});
test('red and ordinary five form a single seven-pairs pair', () => {
  const tiles = hand('1122m', '3344p', '55s', '1144z');
  tiles[8] = redFive('sou');
  assert.equal(analyzeWinningShapes(tiles).sevenPairs.isWinning, true);
});
test('four equal tiles are not two pairs (only six distinct kinds)', () => {
  assert.equal(analyzeWinningShapes(hand('111122m', '3344p', '55s', '11z')).sevenPairs.isWinning, false);
});
test('six pairs plus two singles is not seven pairs', () => {
  assert.equal(analyzeWinningShapes(hand('1122m', '3344p', '55s', '1123z')).sevenPairs.isWinning, false);
});
test('11223344556677m has seven pairs and exactly three standard decompositions', () => {
  const result = analyzeWinningShapes(hand('11223344556677m'));
  assert.equal(result.sevenPairs.isWinning, true);
  assert.deepEqual(result.standard.decompositions.map(d => ({
    pair: tileKindKey(d.pair),
    melds: d.melds.map(m => m.type === 'sequence' ? m.tiles.map(tileKindKey) : [tileKindKey(m.tile)]),
  })), [
    { pair: 'man-1', melds: [['man-2', 'man-3', 'man-4'], ['man-2', 'man-3', 'man-4'], ['man-5', 'man-6', 'man-7'], ['man-5', 'man-6', 'man-7']] },
    { pair: 'man-4', melds: [['man-1', 'man-2', 'man-3'], ['man-1', 'man-2', 'man-3'], ['man-5', 'man-6', 'man-7'], ['man-5', 'man-6', 'man-7']] },
    { pair: 'man-7', melds: [['man-1', 'man-2', 'man-3'], ['man-1', 'man-2', 'man-3'], ['man-4', 'man-5', 'man-6'], ['man-4', 'man-5', 'man-6']] },
  ]);
});
test('triplet and sequence branches both produce valid decompositions', () => {
  const result = analyzeWinningShapes(hand('111222333m', '444p', '11z'));
  assert.equal(result.standard.decompositions.length, 2);
  assert.deepEqual(result.standard.decompositions.map(d => d.melds.map(m => m.type)), [
    ['sequence', 'sequence', 'sequence', 'triplet'], ['triplet', 'triplet', 'triplet', 'triplet'],
  ]);
});
for (const duplicate of ['1z', '9s']) test(`thirteen orphans with duplicate ${duplicate}`, () => {
  const result = analyzeWinningShapes(hand('19m', '19p', '19s', '1234567z', duplicate));
  assert.equal(result.thirteenOrphans.isWinning, true);
  assert.deepEqual(result.thirteenOrphans.duplicate, hand(duplicate).map(({ isRed, ...kind }) => kind)[0]);
  assert.equal(result.standard.isWinning, false);
  assert.equal(result.sevenPairs.isWinning, false);
});
for (const [name, groups] of [
  ['missing honor', ['19m', '19p', '19s', '1123456z', '9m']],
  ['interior tile', ['19m', '19p', '19s', '1234567z', '5m']],
  ['tripled orphan', ['19m', '19p', '19s', '11123456z']],
] as const) test(`thirteen orphans rejected: ${name}`, () => {
  assert.equal(analyzeWinningShapes(hand(...groups)).thirteenOrphans.isWinning, false);
});
for (const length of [0, 13, 15]) test(`reject ${length} tiles`, () => {
  assert.throws(() => analyzeWinningShapes(Array.from({ length }, (_, i) => ordinaryTile(TILE_KINDS[i % 34]))), RangeError);
});
test('reject five copies including a red five', () => {
  const tiles = hand('55555m', '123p', '123s', '111z');
  tiles[0] = redFive('man');
  assert.throws(() => analyzeWinningShapes(tiles), RangeError);
  assert.throws(() => isWinningShape(tiles), RangeError);
});
test('reject malformed runtime inputs', () => {
  for (const invalid of [null, undefined, {}, { category: 'other', honor: 'east', isRed: false },
    { category: 'honor', honor: 'bogus', isRed: false }, { category: 'honor', honor: 'east', isRed: true },
    { category: 'suited', suit: 'bogus', rank: 1, isRed: false },
    { category: 'suited', suit: 'man', rank: '1', isRed: false },
    { category: 'suited', suit: 'man', rank: 10, isRed: false },
    { category: 'suited', suit: 'man', rank: 1, isRed: true },
    { category: 'suited', suit: 'man', rank: 1 }]) {
    const tiles = hand('11223344556677m');
    tiles[0] = invalid as Tile;
    assert.throws(() => analyzeWinningShapes(tiles), RangeError);
  }
  assert.throws(() => analyzeWinningShapes(null as unknown as Tile[]), RangeError);
  assert.throws(() => analyzeWinningShapes(new Array(14)), RangeError);
});
test('frozen input is unchanged; order and deduplication are stable', () => {
  const tiles = Object.freeze(hand('11223344556677m').map(Object.freeze));
  const snapshot = structuredClone(tiles);
  const expected = analyzeWinningShapes(tiles);
  for (let shift = 0; shift < 14; shift++) {
    const reordered = [...tiles.slice(shift), ...tiles.slice(0, shift)].reverse();
    assert.deepEqual(analyzeWinningShapes(reordered), expected);
  }
  assert.deepEqual(tiles, snapshot);
  const keys = expected.standard.decompositions.map(d => JSON.stringify(d));
  assert.equal(new Set(keys).size, keys.length);
});

function rng() {
  let state = 0x12345678;
  return (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
}
// Independent decision oracle: chooses any meld first, and leaves a pair last.
function oracle(tiles: readonly Tile[]): boolean {
  const counts = TILE_KINDS.map(k => tiles.filter(t => tileKindKey(t) === tileKindKey(k)).length);
  const memo = new Map<string, boolean>();
  function search(left: number): boolean {
    if (left === 2) return counts.some(n => n === 2);
    const key = counts.join('');
    if (memo.has(key)) return memo.get(key)!;
    for (let i = 0; i < 34; i++) {
      const candidates = [[i, i, i]];
      if (i < 27 && i % 9 <= 6) candidates.push([i, i + 1, i + 2]);
      for (const indices of candidates) {
        const needed = new Map<number, number>();
        for (const index of indices) needed.set(index, (needed.get(index) ?? 0) + 1);
        if ([...needed].some(([index, n]) => counts[index] < n)) continue;
        for (const index of indices) counts[index]--;
        const win = search(left - 3);
        for (const index of indices) counts[index]++;
        if (win) { memo.set(key, true); return true; }
      }
    }
    memo.set(key, false); return false;
  }
  const pairs = counts.filter(n => n === 2).length === 7;
  const orphans = counts.filter(n => n > 0).length === 13 &&
    TILE_KINDS.every((k, i) => (k.category === 'honor' || k.rank === 1 || k.rank === 9) ? counts[i] >= 1 : counts[i] === 0);
  return search(14) || pairs || orphans;
}
test('1000 seeded legal hands agree with independent decision oracle', () => {
  const random = rng();
  for (let trial = 0; trial < 1000; trial++) {
    const pool = TILE_KINDS.flatMap(k => Array.from({ length: 4 }, () => ordinaryTile(k)));
    const tiles = Array.from({ length: 14 }, () => pool.splice(random(pool.length), 1)[0]);
    assert.equal(isWinningShape(tiles), oracle(tiles));
  }
});
test('500 seeded generated standard hands win and every returned decomposition consumes the hand', () => {
  const random = rng();
  let accepted = 0;
  while (accepted < 500) {
    const pair = random(34);
    const indices = [pair, pair];
    for (let m = 0; m < 4; m++) {
      const first = random(34);
      if (first < 27 && first % 9 <= 6 && random(2)) indices.push(first, first + 1, first + 2);
      else indices.push(first, first, first);
    }
    if (indices.some(i => indices.filter(j => j === i).length > 4)) continue;
    accepted++;
    const tiles = indices.map(i => ordinaryTile(TILE_KINDS[i]));
    const expected = tiles.map(tileKindKey).sort();
    const result = analyzeWinningShapes(tiles);
    assert.equal(result.standard.isWinning, true);
    const unique = new Set<string>();
    for (const d of result.standard.decompositions) {
      const reconstructed = [d.pair, d.pair, ...d.melds.flatMap(m => m.type === 'sequence' ? [...m.tiles] : [m.tile, m.tile, m.tile])];
      assert.deepEqual(reconstructed.map(tileKindKey).sort(), expected);
      for (const m of d.melds) if (m.type === 'sequence') {
        assert.ok(m.tiles.every(k => k.category === 'suited'));
        const [a, b, c] = m.tiles;
        if (a.category === 'suited' && b.category === 'suited' && c.category === 'suited') {
          assert.equal(a.suit, b.suit); assert.equal(b.suit, c.suit);
          assert.equal(a.rank + 1, b.rank); assert.equal(b.rank + 1, c.rank);
        }
      }
      unique.add(JSON.stringify(d));
    }
    assert.equal(unique.size, result.standard.decompositions.length);
    assert.deepEqual(analyzeWinningShapes([...tiles].reverse()), result);
  }
});
