import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeYaku, type WinningContext, type YakuCandidate, type YakuId } from '../src/analysis/yaku.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { evaluateWin } from '../src/game/win.ts';
import { declareRon, getRonCandidates } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { settleRound, startMatch, assertPointConservation } from '../src/game/match.ts';
import type { PlayerState } from '../src/model/game.ts';
import { ordinaryTile, redFive, TILE_KINDS, tileKindKey, type Tile, type TileKind } from '../src/model/tile.ts';
import { yakuDisplayName } from '../src/rendering/table.ts';
import { freeze, inventory } from './helpers.ts';
import { ronGame } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
function kinds(group: string): TileKind[] {
  const suit = group.at(-1)! as keyof typeof starts;
  return [...group.slice(0, -1)].map(rank => TILE_KINDS[starts[suit] + Number(rank) - 1]);
}
function hand(...groups: string[]): Tile[] { return groups.flatMap(group => kinds(group).map(ordinaryTile)); }
function kind(code: string): TileKind { return kinds(code)[0]; }
function context(winningTile: string, extra: Partial<WinningContext> = {}): WinningContext {
  return { winMethod: 'ron', winningTile: kind(winningTile), seatWind: 'east', roundWind: 'south', ...extra };
}
function meld(code: string, extra: { kan?: boolean; concealed?: boolean } = {}): Extract<WinningMeld, { type: 'triplet' }> {
  return { type: 'triplet', tile: kind(code), ...extra };
}
function candidatesWith(result: ReturnType<typeof analyzeYaku>, id: YakuId): YakuCandidate[] {
  return result.candidates.filter(candidate => candidate.yaku.some(yaku => yaku.id === id));
}
function assertHasYakuman(result: ReturnType<typeof analyzeYaku>, id: YakuId): YakuCandidate[] {
  const candidates = candidatesWith(result, id);
  assert.ok(result.isWinningShape, 'fixture must be a legal winning shape');
  assert.ok(candidates.length > 0, `${id} missing from winning candidates`);
  for (const candidate of candidates) {
    assert.equal(candidate.yaku.find(yaku => yaku.id === id)?.yakuman, 1);
    assert.equal(candidate.totalHan, 0);
    assert.equal(candidate.yakumanCount, candidate.yaku.reduce((sum, yaku) => sum + yaku.yakuman, 0));
    assert.ok(candidate.yaku.every(yaku => yaku.yakuman === 1), 'yakuman candidate must exclude ordinary yaku');
  }
  return candidates;
}
function assertYakumanIds(candidate: YakuCandidate, ids: readonly YakuId[]): void {
  assert.deepEqual(candidate.yaku.map(yaku => yaku.id).sort(), [...ids].sort());
  assert.equal(candidate.yakumanCount, ids.length);
  assert.equal(candidate.totalHan, 0);
}
function assertNoYakuman(result: ReturnType<typeof analyzeYaku>, id: YakuId): void {
  assert.equal(candidatesWith(result, id).length, 0, `${id} should not be present`);
}
function oneStandard(result: ReturnType<typeof analyzeYaku>): YakuCandidate {
  const candidate = result.candidates.find(entry => entry.shape === 'standard');
  assert.ok(candidate, 'expected a standard winning decomposition');
  return candidate;
}

test('四暗刻: tsumo and ron tanki count four concealed sets, and suppress ordinary yaku', () => {
  const groups = ['111m', '222p', '333s', '444z', '55z'];
  const tsumo = analyzeYaku(hand(...groups), context('5z', { winMethod: 'tsumo' }));
  const tsumoCandidate = assertHasYakuman(tsumo, 'suuankou')[0];
  assertYakumanIds(tsumoCandidate, ['suuankou']);

  const tanki = analyzeYaku(hand(...groups), context('5z'));
  const tankiCandidate = assertHasYakuman(tanki, 'suuankou')[0];
  assert.equal(tankiCandidate.wait, 'tanki');
  assertYakumanIds(tankiCandidate, ['suuankou']);
  assert.equal(tankiCandidate.yaku.some(yaku => yaku.id === 'sanankou' || yaku.id === 'toitoi'), false);
});

