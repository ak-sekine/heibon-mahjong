import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeYaku, type WinningContext, type YakuCandidate, type YakuId } from '../src/analysis/yaku.ts';
import { calculateFu } from '../src/analysis/fu.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { TILE_KINDS, ordinaryTile, redFive, type Suit, type Tile, type TileKind } from '../src/model/tile.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';
import { declareRon } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { analyzeWinningShapes } from '../src/analysis/winning-shape.ts';
import { settleRound, startMatch, assertPointConservation } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { ronGame } from './ron-fixture.ts';
import { openChinitsuPonTsumoGame } from './step13-6-fixture.ts';
import { freeze, inventory } from './helpers.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
function kinds(group: string): TileKind[] {
  const suit = group.at(-1)! as keyof typeof starts;
  return [...group.slice(0, -1)].map(rank => TILE_KINDS[starts[suit] + Number(rank) - 1]);
}
function hand(...groups: string[]): Tile[] {
  return groups.flatMap(group => kinds(group).map(ordinaryTile));
}
function kind(code: string): TileKind { return kinds(code)[0]; }
function context(winningTile: string, extra: Partial<WinningContext> = {}): WinningContext {
  return { winMethod: 'ron', winningTile: kind(winningTile), seatWind: 'east', roundWind: 'south', ...extra };
}
function sequence(group: string): Extract<WinningMeld, { type: 'sequence' }> {
  const [first, second, third] = kinds(group);
  return { type: 'sequence', tiles: [first, second, third] };
}
function triplet(group: string, extra: { kan?: boolean; concealed?: boolean } = {}): Extract<WinningMeld, { type: 'triplet' }> {
  return { type: 'triplet', tile: kind(group), ...extra };
}
function evaluate(groups: string[], winningTile: string, extra: Partial<WinningContext> = {}) {
  return analyzeYaku(hand(...groups), context(winningTile, extra));
}
function records(candidates: readonly YakuCandidate[], id: YakuId) {
  return candidates.flatMap(candidate => candidate.yaku.filter(yaku => yaku.id === id));
}
function assertYaku(candidates: readonly YakuCandidate[], id: YakuId, han: number) {
  const found = records(candidates, id);
  assert.ok(found.length > 0, `${id} missing`);
  assert.ok(found.every(yaku => yaku.han === han && yaku.yakuman === 0), `${id} han`);
  for (const candidate of candidates) assert.ok(candidate.yaku.filter(yaku => yaku.id === id).length <= 1, `${id} counted twice`);
}
function assertNoYaku(candidates: readonly YakuCandidate[], id: YakuId) {
  assert.equal(records(candidates, id).length, 0, `${id} should not be present`);
}

const SANS = ['123m', '123p', '123s', '456s', '55m'];
const ITTSU = ['123m', '456m', '789m', '234p', '55s'];
const CHINITSU = ['111m', '234m', '678m', '999m', '22m'];

for (const method of ['ron', 'tsumo'] as const) test(`Step 13.6 sanshoku closed ${method}: two han and one award`, () => {
  const result = evaluate(SANS, '6s', { winMethod: method });
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'sanshoku-doujun', 2);
});
test('Step 13.6 sanshoku combines a fixed chi and concealed sequences, with open han', () => {
  const melds = [sequence('123m')];
  const result = analyzeYaku(hand('123p', '123s', '456s', '77z'), context('6s', { isClosed: false, openMelds: melds }));
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'sanshoku-doujun', 1);
});
test('Step 13.6 sanshoku rejects a missing suit/rank, and triplets do not count as sequences', () => {
  assertNoYaku(evaluate(['123m', '456p', '789s', '234s', '55m'], '4p').candidates, 'sanshoku-doujun');
  assertNoYaku(evaluate(['123m', '234p', '123s', '456p', '55m'], '6p').candidates, 'sanshoku-doujun');
  assertNoYaku(evaluate(['111m', '222p', '333s', '456s', '55z'], '6s').candidates, 'sanshoku-doujun');
});

for (const method of ['ron', 'tsumo'] as const) test(`Step 13.6 ittsu closed ${method}: two han and one award`, () => {
  const result = evaluate(ITTSU, '2p', { winMethod: method });
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'ittsu', 2);
});
test('Step 13.6 ittsu combines a fixed chi and concealed sequences, with open han', () => {
  const result = analyzeYaku(hand('456m', '789m', '234s', '66p'), context('6m', { isClosed: false, openMelds: [sequence('123m')] }));
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'ittsu', 1);
});
test('Step 13.6 ittsu rejects a missing sequence and does not treat a triplet as 123', () => {
  assertNoYaku(evaluate(['111m', '456m', '789m', '234p', '55s'], '6m').candidates, 'ittsu');
  assertNoYaku(evaluate(['123m', '456p', '789m', '234s', '55z'], '6p').candidates, 'ittsu');
});

