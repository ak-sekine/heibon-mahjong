import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeYaku, type WinningContext, type YakuCandidate, type YakuId } from '../src/analysis/yaku.ts';
import { calculateFu } from '../src/analysis/fu.ts';
import { TILE_KINDS, ordinaryTile, redFive, type Tile, type TileKind } from '../src/model/tile.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';
import { yakuDisplayName } from '../src/rendering/table.ts';
import { declareRon } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { evaluateWin } from '../src/game/win.ts';
import { settleRound, startMatch, assertPointConservation } from '../src/game/match.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { ronGame } from './ron-fixture.ts';
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
function candidatesWith(result: ReturnType<typeof analyzeYaku>, id: YakuId): YakuCandidate[] {
  return result.candidates.filter(candidate => candidate.yaku.some(yaku => yaku.id === id));
}
function assertRole(result: ReturnType<typeof analyzeYaku>, id: YakuId, han: number): YakuCandidate[] {
  const candidates = candidatesWith(result, id);
  assert.ok(candidates.length > 0, `${id} missing`);
  for (const candidate of candidates) {
    const matching = candidate.yaku.filter(yaku => yaku.id === id);
    assert.deepEqual(matching, [{ id, han, yakuman: 0 }]);
    assert.equal(candidate.totalHan, candidate.yaku.reduce((sum, yaku) => sum + yaku.han, 0));
  }
  return candidates;
}
function assertNoRole(result: ReturnType<typeof analyzeYaku>, id: YakuId): void {
  assert.equal(candidatesWith(result, id).length, 0, `${id} should not be present`);
}

test('三暗刻: tsumo, ron pair/sequence, and ron shanpon follow the fu classification', () => {
  const base = ['111m', '222p', '333s', '456s', '55z'];
  assertRole(analyzeYaku(hand(...base), context('6s', { winMethod: 'tsumo' })), 'sanankou', 2);
  assertRole(analyzeYaku(hand(...base), context('5z')), 'sanankou', 2);
  assertRole(analyzeYaku(hand(...base), context('6s')), 'sanankou', 2);
  assertNoRole(analyzeYaku(hand(...base), context('1m')), 'sanankou');

  const ambiguous = analyzeYaku(hand('1111m', '23m', '222p', '333s', '55z'), context('1m'));
  const shanpon = ambiguous.candidates.find(candidate => candidate.shape === 'standard' && candidate.wait === 'shanpon')!;
  const sequenceWin = ambiguous.candidates.find(candidate => candidate.shape === 'standard' && candidate.wait === 'ryanmen')!;
  assert.ok(shanpon && sequenceWin);
  assert.equal(shanpon.decompositionId, sequenceWin.decompositionId);
  assertNoRole({ ...ambiguous, candidates: [shanpon] }, 'sanankou');
  assertRole({ ...ambiguous, candidates: [sequenceWin] }, 'sanankou', 2);
  for (const candidate of [shanpon, sequenceWin]) {
    const fu = calculateFu(candidate, { winMethod: 'ron', seatWind: 'east', roundWind: 'south' });
    assert.equal(fu.fuBreakdown.filter(entry => (entry.type === 'triplet' || entry.type === 'kan') && entry.concealed).length >= 3,
      candidatesWith({ ...ambiguous, candidates: [candidate] }, 'sanankou').length === 1);
  }
});

test('三暗刻 counts ankan and excludes open pon/kan', () => {
  const concealedKan = analyzeYaku(hand('222p', '333s', '456s', '55z'), context('6s', {
    isClosed: true, openMelds: [triplet('1m', { kan: true, concealed: true })],
  }));
  assertRole(concealedKan, 'sanankou', 2);

  for (const kan of [false, true]) {
    const open = analyzeYaku(hand('222p', '333s', '456s', '55z'), context('6s', {
      isClosed: false, openMelds: [triplet('1m', { kan, concealed: false })],
    }));
    assertNoRole(open, 'sanankou');
  }
});