test('四暗刻: ron shanpon is not concealed; ankan counts while open pon and kan do not', () => {
  const shanpon = analyzeYaku(hand('111m', '222p', '333s', '444z', '55z'), context('1m'));
  const shanponCandidate = oneStandard(shanpon);
  assert.equal(shanponCandidate.wait, 'shanpon');
  assertNoYakuman(shanpon, 'suuankou');
  assert.ok(shanponCandidate.yaku.some(yaku => yaku.id === 'sanankou'));
  assert.ok(shanponCandidate.yaku.some(yaku => yaku.id === 'toitoi'));

  const concealedKan = analyzeYaku(hand('222p', '333s', '444z', '55z'), context('5z', {
    isClosed: true, openMelds: [meld('1m', { kan: true, concealed: true })],
  }));
  assertYakumanIds(assertHasYakuman(concealedKan, 'suuankou')[0], ['suuankou']);

  for (const kan of [false, true]) {
    const open = analyzeYaku(hand('222p', '333s', '444z', '55z'), context('5z', {
      isClosed: false, openMelds: [meld('1m', { kan, concealed: false })],
    }));
    assertNoYakuman(open, 'suuankou');
  }
});

test('大三元 counts open pon and kan and excludes 小三元 and dragon yakuhai', () => {
  const closed = analyzeYaku(hand('555z', '666z', '777z', '123m', '55p'), context('3m'));
  const candidate = assertHasYakuman(closed, 'daisangen')[0];
  assertYakumanIds(candidate, ['daisangen']);

  for (const kan of [false, true]) {
    const open = analyzeYaku(hand('666z', '777z', '123m', '55p'), context('3m', {
      isClosed: false, openMelds: [meld('5z', { kan, concealed: false })],
    }));
    const openCandidate = assertHasYakuman(open, 'daisangen')[0];
    assertYakumanIds(openCandidate, ['daisangen']);
  }
  assertNoYakuman(analyzeYaku(hand('555z', '666z', '777p', '123m', '55p'), context('3m')), 'daisangen');
  const smallDragons = analyzeYaku(hand('555z', '666z', '111p', '123m', '77z'), context('3m'));
  assertNoYakuman(smallDragons, 'daisangen');
  assert.ok(oneStandard(smallDragons).yaku.some(yaku => yaku.id === 'shousangen'));
});

test('小四喜 and 大四喜 are exclusive; open wind sets and kans count', () => {
  const small = analyzeYaku(hand('111z', '222z', '333z', '44z', '123m'), context('3m'));
  const smallCandidate = assertHasYakuman(small, 'shousuushii')[0];
  assertYakumanIds(smallCandidate, ['shousuushii']);
  assertNoYakuman(small, 'daisuushii');

  const openSmall = analyzeYaku(hand('222z', '333z', '44z', '123m'), context('3m', {
    isClosed: false, openMelds: [meld('1z', { kan: true, concealed: false })],
  }));
  assertYakumanIds(assertHasYakuman(openSmall, 'shousuushii')[0], ['shousuushii']);

  const large = analyzeYaku(hand('111z', '222z', '333z', '444z', '55m'), context('5m'));
  assertNoYakuman(large, 'shousuushii');
  assertYakumanIds(assertHasYakuman(large, 'daisuushii')[0], ['daisuushii', 'suuankou']);

  const openLarge = analyzeYaku(hand('222z', '333z', '444z', '55m'), context('5m', {
    isClosed: false, openMelds: [meld('1z')],
  }));
  assertYakumanIds(assertHasYakuman(openLarge, 'daisuushii')[0], ['daisuushii']);
});

test('字一色 counts 七対子 and combines with 大三元 or 大四喜', () => {
  const sevenPairs = analyzeYaku(hand('11z', '22z', '33z', '44z', '55z', '66z', '77z'), context('7z'));
  const seven = sevenPairs.candidates.find(candidate => candidate.shape === 'seven-pairs');
  assert.ok(seven);
  assertYakumanIds(seven, ['tsuuiisou']);

  const dragons = analyzeYaku(hand('555z', '666z', '777z', '22z'), context('2z', {
    isClosed: false, openMelds: [meld('1z', { concealed: false })],
  }));
  assertYakumanIds(assertHasYakuman(dragons, 'daisangen')[0], ['daisangen', 'tsuuiisou']);

  const winds = analyzeYaku(hand('222z', '333z', '444z', '55z'), context('5z', {
    isClosed: false, openMelds: [meld('1z', { concealed: false })],
  }));
  assertYakumanIds(assertHasYakuman(winds, 'daisuushii')[0], ['daisuushii', 'tsuuiisou']);

  const mixed = analyzeYaku(hand('111z', '222z', '333z', '444z', '55m'), context('5m'));
  assertNoYakuman(mixed, 'tsuuiisou');
});

