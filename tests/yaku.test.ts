import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_KINDS, ordinaryTile, redFive } from '../src/model/tile.ts';
import type { Tile } from '../src/model/tile.ts';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import type { WinningContext, YakuCandidate, YakuId } from '../src/analysis/yaku.ts';
function hand(...groups: string[]): Tile[] {
  return groups.flatMap(g => [...g.slice(0, -1)].map(n => ordinaryTile(TILE_KINDS[
    ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1])));
}
function context(tile = '1m', extra: Partial<WinningContext> = {}): WinningContext {
  return { winMethod: 'ron', winningTile: hand(tile)[0], seatWind: 'east', roundWind: 'south', ...extra };
}
const has = (c: YakuCandidate, id: YakuId) => c.yaku.some(y => y.id === id);
function check(groups: string[], tile: string, id: YakuId, expected: boolean, extra: Partial<WinningContext> = {}) {
  const result = analyzeYaku(hand(...groups), context(tile, extra));
  assert.equal(result.isWinningShape, true);
  assert.equal(result.candidates.some(c => has(c, id)), expected);
}
for (const method of ['tsumo', 'ron'] as const) test(`menzen tsumo: ${method}`, () =>
  check(['123m', '456p', '789s', '11122z'], '1m', 'menzen-tsumo', method === 'tsumo', { winMethod: method }));
for (const [name, groups, tile, expected] of [
  ['interior', ['234m', '345p', '678s', '222p', '66m'], '2m', true],
  ['terminal 1', ['123m', '345p', '678s', '222p', '66m'], '1m', false],
  ['terminal 9', ['234m', '345p', '789s', '222p', '66m'], '2m', false],
  ['honor', ['234m', '345p', '678s', '222p', '11z'], '2m', false],
] as const) test(`tanyao: ${name}`, () => check([...groups], tile, 'tanyao', expected));
test('red five does not change yaku or assignment', () => {
  const tiles = hand('234m', '345p', '678s', '222p', '66m');
  const expected = analyzeYaku(tiles, context('5p'));
  tiles[5] = redFive('pin');
  assert.deepEqual(analyzeYaku(tiles, context('5p')), expected);
});
for (const [honor, id] of [['5z', 'yakuhai-white'], ['6z', 'yakuhai-green'], ['7z', 'yakuhai-red'],
  ['1z', 'yakuhai-seat-wind'], ['2z', 'yakuhai-round-wind']] as const) test(`yakuhai: ${id}`, () => {
  const triplet = honor[0].repeat(3) + 'z';
  check(['123m', '456p', '789s', triplet, '33z'], '1m', id, true);
  check(['123m', '456p', '789s', '333z', honor[0].repeat(2) + 'z'], '1m', id, false);
});
test('double wind has independent IDs and two han', () => {
  const c = analyzeYaku(hand('123m', '456p', '789s', '11133z'), context('1m', { roundWind: 'east' })).candidates[0];
  assert.equal(c.totalHan, 2);
  assert.deepEqual(c.yaku.map(y => y.id), ['yakuhai-seat-wind', 'yakuhai-round-wind']);
});
test('other wind triplet is not yakuhai', () => check(['123m', '456p', '789s', '33344z'], '1m', 'yakuhai-seat-wind', false));
test('multiple dragon triplets sum', () => {
  const c = analyzeYaku(hand('123m', '55566677744z'), context()).candidates[0];
  assert.equal(c.totalHan, 6);
  assert.deepEqual(c.yaku.map(y => y.id), ['honitsu', 'yakuhai-white', 'yakuhai-green', 'yakuhai-red']);
});
for (const [name, groups, expected] of [
  ['four triplets', ['111999m', '222p', '888s', '33z'], true],
  ['one sequence', ['123999m', '222p', '888s', '33z'], false],
] as const) test(`toitoi: ${name}`, () => check([...groups], '1m', 'toitoi', expected));
for (const [name, groups, expected] of [
  ['same suit', ['123123m', '456p', '789s', '33z'], true],
  ['different suits', ['123m', '123456p', '789s', '33z'], false],
] as const) test(`iipeikou: ${name}`, () => check([...groups], '1m', 'iipeikou', expected));
test('multiple repeated sequences still award only one han', () => {
  for (const c of analyzeYaku(hand('11223344556677m'), context()).candidates.filter(c => c.shape === 'standard')) {
    assert.equal(c.yaku.filter(y => y.id === 'iipeikou').length, 1);
    assert.equal(c.yaku.find(y => y.id === 'iipeikou')?.han, 1);
  }
});
for (const [sequence, tile, wait] of [
  ['123m', '1m', 'ryanmen'], ['123m', '3m', 'penchan'],
  ['789m', '7m', 'penchan'], ['789m', '9m', 'ryanmen'],
  ['234m', '3m', 'kanchan'], ['234m', '2m', 'ryanmen'],
] as const) test(`pinfu sequence ${sequence}, winning ${tile}: ${wait}`, () => {
  const candidates = analyzeYaku(hand(sequence, '456p', '678s', '234s', '33z'), context(tile)).candidates;
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].wait, wait);
  assert.equal(has(candidates[0], 'pinfu'), wait === 'ryanmen');
});
test('tanki does not award pinfu', () => {
  const c = analyzeYaku(hand('123m', '456p', '789s', '234s', '33z'), context('3z')).candidates[0];
  assert.equal(c.wait, 'tanki'); assert.equal(has(c, 'pinfu'), false);
});
test('shanpon does not award pinfu', () => {
  const c = analyzeYaku(hand('123m', '456p', '789s', '33344z'), context('3z')).candidates[0];
  assert.equal(c.wait, 'shanpon'); assert.equal(has(c, 'pinfu'), false);
});
for (const [pair, extra, expected] of [
  ['55z', {}, false], ['66z', {}, false], ['77z', {}, false],
  ['11z', {}, false], ['22z', {}, false], ['33z', {}, true],
  ['11z', { roundWind: 'east' }, false], ['22z', { roundWind: 'east' }, true],
  ['33z', { seatWind: 'west', roundWind: 'north' }, false],
  ['44z', { seatWind: 'west', roundWind: 'north' }, false],
] as const) test(`pinfu pair ${pair}, winds ${JSON.stringify(extra)}`, () =>
  check(['123m', '456p', '789s', '234s', pair], '1m', 'pinfu', expected, extra));