for (const suit of ['m', 'p', 's'] as const) {
  test(`Step 13.6 chinitsu ${suit}: closed six han, no honors`, () => {
    const result = evaluate([`123${suit}`, `456${suit}`, `789${suit}`, `234${suit}`, `22${suit}`], `2${suit}`);
    assert.equal(result.isWinningShape, true);
    assertYaku(result.candidates, 'chinitsu', 6);
    assertNoYaku(result.candidates, 'honitsu');
  });
  test(`Step 13.6 honitsu ${suit}: one number suit plus honors`, () => {
    const result = evaluate([`123${suit}`, `456${suit}`, `789${suit}`, `99${suit}`, '555z'], '5z');
    assert.equal(result.isWinningShape, true);
    assertYaku(result.candidates, 'honitsu', 3);
    assertNoYaku(result.candidates, 'chinitsu');
    assert.ok(result.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'yakuhai-white')));
  });
}

test('Step 13.6 open honitsu counts its exposed white pon and has two han', () => {
  const result = analyzeYaku(hand('123m', '456m', '789m', '99m'), context('9m', {
    isClosed: false, openMelds: [triplet('5z')],
  }));
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'honitsu', 2);
  assert.ok(result.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'yakuhai-white')));
});
test('Step 13.6 color yaku reject mixed number suits and honor-only hands', () => {
  const mixed = evaluate(['123m', '456m', '789p', '234m', '55m'], '6m');
  assert.equal(mixed.isWinningShape, true);
  assertNoYaku(mixed.candidates, 'honitsu');
  assertNoYaku(mixed.candidates, 'chinitsu');
  const honors = evaluate(['111z', '222z', '333z', '444z', '55z'], '1z');
  assert.equal(honors.isWinningShape, true);
  assertNoYaku(honors.candidates, 'honitsu');
  assertNoYaku(honors.candidates, 'chinitsu');
});
test('Step 13.6 color yaku also apply to seven pairs and never overlap', () => {
  const honitsu = analyzeYaku(hand('11m', '33m', '55m', '77m', '99m', '22m', '77z'), context('7z'));
  const honitsuPairs = honitsu.candidates.find(candidate => candidate.shape === 'seven-pairs')!;
  assertYaku([honitsuPairs], 'honitsu', 3);
  assertYaku([honitsuPairs], 'chiitoitsu', 2);
  assertNoYaku([honitsuPairs], 'chinitsu');

  const chinitsu = analyzeYaku(hand('11m', '33m', '55m', '77m', '99m', '22m', '44m'), context('4m'));
  const chinitsuPairs = chinitsu.candidates.find(candidate => candidate.shape === 'seven-pairs')!;
  assertYaku([chinitsuPairs], 'chinitsu', 6);
  assertYaku([chinitsuPairs], 'chiitoitsu', 2);
  assertNoYaku([chinitsuPairs], 'honitsu');
});

test('Step 13.6 closed ankan keeps menzen for chinitsu', () => {
  const result = analyzeYaku(hand('123m', '678m', '789m', '11m'), context('1m', {
    isClosed: true, openMelds: [triplet('5m', { kan: true, concealed: true })],
  }));
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'chinitsu', 6);
});
for (const type of ['daiminkan', 'kakan'] as const) test(`Step 13.6 ${type} is open and chinitsu is five han`, () => {
  const meld: WinningMeld = triplet('5m', { kan: true });
  const result = analyzeYaku(hand('123m', '678m', '789m', '11m'), context('1m', { isClosed: false, openMelds: [meld] }));
  assert.equal(result.isWinningShape, true);
  assertYaku(result.candidates, 'chinitsu', 5);
});

test('Step 13.6 additions combine with pinfu, iipeikou, yakuhai, toitoi, riichi and rinshan', () => {
  const sanshoku = evaluate(['123m', '123p', '123s', '456s', '55m'], '6s');
  assert.ok(sanshoku.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'sanshoku-doujun') &&
    candidate.yaku.some(yaku => yaku.id === 'pinfu')));
  const ittsu = evaluate(ITTSU, '2p');
  assert.ok(ittsu.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'ittsu') &&
    candidate.yaku.some(yaku => yaku.id === 'pinfu')));
  const chinitsuPinfu = evaluate(['123m', '456m', '789m', '345m', '22m'], '9m');
  assert.ok(chinitsuPinfu.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'chinitsu') &&
    candidate.yaku.some(yaku => yaku.id === 'pinfu')));

  const honitsuYakuhai = evaluate(['123m', '456m', '789m', '99m', '555z'], '5z');
  assert.ok(honitsuYakuhai.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'honitsu') &&
    candidate.yaku.some(yaku => yaku.id === 'yakuhai-white')));
  const honitsuToitoi = evaluate(['111m', '222m', '333m', '444z', '55m'], '3m');
  assert.ok(honitsuToitoi.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'honitsu') &&
    candidate.yaku.some(yaku => yaku.id === 'toitoi')));
  const chinitsuIipeikou = evaluate(['123m', '123m', '456m', '789m', '55m'], '9m');
  assert.ok(chinitsuIipeikou.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'chinitsu') &&
    candidate.yaku.some(yaku => yaku.id === 'iipeikou')));
  const riichi = evaluate(ITTSU, '2p', { riichi: true });
  assert.ok(riichi.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'ittsu') &&
    candidate.yaku.some(yaku => yaku.id === 'riichi')));
  const rinshan = evaluate(['123m', '456m', '789m', '22m', '111z'], '3m', { winMethod: 'tsumo', rinshan: true });
  assert.ok(rinshan.candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'honitsu') &&
    candidate.yaku.some(yaku => yaku.id === 'rinshan')));
});