test('緑一色 accepts all green tile shapes without 發 and rejects forbidden tiles including red 5索', () => {
  const noGreenDragon = analyzeYaku(hand('234s', '234s', '234s', '666s', '88s'), context('8s'));
  const candidate = assertHasYakuman(noGreenDragon, 'ryuuiisou')[0];
  assertYakumanIds(candidate, ['ryuuiisou']);

  for (const groups of [
    ['111s', '333s', '444s', '666s', '88s'],
    ['222s', '333s', '444s', '555s', '88s'],
    ['222s', '333s', '444s', '777s', '88s'],
    ['222s', '333s', '444s', '999s', '88s'],
    ['555z', '333s', '444s', '666s', '88s'],
    ['111z', '333s', '444s', '666s', '88s'],
  ]) assertNoYakuman(analyzeYaku(hand(...groups), context('8s')), 'ryuuiisou');

  const redHand = hand('222s', '333s', '444s', '555s', '88s');
  const redFiveIndex = redHand.findIndex(tile => tile.category === 'suited' && tile.suit === 'sou' && tile.rank === 5);
  redHand[redFiveIndex] = redFive('sou');
  assertNoYakuman(analyzeYaku(redHand, context('8s')), 'ryuuiisou');
});

test('清老頭 requires only suited terminals and combines with 四暗刻', () => {
  const valid = analyzeYaku(hand('111m', '999m', '111p', '999p', '11s'), context('1s'));
  assertYakumanIds(assertHasYakuman(valid, 'chinroutou')[0], ['chinroutou', 'suuankou']);
  assertNoYakuman(analyzeYaku(hand('123m', '999m', '111p', '999p', '11s'), context('1s')), 'chinroutou');
  assertNoYakuman(analyzeYaku(hand('111z', '999m', '111p', '999p', '11s'), context('1s')), 'chinroutou');
});

test('九蓮宝燈 accepts all suits and each added rank, treats red 5 normally, and requires a closed standard hand', () => {
  for (const suit of ['m', 'p', 's'] as const) {
    for (let extra = 1; extra <= 9; extra++) {
      const ranks = `1112345678999${extra}${suit}`;
      const result = analyzeYaku(hand(ranks), context(`${extra}${suit}`));
      const candidate = assertHasYakuman(result, 'chuuren-poutou')[0];
      assert.equal(candidate.shape, 'standard');
      assertYakumanIds(candidate, ['chuuren-poutou']);
    }
  }

  const red = hand('11123456789995m');
  const five = red.findIndex(tile => tile.category === 'suited' && tile.suit === 'man' && tile.rank === 5);
  red[five] = redFive('man');
  assertYakumanIds(assertHasYakuman(analyzeYaku(red, context('5m')), 'chuuren-poutou')[0], ['chuuren-poutou']);

  const called = analyzeYaku(hand('234m', '456m', '789m', '22m'), context('2m', {
    isClosed: false, openMelds: [meld('1m', { concealed: false })],
  }));
  assertNoYakuman(called, 'chuuren-poutou');
  const ankan = analyzeYaku(hand('234m', '456m', '789m', '22m'), context('2m', {
    isClosed: true, openMelds: [meld('1m', { kan: true, concealed: true })],
  }));
  assertNoYakuman(ankan, 'chuuren-poutou');
  assertNoYakuman(analyzeYaku(hand('123m', '456m', '789m', '123p', '55m'), context('3p')), 'chuuren-poutou');
  assertNoYakuman(analyzeYaku(hand('123m', '456m', '789m', '123p', '55z'), context('3p')), 'chuuren-poutou');
});