test('one decomposition retains both kanchan and ryanmen assignments', () => {
  const result = analyzeYaku(hand('234345m', '456p', '789s', '33z'), context('3m'));
  assert.deepEqual(result.candidates.map(c => [c.wait, has(c, 'pinfu')]), [['kanchan', false], ['ryanmen', true]]);
  const standard = result.candidates.filter(c => c.shape === 'standard');
  assert.equal(new Set(standard.map(c => c.decompositionId)).size, 1);
  assert.deepEqual(standard.map(c => c.assignment), [
    { type: 'meld', meldIndex: 0, tileIndex: 1 }, { type: 'meld', meldIndex: 1, tileIndex: 0 }]);
});
test('pair and sequence assignments remain separate', () => {
  const result = analyzeYaku(hand('123345m', '456p', '789s', '33m'), context('3m'));
  assert.ok(result.candidates.some(c => c.wait === 'tanki'));
  assert.ok(result.candidates.some(c => c.wait === 'penchan'));
  assert.ok(result.candidates.some(c => c.wait === 'ryanmen' && has(c, 'pinfu')));
});
for (const method of ['ron', 'tsumo'] as const) test(`seven pairs combinations ${method}`, () => {
  const result = analyzeYaku(hand('2244m', '3355p', '226688s'), context('2m', { winMethod: method }));
  const c = result.candidates.find(c => c.shape === 'seven-pairs')!;
  assert.deepEqual(c.yaku.map(y => y.id), [...(method === 'tsumo' ? ['menzen-tsumo'] : []), 'tanyao', 'chiitoitsu']);
  assert.equal(c.totalHan, method === 'tsumo' ? 4 : 3); assert.equal(c.wait, 'tanki');
  assert.equal(c.yakumanCount, 0);
});
test('11223344556677m separates seven pairs, decompositions and waits', () => {
  const result = analyzeYaku(hand('11223344556677m'), context('4m'));
  const seven = result.candidates.find(c => c.shape === 'seven-pairs')!;
  assert.deepEqual(seven.yaku, [{ id: 'chinitsu', han: 6, yakuman: 0 }, { id: 'chiitoitsu', han: 2, yakuman: 0 }]);
  const standard = result.candidates.filter(c => c.shape === 'standard');
  assert.equal(new Set(standard.map(c => c.decompositionId)).size, 3);
  assert.deepEqual(standard.map(c => [c.wait, c.totalHan]), [['ryanmen', 8], ['tanki', 7], ['ryanmen', 8]]);
  assert.equal(result.candidates.length, 4);
});
test('different decompositions never merge iipeikou with toitoi', () => {
  const result = analyzeYaku(hand('111222333m', '444p', '11z'), context());
  assert.ok(result.candidates.some(c => has(c, 'iipeikou')));
  assert.ok(result.candidates.some(c => has(c, 'toitoi')));
  assert.ok(result.candidates.every(c => !(has(c, 'iipeikou') && has(c, 'toitoi'))));
});
for (const method of ['ron', 'tsumo'] as const) test(`kokushi ${method}: yakuman only`, () => {
  const result = analyzeYaku(hand('19m', '19p', '19s', '11234567z'), context('1z', { winMethod: method }));
  assert.equal(result.hasSupportedYaku, true);
  assert.equal(result.candidates.length, 1);
  const c = result.candidates[0];
  assert.equal(c.shape, 'thirteen-orphans'); assert.equal(c.totalHan, 0); assert.equal(c.yakumanCount, 1);
  assert.deepEqual(c.yaku, [{ id: 'kokushi-musou', han: 0, yakuman: 1 }]);
});
test('supported subset may recognize zero yaku in a valid shape', () => {
  const result = analyzeYaku(hand('123m', '456p', '789s', '33344z'), context());
  assert.equal(result.isWinningShape, true); assert.equal(result.hasSupportedYaku, false);
  assert.ok(result.candidates.length > 0);
});
for (const length of [13, 15]) test(`reject ${length} tiles`, () =>
  assert.throws(() => analyzeYaku(Array.from({ length }, (_, i) => ordinaryTile(TILE_KINDS[i])), context()), RangeError));