test('Step 13.6 red five preserves yaku identity and han for each new yaku', () => {
  const examples: readonly [YakuId, string[], string, Suit][] = [
    ['sanshoku-doujun', SANS, '6s', 'sou'], ['ittsu', ITTSU, '2p', 'man'],
    ['honitsu', ['123m', '456m', '789m', '99m', '555z'], '5z', 'man'],
    ['chinitsu', ['123m', '456m', '789m', '234m', '22m'], '2m', 'man'],
  ];
  for (const [id, groups, winningTile, suit] of examples) {
    const tiles = hand(...groups);
    const redIndex = tiles.findIndex(tile => tile.category === 'suited' && tile.suit === suit && tile.rank === 5);
    assert.notEqual(redIndex, -1);
    const expected = analyzeYaku(tiles, context(winningTile));
    tiles[redIndex] = redFive(suit);
    assert.deepEqual(analyzeYaku(tiles, context(winningTile)), expected, id);
  }
});

test('Step 13.6 malformed fixed sequence and excessive physical tile counts are rejected', () => {
  const malformed = { type: 'sequence' as const, tiles: [kind('1m'), kind('2m'), kind('4m')] as const };
  assert.throws(() => analyzeYaku(hand('123p', '123s', '456s', '77z'), context('6s', {
    isClosed: false, openMelds: [malformed],
  })), RangeError);
  const tooMany = hand(...SANS);
  for (const index of [0, 1, 2]) tooMany[index] = ordinaryTile(kind('5m'));
  assert.throws(() => analyzeYaku(tooMany, context('1m')), RangeError);
});

test('Step 13.6 inputs remain unchanged and analysis is deterministic', () => {
  const examples = [
    { groups: SANS, winning: '6s', extra: {} },
    { groups: ITTSU, winning: '2p', extra: { riichi: true } },
    { groups: ['123m', '456m', '789m', '99m', '555z'], winning: '5z', extra: {} },
    { groups: CHINITSU, winning: '2m', extra: { winMethod: 'tsumo' as const } },
  ] as const;
  for (const example of examples) {
    const tiles = Object.freeze(hand(...example.groups).map(Object.freeze));
    const winningTile = Object.freeze(kind(example.winning));
    const ctx = Object.freeze({ winMethod: 'ron' as const, winningTile, seatWind: 'east' as const, roundWind: 'south' as const, ...example.extra });
    const snapshot = structuredClone({ tiles, ctx });
    const first = analyzeYaku(tiles, ctx);
    assert.deepEqual(analyzeYaku(tiles, ctx), first);
    assert.deepEqual({ tiles, ctx }, snapshot);
  }
});

test('Step 13.6 real fixed-wall ron uses sanshoku, pinfu, fu and child payment', () => {
  const initial = ronGame(1, [0], [['123m', '123p', '123s', '45s', '55m']], 'sou-6', false, 'sou-8');
  freeze(initial);
  const won = declareRon(initial, 0);
  inventory(won, initial);
  assert.equal(won.winResult?.winMethod, 'ron');
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected ron');
  const result = won.winResult.winners[0];
  assertYaku([result.candidate], 'sanshoku-doujun', 2);
  assertYaku([result.candidate], 'pinfu', 1);
  assert.equal(result.yakuHan, 3);
  assert.equal(result.fu, 30);
  assert.equal(result.scoreTier, 'normal');
  assert.equal(result.totalPoints, 3900);
});

test('Step 13.6 real fixed-wall chinitsu tsumo reaches haneman with red dora accounting separate', () => {
  const initial = tsumoGame([...CHINITSU], false, ['man'], 'sou-9');
  freeze(initial);
  const won = declareTsumo(initial, 0);
  inventory(won, initial);
  if (won.winResult?.winMethod !== 'tsumo') throw new Error('Expected tsumo');
  const result = won.winResult;
  assertYaku([result.candidate], 'chinitsu', 6);
  assert.ok(result.yakuHan >= 6);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + result.doraHan + result.redDoraHan);
  assert.equal(result.scoreTier, 'haneman');
  assert.equal(result.totalPoints, 18000);
});