test('役満 are counted once per winning candidate; ambiguous decompositions do not share yaku', () => {
  const three = analyzeYaku(hand('111z', '222z', '333z', '444z', '55z'), context('5z'));
  const threeCandidate = assertHasYakuman(three, 'daisuushii')[0];
  assertYakumanIds(threeCandidate, ['daisuushii', 'suuankou', 'tsuuiisou']);

  const ambiguous = analyzeYaku(hand('111222333m', '444p', '11z'), context('1z'));
  const triplet = ambiguous.candidates.find(candidate => candidate.shape === 'standard' &&
    candidate.decomposition.melds.every(m => m.type === 'triplet'));
  const sequence = ambiguous.candidates.find(candidate => candidate.shape === 'standard' &&
    candidate.decomposition.melds.some(m => m.type === 'sequence'));
  assert.ok(triplet && sequence);
  assertYakumanIds(triplet, ['suuankou']);
  assert.equal(sequence.yakumanCount, 0);
  assert.equal(sequence.yaku.some(yaku => yaku.yakuman > 0), false);
});

test('four concealed kans combine 四暗刻 and 四槓子; kokushi remains a dedicated single-yakuman candidate', () => {
  const kans = analyzeYaku(hand('55z'), context('5z', {
    isClosed: true,
    openMelds: [meld('1m', { kan: true, concealed: true }), meld('2p', { kan: true, concealed: true }),
      meld('3s', { kan: true, concealed: true }), meld('4z', { kan: true, concealed: true })],
  }));
  assertYakumanIds(assertHasYakuman(kans, 'suukantsu')[0], ['suukantsu', 'suuankou']);
  assert.equal(candidatesWith(kans, 'suukantsu').length, 1);

  const kokushi = analyzeYaku(hand('19m', '19p', '19s', '11234567z'), context('1z'));
  assert.equal(kokushi.candidates.length, 1);
  assert.equal(kokushi.candidates[0].shape, 'thirteen-orphans');
  assertYakumanIds(kokushi.candidates[0], ['kokushi-musou']);
});

test('役満 score payments support single, double and triple counts without fu or kazoe double counting', () => {
  const score = (winnerId: 0 | 1, dealerId: 0 | 1, method: 'ron' | 'tsumo', count: number) => calculateScore({
    totalHanIncludingDora: 0, fu: null, yakumanCount: count, winnerId, dealerId, winMethod: method,
    ...(method === 'ron' ? { discarderId: winnerId === 0 ? 1 : 0 } : {}),
  });
  assert.deepEqual(score(1, 0, 'ron', 1).payments, [{ playerId: 0, points: 32000 }]);
  assert.equal(score(0, 0, 'ron', 1).totalPoints, 48000);
  assert.deepEqual(score(1, 0, 'tsumo', 1).payments.map(payment => payment.points), [16000, 8000, 8000]);
  assert.deepEqual(score(0, 0, 'tsumo', 1).payments.map(payment => payment.points), [16000, 16000, 16000]);
  assert.deepEqual(score(1, 0, 'ron', 2).payments, [{ playerId: 0, points: 64000 }]);
  assert.deepEqual(score(1, 0, 'tsumo', 2).payments.map(payment => payment.points), [32000, 16000, 16000]);
  assert.equal(score(0, 0, 'tsumo', 2).totalPoints, 96000);
  assert.equal(score(1, 0, 'ron', 3).totalPoints, 96000);
  assert.equal(score(1, 0, 'ron', 3).scoreTier, 'yakuman');
});