test('reject over four copies including red five', () => {
  const tiles = hand('55555m', '123p', '123s', '111z'); tiles[0] = redFive('man');
  assert.throws(() => analyzeYaku(tiles, context('5m')), RangeError);
});
for (const invalid of [null, {}, { category: 'honor', honor: 'bad', isRed: false },
  { category: 'suited', suit: 'man', rank: 0, isRed: false },
  { category: 'suited', suit: 'man', rank: 1, isRed: true },
  { category: 'honor', honor: 'east', isRed: true }]) test(`invalid tile ${JSON.stringify(invalid)}`, () => {
  const tiles = hand('11223344556677m'); tiles[0] = invalid as Tile;
  assert.throws(() => analyzeYaku(tiles, context()), RangeError);
});
for (const extra of [{ seatWind: 'white' }, { roundWind: 'red' }, { winMethod: 'draw' },
  { winningTile: null }, { winningTile: { category: 'suited', suit: 'man', rank: '1' } },
  { winningTile: { category: 'honor', honor: 'bad' } }, { isClosed: false }]) test(`invalid context ${JSON.stringify(extra)}`, () =>
  assert.throws(() => analyzeYaku(hand('11223344556677m'), context('1m', extra as unknown as Partial<WinningContext>)), RangeError));
test('absent winning tile and null context are rejected', () => {
  assert.throws(() => analyzeYaku(hand('11223344556677m'), context('9p')), RangeError);
  assert.throws(() => analyzeYaku(hand('11223344556677m'), null as unknown as WinningContext), RangeError);
});
test('normal nonwinning hand returns no candidates', () => {
  assert.deepEqual(analyzeYaku(hand('124578m', '124p', '789s', '11z'), context()),
    { isWinningShape: false, hasSupportedYaku: false, candidates: [] });
});
test('frozen inputs, stable order, unique IDs and contents', () => {
  const tiles = Object.freeze(hand('11223344556677m').map(Object.freeze));
  const ctx = Object.freeze({ ...context('4m'), winningTile: Object.freeze(context('4m').winningTile) });
  const before = structuredClone({ tiles, ctx });
  const expected = analyzeYaku(tiles, ctx);
  for (let shift = 0; shift < 14; shift++) assert.deepEqual(analyzeYaku([...tiles.slice(shift), ...tiles.slice(0, shift)].reverse(), ctx), expected);
  assert.deepEqual({ tiles, ctx }, before);
  assert.equal(new Set(expected.candidates.map(c => c.id)).size, expected.candidates.length);
  assert.equal(new Set(expected.candidates.map(c => JSON.stringify(c))).size, expected.candidates.length);
});