test('三暗刻 stays in its decomposition and can combine with toitoi and sanshoku doukou', () => {
  const result = analyzeYaku(hand('111222333m', '444p', '11z'), context('1m'));
  const tripletShape = result.candidates.find(candidate => candidate.shape === 'standard' && candidate.decomposition.melds.every(m => m.type === 'triplet'))!;
  const sequenceShape = result.candidates.find(candidate => candidate.shape === 'standard' && candidate.decomposition.melds.some(m => m.type === 'sequence'))!;
  assert.ok(tripletShape && sequenceShape);
  assert.ok(tripletShape.yaku.some(yaku => yaku.id === 'sanankou'));
  assert.ok(tripletShape.yaku.some(yaku => yaku.id === 'toitoi'));
  assert.equal(sequenceShape.yaku.some(yaku => yaku.id === 'sanankou'), false);

  const combination = analyzeYaku(hand('111m', '111p', '111s', '999m', '55z'), context('1m'));
  const candidate = assertRole(combination, 'sanshoku-doukou', 2)[0];
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'sanankou'));
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'toitoi'));
});

test('二盃口 requires two pairs of sequences in a closed standard decomposition', () => {
  const result = analyzeYaku(hand('123m', '123m', '456m', '456m', '77z'), context('7z'));
  const candidate = assertRole(result, 'ryanpeikou', 3)[0];
  assertNoRole({ ...result, candidates: [candidate] }, 'iipeikou');

  const onePair = analyzeYaku(hand('123m', '123m', '456p', '789s', '55z'), context('5z'));
  assertNoRole(onePair, 'ryanpeikou');
  assertRole(onePair, 'iipeikou', 1);

  const fixed = analyzeYaku(hand('123m', '456m', '456m', '77z'), context('7z', {
    isClosed: false, openMelds: [sequence('123m')],
  }));
  assertNoRole(fixed, 'ryanpeikou');
  assertNoRole(fixed, 'iipeikou');

  const ankan = analyzeYaku(hand('123m', '123m', '456p', '77z'), context('7z', {
    isClosed: true, openMelds: [triplet('5z', { kan: true, concealed: true })],
  }));
  assertNoRole(ankan, 'ryanpeikou');
  assertRole(ankan, 'iipeikou', 1);
});

test('二盃口 handles four physically legal identical sequences and evaluates chiitoitsu separately', () => {
  const four = analyzeYaku(hand('123123123123m', '44z'), context('4z'));
  const candidate = assertRole(four, 'ryanpeikou', 3)[0];
  assertNoRole({ ...four, candidates: [candidate] }, 'iipeikou');
  assert.equal(candidate.decomposition.melds.length, 4);

  const ambiguous = analyzeYaku(hand('11223344556677m'), context('7m', { winMethod: 'tsumo' }));
  const sevenPairs = ambiguous.candidates.find(entry => entry.shape === 'seven-pairs')!;
  assert.ok(sevenPairs);
  assert.ok(candidatesWith(ambiguous, 'ryanpeikou').some(entry => entry.shape === 'standard'));
  assert.equal(sevenPairs.yaku.some(yaku => yaku.id === 'chiitoitsu'), true);
  assert.equal(sevenPairs.yaku.some(yaku => yaku.id === 'ryanpeikou' || yaku.id === 'iipeikou'), false);
});

test('小三元 requires two dragon sets and the third dragon as pair; dragon yakuhai still add', () => {
  const result = analyzeYaku(hand('123m', '456p', '555z', '666z', '77z'), context('3m'));
  const candidate = assertRole(result, 'shousangen', 2)[0];
  assert.equal(candidate.totalHan, 4);
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'yakuhai-white' && yaku.han === 1));
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'yakuhai-green' && yaku.han === 1));

  const wrongPair = analyzeYaku(hand('123m', '456p', '555z', '666z', '44z'), context('3m'));
  assertNoRole(wrongPair, 'shousangen');
  const allThreeSets = analyzeYaku(hand('555z', '666z', '777z', '111m', '44z'), context('1m'));
  assertNoRole(allThreeSets, 'shousangen');
  const bigDragonCandidate = candidatesWith(allThreeSets, 'daisangen')[0];
  assert.ok(bigDragonCandidate);
  assert.deepEqual(bigDragonCandidate.yaku.map(yaku => yaku.id), ['daisangen']);
});