test('Step 13.6 every CPU seat can tsumo chinitsu through the shared win path', () => {
  for (const winner of [1, 2, 3] as const) {
    const initial = cpuTsumoGame(winner, [...CHINITSU], 'sou-9');
    freeze(initial);
    const won = declareTsumo(initial, winner);
    inventory(won, initial);
    if (won.winResult?.winMethod !== 'tsumo') throw new Error(`Expected CPU ${winner} tsumo`);
    assert.equal(won.winResult.winnerId, winner);
    assertYaku([won.winResult.candidate], 'chinitsu', 6);
    assert.equal(won.winResult.scoreTier, 'haneman');
    assert.equal(won.winResult.totalPoints, 12000);
  }
});

test('Step 13.6 every CPU seat can ron sanshoku through automatic ron resolution', () => {
  const handGroups = ['123m', '123p', '123s', '45s', '55m'];
  for (const winner of [1, 2, 3] as const) {
    const initial = ronGame(0, [winner], [handGroups], 'sou-6', false, 'sou-8');
    inventory(initial, initial);
    assert.equal(initial.phase, 'won');
    if (initial.winResult?.winMethod !== 'ron') throw new Error(`Expected CPU ${winner} ron`);
    const result = initial.winResult.winners.find(candidate => candidate.winnerId === winner)!;
    assertYaku([result.candidate], 'sanshoku-doujun', 2);
    assert.equal(result.fu, 30);
    assert.equal(result.totalPoints, 3900);
  }
});

test('Step 13.6 double ron scores each sanshoku winner independently', () => {
  const handGroups = ['123m', '123p', '123s', '45s', '55m'];
  const initial = ronGame(1, [0, 2], [handGroups], 'sou-6', false, 'sou-8');
  freeze(initial);
  const won = declareRon(initial, 0);
  inventory(won, initial);
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected double ron');
  assert.equal(won.winResult.winners.length, 2);
  for (const result of won.winResult.winners) {
    assertYaku([result.candidate], 'sanshoku-doujun', 2);
    assert.equal(result.fu, 30);
    assert.equal(result.totalHanIncludingDora, result.yakuHan + result.doraHan + result.redDoraHan);
    assert.equal(result.totalPoints, result.redDoraHan > 0 ? 7700 : 3900);
  }
  assert.equal(won.winResult.winners.reduce((sum, winner) => sum + winner.totalPoints, 0), 11600);
});

test('Step 13.6 exposed chinitsu scores as mangan and preserves honba/deposit points', () => {
  const open = openChinitsuPonTsumoGame();
  inventory(open, open);
  freeze(open);
  const won = declareTsumo(open, 0);
  inventory(won, open);
  if (won.winResult?.winMethod !== 'tsumo') throw new Error('Expected open tsumo');
  const result = won.winResult;
  assertYaku([result.candidate], 'chinitsu', 5);
  assert.equal(result.scoreTier, 'mangan');
  assert.equal(result.totalPoints, 12000);
  const initialMatch = { ...startMatch(startGame()), game: won, honba: 1,
    points: [24000, 25000, 25000, 25000] as const, depositSticks: 1 };
  const settled = settleRound(initialMatch);
  assert.equal(settled.lastSettlement?.deposits?.recipientId, 0);
  assert.equal(settled.lastSettlement?.deposits?.points, 1000);
  assert.equal(settled.lastSettlement?.payments.reduce((sum, payment) => sum + payment.honbaPoints, 0), 300);
  assert.equal(settled.points.reduce((sum, points) => sum + points, 0), 100000);
  assertPointConservation(settled);
});

test('Step 13.6 legacy ambiguous decompositions keep candidate-local yaku', () => {
  const result = analyzeYaku(hand('111222333m', '444p', '11z'), context('1m'));
  const candidates = result.candidates.filter(candidate => candidate.shape === 'standard');
  assert.ok(candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'iipeikou')));
  assert.ok(candidates.some(candidate => candidate.yaku.some(yaku => yaku.id === 'toitoi')));
  assert.ok(candidates.every(candidate => !(candidate.yaku.some(yaku => yaku.id === 'iipeikou') &&
    candidate.yaku.some(yaku => yaku.id === 'toitoi'))));
  for (const candidate of candidates) {
    const fu = calculateFu(candidate, { winMethod: 'ron', seatWind: 'east', roundWind: 'south' });
    const score = calculateScore({ totalHanIncludingDora: candidate.totalHan, fu: fu.fu, yakumanCount: candidate.yakumanCount,
      winnerId: 0, dealerId: 1, discarderId: 1, winMethod: 'ron' });
    assert.ok(score.totalPoints > 0);
  }
});