test('user and CPU tsumo and ron use yakuman scoring; red and indicator dora do not alter yakuman totals', () => {
  const groups = ['555m', '222p', '333s', '444z', '66z'];
  const initial = tsumoGame(groups, false, ['man'], 'man-4');
  const sourceKind = tileKindKey(kind('4m'));
  const players = [...initial.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  const liveWall = [...initial.liveWall];
  const deadWall = [...initial.deadWall];
  const oldUra = deadWall[5];
  let source = false;
  for (const id of [1, 2, 3] as const) {
    const index = players[id].hand.findIndex(tile => tileKindKey(tile.tile) === sourceKind);
    if (index < 0) continue;
    const handTiles = [...players[id].hand];
    deadWall[5] = handTiles[index];
    handTiles[index] = oldUra;
    players[id] = { ...players[id], hand: handTiles };
    source = true;
    break;
  }
  if (!source) {
    const index = liveWall.findIndex(tile => tileKindKey(tile.tile) === sourceKind);
    assert.notEqual(index, -1);
    deadWall[5] = liveWall[index];
    liveWall[index] = oldUra;
    source = true;
  }
  assert.equal(source, true);
  players[0] = { ...players[0], riichi: {
    declarationTileId: players[0].river.at(-1)!.id, ippatsuEligible: false, doubleRiichi: false,
  } };
  const humanGame = { ...initial, liveWall, deadWall, players };
  const original = structuredClone(humanGame);
  freeze(humanGame);
  const humanResult = evaluateWin(humanGame, 0, humanGame.players[0].drawnTile!, 'tsumo')!;
  assert.equal(humanResult.yakumanCount, 1);
  assert.equal(humanResult.fu, null);
  assert.equal(humanResult.totalHan, 0);
  assert.ok(humanResult.doraCount > 0);
  assert.ok(humanResult.uraDoraCount > 0);
  assert.ok(humanResult.redDoraCount > 0);
  assert.equal(humanResult.doraHan, 0);
  assert.equal(humanResult.uraDoraHan, 0);
  assert.equal(humanResult.redDoraHan, 0);
  assert.equal(humanResult.totalHanIncludingDora, 0);
  assert.deepEqual(humanGame, original);
  const humanWon = declareTsumo(humanGame, 0);
  inventory(humanWon, humanGame);

  const cpuStart = cpuTsumoGame(1, ['111m', '222p', '333s', '444z', '55z'], 'man-9');
  const cpuResult = evaluateWin(cpuStart, 1, cpuStart.players[1].drawnTile!, 'tsumo')!;
  assert.equal(cpuResult.yakumanCount, 1);
  assert.equal(cpuResult.totalPoints, 32000);
  const cpuWon = declareTsumo(cpuStart, 1);
  inventory(cpuWon, cpuStart);

  const userRonStart = ronGame(1, [0], [['111m', '222p', '333s', '444z', '5z']], 'white', false, 'man-9');
  const userRon = userRonStart.phase === 'won' ? userRonStart : declareRon(userRonStart, 0);
  assert.equal(userRon.winResult?.winMethod, 'ron');
  if (userRon.winResult?.winMethod !== 'ron') throw new Error('Expected user ron');
  assert.equal(userRon.winResult.winners[0].yakumanCount, 1);
  assert.equal(userRon.winResult.winners[0].totalPoints, 32000);

  const cpuRon = ronGame(1, [2], [['111p', '222s', '333m', '666z', '5z']], 'white', false, 'man-9');
  assert.equal(cpuRon.winResult?.winMethod, 'ron');
  if (cpuRon.winResult?.winMethod !== 'ron') throw new Error('Expected CPU ron');
  assert.equal(cpuRon.winResult.winners[0].winnerId, 2);
  assert.equal(cpuRon.winResult.winners[0].yakumanCount, 1);
});

test('multiple ron settles yakuman independently with honba, deposit and point conservation', () => {
  const game = ronGame(1, [0, 2], [
    ['111m', '222p', '333s', '444z', '5z'],
    ['111p', '222s', '333m', '666z', '5z'],
  ], 'white', false, 'man-9');
  const candidates = getRonCandidates(game);
  assert.deepEqual(candidates.map(candidate => candidate.winnerId), [2, 0]);
  assert.deepEqual(candidates.map(candidate => candidate.yakumanCount), [1, 1]);
  const won = declareRon(game, 0);
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected multiple ron');
  assert.deepEqual(won.winResult.winners.map(winner => winner.totalPoints), [32000, 32000]);
  const match = { ...startMatch(game), game: won, honba: 2,
    points: [24000, 25000, 25000, 25000] as const, depositSticks: 1 };
  const settled = settleRound(match);
  assert.equal(settled.lastSettlement?.deposits?.recipientId, 2);
  assert.equal(settled.lastSettlement?.payments.reduce((sum, payment) => sum + payment.honbaPoints, 0), 1200);
  assertPointConservation(settled);
});

test('yaku names include all eight new yakuman in summary and details', () => {
  const names: readonly [YakuId, string][] = [
    ['suuankou', '四暗刻'], ['daisangen', '大三元'], ['tsuuiisou', '字一色'], ['ryuuiisou', '緑一色'],
    ['chinroutou', '清老頭'], ['shousuushii', '小四喜'], ['daisuushii', '大四喜'], ['chuuren-poutou', '九蓮宝燈'],
  ];
  for (const [id, name] of names) {
    assert.equal(yakuDisplayName(id), name);
  }
});