test('小三元 counts open pon and kan without changing its own han', () => {
  for (const kan of [false, true]) {
    const result = analyzeYaku(hand('123m', '456p', '666z', '77z'), context('3m', {
      isClosed: false, openMelds: [triplet('5z', { kan })],
    }));
    const candidate = assertRole(result, 'shousangen', 2)[0];
    assert.equal(candidate.totalHan, 4);
    assert.equal(candidate.yaku.filter(yaku => yaku.id.startsWith('yakuhai-')).length, 2);
  }
});

test('混老頭 applies to terminal/honor standard and seven-pairs shapes, not middle tiles', () => {
  const standard = analyzeYaku(hand('111m', '999p', '111z', '555z', '77z'), context('1m'));
  const standardCandidate = assertRole(standard, 'honroutou', 2)[0];
  assert.ok(standardCandidate.yaku.some(yaku => yaku.id === 'toitoi'));
  assertNoRole(standard, 'chanta');
  assertNoRole(standard, 'junchan');

  const seven = analyzeYaku(hand('11m', '99p', '11s', '99s', '22z', '44z', '55z'), context('5z'));
  const pairCandidate = seven.candidates.find(candidate => candidate.shape === 'seven-pairs')!;
  assert.ok(pairCandidate);
  assertRole({ ...seven, candidates: [pairCandidate] }, 'honroutou', 2);
  assert.ok(pairCandidate.yaku.some(yaku => yaku.id === 'chiitoitsu'));

  const middle = analyzeYaku(hand('111m', '999p', '111z', '555z', '55m'), context('5m'));
  assertNoRole(middle, 'honroutou');

  const honorsOnly = analyzeYaku(hand('111z', '222z', '333z', '444z', '55z'), context('5z'));
  const honorsCandidate = honorsOnly.candidates.find(candidate => candidate.shape === 'standard')!;
  assert.deepEqual(honorsCandidate.yaku.map(yaku => yaku.id).sort(), ['daisuushii', 'suuankou', 'tsuuiisou']);
  assert.equal(honorsCandidate.yakumanCount, 3);
  assertNoRole(honorsOnly, 'honroutou');
  assertNoRole(honorsOnly, 'honitsu');
  assertNoRole(honorsOnly, 'chinitsu');
});

test('混全帯么九 has closed/open han and requires honors, an edge sequence, and a terminal pair', () => {
  const closed = analyzeYaku(hand('123m', '789p', '111s', '222z', '11m'), context('2m'));
  assertRole(closed, 'chanta', 2);
  assertNoRole(closed, 'junchan');

  const open = analyzeYaku(hand('789p', '111s', '222z', '11m'), context('8p', {
    isClosed: false, openMelds: [sequence('123m')],
  }));
  assertRole(open, 'chanta', 1);

  assertNoRole(analyzeYaku(hand('234m', '789p', '111s', '222z', '11m'), context('3m')), 'chanta');
  assertNoRole(analyzeYaku(hand('123m', '789p', '555s', '222z', '11m'), context('2m')), 'chanta');
  assertNoRole(analyzeYaku(hand('123m', '789p', '111s', '222z', '55m'), context('2m')), 'chanta');
  assertNoRole(analyzeYaku(hand('123m', '789p', '111s', '999m', '11p'), context('2m')), 'chanta');
  assertNoRole(analyzeYaku(hand('111m', '999p', '111z', '222z', '33z'), context('1m')), 'chanta');
});

test('純全帯么九 has closed/open han, rejects honors, and excludes chiitoitsu', () => {
  const closed = analyzeYaku(hand('123m', '789p', '111s', '999m', '11p'), context('2m'));
  assertRole(closed, 'junchan', 3);
  assertNoRole(closed, 'chanta');

  const open = analyzeYaku(hand('789p', '111s', '999m', '11p'), context('8p', {
    isClosed: false, openMelds: [sequence('123m')],
  }));
  assertRole(open, 'junchan', 2);

  const honor = analyzeYaku(hand('123m', '789p', '111s', '999m', '11z'), context('2m'));
  assertRole(honor, 'chanta', 2);
  assertNoRole(honor, 'junchan');

  const seven = analyzeYaku(hand('11m', '99p', '11s', '99s', '22z', '44z', '55z'), context('5z'));
  const pairCandidate = seven.candidates.find(candidate => candidate.shape === 'seven-pairs')!;
  assertNoRole({ ...seven, candidates: [pairCandidate] }, 'junchan');
  assertNoRole({ ...seven, candidates: [pairCandidate] }, 'chanta');
});

test('三色同刻 needs three same-rank triplets in one decomposition and accepts an open kan', () => {
  const result = analyzeYaku(hand('111m', '111p', '111s', '999m', '55z'), context('1m'));
  const candidate = assertRole(result, 'sanshoku-doukou', 2)[0];
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'toitoi'));
  assert.ok(candidate.yaku.some(yaku => yaku.id === 'sanankou'));

  const openKan = analyzeYaku(hand('111p', '111s', '999m', '55z'), context('5z', {
    isClosed: false, openMelds: [triplet('1m', { kan: true })],
  }));
  const openCandidate = assertRole(openKan, 'sanshoku-doukou', 2)[0];
  assert.ok(openCandidate.yaku.some(yaku => yaku.id === 'sanankou'));

  const sequences = analyzeYaku(hand('123m', '123p', '123s', '999m', '55z'), context('5z'));
  assertNoRole(sequences, 'sanshoku-doukou');
});

test('new yaku treat red fives as their normal tile kind and preserve caller inputs', () => {
  const tiles = hand('123m', '123m', '456m', '456m', '77z');
  const fiveIndex = tiles.findIndex(tile => tile.category === 'suited' && tile.suit === 'man' && tile.rank === 5);
  const baseline = analyzeYaku(tiles, context('7z'));
  assert.ok(candidatesWith(baseline, 'ryanpeikou').length > 0);
  tiles[fiveIndex] = redFive('man');
  const input = Object.freeze(tiles.map(Object.freeze));
  const ctx = Object.freeze(context('7z'));
  const snapshot = structuredClone({ input, ctx });
  const first = analyzeYaku(input, ctx);
  assert.deepEqual(analyzeYaku(input, ctx), first);
  assert.deepEqual({ input, ctx }, snapshot);
  assert.deepEqual(first, baseline);

  const tooMany = hand('1111m', '1m', '23p', '45s', '99z', '2p');
  assert.throws(() => analyzeYaku(tooMany, context('1m')), RangeError);
});

test('result labels include all seven additions', () => {
  const names: readonly [YakuId, string][] = [
    ['sanankou', '三暗刻'], ['ryanpeikou', '二盃口'], ['shousangen', '小三元'],
    ['honroutou', '混老頭'], ['chanta', '混全帯么九'], ['junchan', '純全帯么九'],
    ['sanshoku-doukou', '三色同刻'],
  ];
  for (const [id, name] of names) {
    assert.equal(yakuDisplayName(id), name);
  }
});

test('user ron uses 三暗刻, adds dora, and settles with honba/deposit conservation', () => {
  const initial = ronGame(1, [0], [['111m', '222p', '333s', '45s', '55z']], 'sou-6', false, 'sou-5');
  freeze(initial);
  inventory(initial, initial);
  const won = initial.phase === 'won' ? initial : declareRon(initial, 0);
  inventory(won, initial);
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected ron');
  const result = won.winResult.winners[0];
  assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'sanankou' && yaku.han === 2));
  assert.equal(result.yakuHan, 2);
  assert.equal(result.doraHan, 1);
  assert.equal(result.redDoraHan, 0);
  assert.equal(result.totalHanIncludingDora, 3);
  assert.equal(result.fu, 50);
  assert.equal(result.totalPoints, 6400);

  const match = { ...startMatch(initial), game: won, honba: 2,
    points: [24000, 25000, 25000, 25000] as const, depositSticks: 1 };
  const settled = settleRound(match);
  assert.equal(settled.lastSettlement?.deposits?.recipientId, 0);
  assert.equal(settled.lastSettlement?.deposits?.points, 1000);
  assert.equal(settled.lastSettlement?.payments.reduce((sum, payment) => sum + payment.honbaPoints, 0), 600);
  assertPointConservation(settled);
});

test('user and CPU tsumo use 三暗刻 through evaluateWin with dealer/child scoring', () => {
  const groups = ['111m', '222p', '333s', '55z', '456s'];
  const userGame = tsumoGame(groups, false, [], 'sou-8');
  freeze(userGame);
  const userWin = evaluateWin(userGame, 0, userGame.players[0].drawnTile!, 'tsumo')!;
  assert.ok(userWin.candidate.yaku.some(yaku => yaku.id === 'sanankou'));
  assert.equal(userWin.totalHanIncludingDora, userWin.yakuHan);
  assert.equal(userWin.fu, 40);
  assert.equal(userWin.totalPoints, 7800);
  const userWon = declareTsumo(userGame, 0);
  inventory(userWon, userGame);
  assert.equal(userWon.winResult?.winMethod, 'tsumo');

  for (const winner of [1, 2, 3] as const) {
    const cpuGame = cpuTsumoGame(winner, groups, 'sou-8');
    freeze(cpuGame);
    const cpuWin = evaluateWin(cpuGame, winner, cpuGame.players[winner].drawnTile!, 'tsumo')!;
    assert.ok(cpuWin.candidate.yaku.some(yaku => yaku.id === 'sanankou'));
    assert.equal(cpuWin.redDoraHan, 1);
    assert.equal(cpuWin.totalHanIncludingDora, 4);
    assert.equal(cpuWin.totalPoints, 8000);
    const cpuWon = declareTsumo(cpuGame, winner);
    inventory(cpuWon, cpuGame);
    assert.equal(cpuWon.winResult?.winMethod, 'tsumo');
  }
});

test('CPU ron and double ron keep each winner candidate-local', () => {
  const concealed = ['111m', '222p', '333s', '45s', '55z'];
  for (const winner of [1, 2, 3] as const) {
    const won = ronGame(0, [winner], [concealed], 'sou-6', false, 'sou-8');
    inventory(won, won);
    if (won.winResult?.winMethod !== 'ron') throw new Error('Expected CPU ron');
    const result = won.winResult.winners.find(candidate => candidate.winnerId === winner)!;
    assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'sanankou'));
    assert.equal(result.totalPoints, 3200);
  }

  const double = ronGame(1, [0, 2], [concealed, ['123m', '456p', '789s', '45s', '55m']], 'sou-6', false, 'sou-8');
  const won = declareRon(double, 0);
  inventory(won, double);
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected double ron');
  const first = won.winResult.winners.find(result => result.winnerId === 0)!;
  const second = won.winResult.winners.find(result => result.winnerId === 2)!;
  assert.ok(first.candidate.yaku.some(yaku => yaku.id === 'sanankou'));
  assert.equal(second.candidate.yaku.some(yaku => yaku.id === 'sanankou'), false);
});

test('二盃口 and 七対子 use separate evaluated candidates and select the highest score', () => {
  const game = tsumoGame(['11223344556677m'], false, [], 'sou-8');
  freeze(game);
  inventory(game, game);
  const result = evaluateWin(game, 0, game.players[0].drawnTile!, 'tsumo')!;
  assert.equal(result.candidate.shape, 'standard');
  assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'ryanpeikou' && yaku.han === 3));
  assert.equal(result.candidate.yaku.some(yaku => yaku.id === 'iipeikou'), false);
  assert.ok(result.analysis.candidates.some(candidate => candidate.shape === 'seven-pairs' && candidate.yaku.some(yaku => yaku.id === 'chiitoitsu')));
  assert.equal(result.totalHan, result.candidate.totalHan);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + result.doraHan + result.redDoraHan);
});

test('二盃口 combines with riichi, dora and red dora in scored candidates', () => {
  const initial = tsumoGame(['123m', '123m', '456m', '456m', '77z'], false, ['man'], 'man-4');
  const game = { ...initial, players: [
    { ...initial.players[0], riichi: { declarationTileId: 'past-discard', ippatsuEligible: false, doubleRiichi: false } },
    ...initial.players.slice(1),
  ] as unknown as typeof initial.players };
  const result = evaluateWin(game, 0, game.players[0].drawnTile!, 'tsumo')!;
  assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'ryanpeikou' && yaku.han === 3));
  assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'riichi'));
  assert.equal(result.doraCount, 2);
  assert.equal(result.redDoraCount, 1);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + result.doraHan + result.uraDoraHan + result.redDoraHan);
  assert.equal(result.totalHan, result.candidate.totalHan);
});
