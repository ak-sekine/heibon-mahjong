import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME_RULES, normalizeGameRules } from '../src/model/rules.ts';
import { declareCall, getCallOptions, resolveDiscardCalls } from '../src/game/calls.ts';
import { declareKan, getKanOptions } from '../src/game/kan.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { declareRon } from '../src/game/ron.ts';
import { startMatch, nextRound, updateMatchGame, settleRound, assertPointConservation } from '../src/game/match.ts';
import { applyOnlineGameAction, startOnlineGame, hydrateOnlineGame, OnlineGameRuleError } from '../src/online/game-engine.ts';
import { createPlayerGameView } from '../src/online/game-view.ts';
import type { OnlineGameSession, PlayerDecisionWindow } from '../src/online/game-view.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { kanGame } from './kan-fixture.ts';
import { ronGame } from './ron-fixture.ts';

const paoRules = { ...DEFAULT_GAME_RULES, pao: true };
type MeldSpec = NonNullable<Parameters<typeof kanGame>[0]['melds']>[PlayerId];

function discardWindow(game: GameState, discarderId: PlayerId): GameState {
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  const discarder = players[discarderId];
  const tile = discarder.drawnTile;
  if (!tile) throw new Error('Fixture draw is missing');
  players[discarderId] = { ...discarder, river: [tile], drawnTile: null, drawnTileSource: null };
  return { ...game, rules: paoRules, players, turnPlayerId: discarderId, phase: 'awaiting-call',
    ronWindow: { kind: 'discard', discarderId, tileId: tile.id } };
}

function callFixture(melds: MeldSpec, hand: readonly string[], discard: string): GameState {
  const game = kanGame({ hands: { 0: hand }, melds: { 0: melds }, draw: discard, turn: 3 });
  return discardWindow(game, 3);
}

function call(game: GameState, caller: PlayerId, type: string): GameState {
  const option = getCallOptions(game, caller).find(candidate => candidate.type === type);
  assert.ok(option, `expected legal ${type} call`);
  return declareCall(game, caller, option.id);
}

test('legacy GameRules v1-v4 safely normalize pao to OFF and v5 persists it', () => {
  for (const schemaVersion of [1, 2, 3, 4]) {
    const legacy = schemaVersion === 1 ? { schemaVersion, matchFormat: 'tonpu' } :
      schemaVersion === 2 ? { schemaVersion, matchFormat: 'tonpu', redDora: true, uraDora: true, ippatsu: true, kanDora: true } :
        schemaVersion === 3 ? { schemaVersion, matchFormat: 'tonpu', redDora: true, kuitan: true, uraDora: true, ippatsu: true, kanDora: true } :
          { ...DEFAULT_GAME_RULES, schemaVersion: 4 };
    assert.equal(normalizeGameRules(legacy).pao, false);
  }
  assert.equal(DEFAULT_GAME_RULES.pao, false);
  assert.equal(normalizeGameRules({ ...DEFAULT_GAME_RULES, pao: true }).pao, true);
});

test('大三元責任者は最後の三元牌ポンを許した打ち手で、無関係な前の鳴きでは記録しない', () => {
  const prior: NonNullable<MeldSpec> = [
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
  ];
  const unrelated = call(callFixture(prior, ['77z', '123m', '45p'], 'man-2'), 0, 'chi');
  assert.equal(unrelated.paoResponsibilities?.daisangen, undefined);

  const finalPon = call(callFixture(prior, ['77z', '123m', '45p'], 'red'), 0, 'pon');
  assert.equal(finalPon.paoResponsibilities?.daisangen, 3);
  assert.equal(finalPon.players[3].river.length, 0);
  assert.equal(finalPon.players[0].melds?.at(-1)?.fromPlayerId, 3);
});

test('CPUのポンも正式成立時に同じ責任者ロジックを使う', () => {
  const base = callFixture([
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
  ], ['77z', '123m', '45p'], 'red');
  const players = [...base.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[0] = { ...players[0], control: 'cpu' };
  const resolved = resolveDiscardCalls({ ...base, players, phase: 'awaiting-ron' });
  assert.equal(resolved.phase, 'awaiting-discard');
  assert.equal(resolved.paoResponsibilities?.daisangen, 3);
});

test('オンラインWorkerは確定したポンから責任者を決め、偽の責任情報と遅延再送を無視する', () => {
  const base = callFixture([
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
  ], ['77z', '123m', '45p'], 'red');
  const gamePlayers = base.players.map(player => ({ ...player, control: 'human' as const })) as GameState['players'];
  const game = { ...base, players: gamePlayers, rules: paoRules };
  const identities = [0, 1, 2, 3].map(seat => ({ seat: seat as PlayerId, name: `P${seat}`, control: 'human' as const, connected: true })) as OnlineGameSession['identities'];
  const started = startOnlineGame(identities, 0, () => 0.5, paoRules);
  const decision: PlayerDecisionWindow = { windowId: 'pao-call', type: 'call', openedAt: 1000, expiresAt: 31_000,
    baseGameRevision: 1, requiredSeats: [0], responses: { 0: 'pending' } };
  const session: OnlineGameSession = { ...started, gameRevision: 1, match: startMatch(game, paoRules), decision };
  const option = getCallOptions(game, 0).find(candidate => candidate.type === 'pon');
  assert.ok(option);
  const forged = { type: 'declare-call' as const, requestId: 'pao-call', expectedGameRevision: 1,
    windowId: decision.windowId, optionId: option.id,
    paoResponsibilities: { daisangen: 1 }, payments: [{ playerId: 1, points: 999_999 }] } as unknown as Parameters<typeof applyOnlineGameAction>[2];
  const applied = applyOnlineGameAction(session, 0, forged, new Set<PlayerId>([0]), 2000);
  assert.equal(applied.match.game.paoResponsibilities?.daisangen, 3);
  assert.deepEqual(applied.match.game.paoResponsibilityOrder, ['daisangen']);
  assert.equal(applied.match.game.players[0].melds?.at(-1)?.fromPlayerId, 3);
  assert.equal(applied.match.game.phase, 'awaiting-discard');
  assert.throws(() => applyOnlineGameAction(applied, 0, forged, new Set<PlayerId>([0]), 2001),
    error => error instanceof OnlineGameRuleError && error.code === 'stale_decision');
});

test('大三元の最後の三元牌大明槓は責任者を記録する', () => {
  const prior: NonNullable<MeldSpec> = [
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
  ];
  const called = call(callFixture(prior, ['777z', '123m', '2p'], 'red'), 0, 'daiminkan');
  assert.equal(called.paoResponsibilities?.daisangen, 3);
  assert.equal(called.players[0].melds?.at(-1)?.type, 'daiminkan');
});

test('大四喜は4種類目の風牌ポンだけで責任者を記録する', () => {
  const prior: NonNullable<MeldSpec> = [
    { type: 'pon', group: '111z', from: 1 }, { type: 'pon', group: '222z', from: 2 }, { type: 'pon', group: '333z', from: 1 },
  ];
  const called = call(callFixture(prior, ['44z', '12m'], 'north'), 0, 'pon');
  assert.equal(called.paoResponsibilities?.daisuushii, 3);
});

test('大四喜の4つ目の風牌大明槓も責任者を記録する', () => {
  const prior: NonNullable<MeldSpec> = [
    { type: 'pon', group: '111z', from: 1 }, { type: 'pon', group: '222z', from: 2 }, { type: 'pon', group: '333z', from: 1 },
  ];
  const called = call(callFixture(prior, ['444z', '1m'], 'north'), 0, 'daiminkan');
  assert.equal(called.paoResponsibilities?.daisuushii, 3);
  assert.equal(called.players[0].melds?.at(-1)?.type, 'daiminkan');
});

test('加槓と暗槓は既存の責任席を上書きせず、4つ目の暗槓・加槓は四槓子パオを作らない', () => {
  const kakan = kanGame({ hands: { 0: ['4z'] }, melds: { 0: [
    { type: 'daiminkan', group: '1111z' }, { type: 'daiminkan', group: '2222z' },
    { type: 'daiminkan', group: '3333z' }, { type: 'pon', group: '444z', from: 1 },
  ] }, draw: 'man-5', turn: 0 });
  const withPao = { ...kakan, rules: paoRules, paoResponsibilities: { daisangen: 2 as PlayerId } };
  const kakanOption = getKanOptions(withPao, 0).find(option => option.meld.type === 'kakan');
  assert.ok(kakanOption);
  const kakanResult = declareKan(withPao, 0, kakanOption.id);
  assert.equal(kakanResult.paoResponsibilities?.daisangen, 2);
  assert.equal(kakanResult.paoResponsibilities?.suukantsu, undefined);

  const ankan = kanGame({ hands: { 0: ['444z', '5m'] }, melds: { 0: [
    { type: 'daiminkan', group: '1111z' }, { type: 'daiminkan', group: '2222z' }, { type: 'daiminkan', group: '3333z' },
  ] }, draw: 'north', turn: 0 });
  const ankanOption = getKanOptions({ ...ankan, rules: paoRules }, 0).find(option => option.meld.type === 'ankan');
  assert.ok(ankanOption);
  const ankanResult = declareKan({ ...ankan, rules: paoRules }, 0, ankanOption.id);
  assert.equal(ankanResult.paoResponsibilities?.suukantsu, undefined);
});

test('四槓子は4つ目の大明槓だけで責任者を記録し、成立後の別結果に責任払いを作らない', () => {
  const base = [
    { type: 'daiminkan', group: '1111z', from: 1 }, { type: 'daiminkan', group: '2222z', from: 2 },
    { type: 'daiminkan', group: '3333z', from: 1 },
  ] as const;
  const called = call(callFixture(base, ['444z', '5m'], 'north'), 0, 'daiminkan');
  assert.equal(called.paoResponsibilities?.suukantsu, 3);

  const otherWin = declareRon({ ...ronGame(2, [0]), rules: paoRules,
    paoResponsibilities: { suukantsu: 3 as PlayerId } }, 0);
  assert.equal(otherWin.winResult?.yakumanBreakdown, undefined, 'unrelated ron cannot apply Suukantsu pao');
  const unrelatedResult = updateMatchGame(startMatch(otherWin, paoRules), otherWin);
  assert.deepEqual(unrelatedResult.lastSettlement?.payments.map(payment => payment.payerId), [2]);
  assertPointConservation(unrelatedResult);

  const distributed = kanGame({ hands: { 0: ['444z', '123m', '456p', '78s', '9s', '1s'] }, melds: {
    1: [{ type: 'ankan', group: '1111z' }], 2: [{ type: 'ankan', group: '2222z' }], 3: [{ type: 'ankan', group: '3333z' }],
  }, draw: 'north', turn: 3 });
  const distributedCall = call(discardWindow({ ...distributed, rules: paoRules }, 3), 0, 'daiminkan');
  assert.equal(distributedCall.kanCount, 4);
  assert.equal(distributedCall.paoResponsibilities?.suukantsu, undefined, 'another player’s first kan is not that player’s fourth kan');
});

function daisangenTsumo(withHonors = false): GameState {
  return kanGame({ hands: { 0: withHonors ? ['11z', '22z'] : ['12m', '22p'] },
    melds: { 0: [
      { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 }, { type: 'pon', group: '777z', from: 3 },
    ] }, draw: withHonors ? 'east' : 'man-3', turn: 0 });
}

test('大三元単独ツモは責任者が全額負担し、本場を加算し供託を一度だけ渡す', () => {
  const game = { ...daisangenTsumo(), rules: paoRules, paoResponsibilities: { daisangen: 3 as PlayerId } };
  const won = declareTsumo(game, 0);
  const match = updateMatchGame({ ...startMatch(game, paoRules), points: [24000, 25000, 25000, 25000], honba: 2, depositSticks: 1 }, won);
  assert.equal(match.lastSettlement?.payments.length, 1);
  assert.deepEqual(match.lastSettlement?.payments[0], { payerId: 3, recipientId: 0, basePoints: 48000, honbaPoints: 600, notenPoints: 0, points: 48600 });
  assert.deepEqual(match.lastSettlement?.deposits, { recipientId: 0, points: 1000 });
  assertPointConservation(match);
  assert.deepEqual(settleRound(match), match, 'a settled pao win must not be paid twice');
  assert.equal(nextRound(match).rules?.pao, true, 'the next round must retain the accepted host/local rule snapshot');
});

test('子の大三元ツモも役満総額を責任者が負担する', () => {
  const game = kanGame({ hands: { 1: ['12m', '22p'] }, melds: { 1: [
    { type: 'pon', group: '555z', from: 2 }, { type: 'pon', group: '666z', from: 3 }, { type: 'pon', group: '777z', from: 2 },
  ] }, draw: 'man-3', turn: 1 });
  const won = declareTsumo({ ...game, rules: paoRules, paoResponsibilities: { daisangen: 3 } }, 1);
  assert.equal(won.winResult?.totalPoints, 32000);
  assert.deepEqual(won.winResult?.payments, [{ playerId: 3, points: 32000 }]);
});

test('大三元＋字一色は責任対象分だけを責任者へ配賦し、対象外役満を通常精算する', () => {
  const game = { ...daisangenTsumo(true), rules: paoRules, paoResponsibilities: { daisangen: 3 as PlayerId } };
  const won = declareTsumo(game, 0);
  const match = updateMatchGame(startMatch(game, paoRules), won);
  const byPayer = Object.fromEntries(match.lastSettlement!.payments.map(payment => [payment.payerId, payment.basePoints]));
  assert.equal(won.winResult?.yakumanCount, 2);
  assert.deepEqual(byPayer, { 1: 16000, 2: 16000, 3: 64000 });
  assert.equal(won.winResult?.yakumanBreakdown?.find(item => item.yakuId === 'daisangen')?.responsiblePlayerId, 3);
  assert.equal(won.winResult?.yakumanBreakdown?.find(item => item.yakuId === 'tsuuiisou')?.responsiblePlayerId, undefined);
  assertPointConservation(match);
});

test('大四喜のダブル役満2倍分を全て責任払いし、対象役満ごとの責任者を分けて保存する', () => {
  const game = kanGame({ hands: { 0: ['5z'] }, melds: { 0: [
    { type: 'pon', group: '111z', from: 1 }, { type: 'pon', group: '222z', from: 2 },
    { type: 'pon', group: '333z', from: 3 }, { type: 'pon', group: '444z', from: 1 },
  ] }, draw: 'white', turn: 0 });
  const doubleRules = { ...paoRules, doubleYakuman: true };
  const won = declareTsumo({ ...game, rules: doubleRules, paoResponsibilities: { daisuushii: 3 } }, 0);
  assert.equal(won.winResult?.candidate.yaku.find(item => item.id === 'daisuushii')?.yakuman, 2);
  assert.equal(won.winResult?.yakumanCount, 3);
  assert.deepEqual(won.winResult?.yakumanBreakdown?.map(item => [item.yakuId, item.yakuman, item.responsiblePlayerId]),
    [['tsuuiisou', 1, undefined], ['daisuushii', 2, 3]]);
  const settled = updateMatchGame(startMatch(game, doubleRules), won);
  assert.deepEqual(settled.lastSettlement?.payments.map(item => [item.payerId, item.basePoints]), [[1, 16000], [2, 16000], [3, 112000]]);
  assertPointConservation(settled);
});

test('複数の責任対象役満は役ごとに責任者へ割り当て、同じ責任者の金額を集約する', () => {
  const game = kanGame({ hands: { 0: ['2z'] }, melds: { 0: [
    { type: 'daiminkan', group: '5555z', from: 1 }, { type: 'daiminkan', group: '6666z', from: 2 },
    { type: 'daiminkan', group: '7777z', from: 3 }, { type: 'daiminkan', group: '1111z', from: 1 },
  ] }, draw: 'south', turn: 0 });
  const responsibilities = { daisangen: 1 as PlayerId, suukantsu: 1 as PlayerId };
  const won = declareTsumo({ ...game, rules: paoRules, paoResponsibilities: responsibilities }, 0);
  assert.ok(won.winResult?.candidate.yaku.some(item => item.id === 'daisangen'));
  assert.ok(won.winResult?.candidate.yaku.some(item => item.id === 'suukantsu'));
  const settled = updateMatchGame(startMatch(game, paoRules), won);
  assert.deepEqual(settled.lastSettlement?.payments.map(item => [item.payerId, item.basePoints]), [[1, 112000], [2, 16000], [3, 16000]]);
  assertPointConservation(settled);

  const separate = declareTsumo({ ...game, rules: paoRules,
    paoResponsibilities: { daisangen: 1, suukantsu: 2 } }, 0);
  const separateResult = updateMatchGame(startMatch(game, paoRules), separate);
  assert.deepEqual(separateResult.lastSettlement?.payments.map(item => [item.payerId, item.basePoints]),
    [[1, 64000], [2, 64000], [3, 16000]]);
  assertPointConservation(separateResult);

  const earlierSuukantsu = { ...game, rules: paoRules,
    paoResponsibilities: { suukantsu: 2 as PlayerId, daisangen: 1 as PlayerId },
    paoResponsibilityOrder: ['suukantsu', 'daisangen'] as const };
  const orderedWin = declareTsumo(earlierSuukantsu, 0);
  const orderedSettlement = updateMatchGame({ ...startMatch(earlierSuukantsu, paoRules), honba: 1 }, orderedWin);
  assert.equal(orderedSettlement.lastSettlement?.payments.find(item => item.payerId === 2)?.honbaPoints, 300);
  assert.equal(orderedSettlement.lastSettlement?.payments.find(item => item.payerId === 1)?.honbaPoints, 0);
  assertPointConservation(orderedSettlement);
});

test('ロンは責任者と放銃者に役満分を均等配分し、責任者=放銃者なら全額を一度だけ請求する', () => {
  const base = kanGame({ hands: { 0: ['12m', '22p'] }, melds: { 0: [
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 }, { type: 'pon', group: '777z', from: 3 },
  ] }, draw: 'man-3', turn: 2 });
  const tile = base.players[2].drawnTile!;
  const players = [...base.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[2] = { ...players[2], river: [tile], drawnTile: null, drawnTileSource: null };
  const window = { ...base, rules: paoRules, players, phase: 'awaiting-ron' as const,
    ronWindow: { kind: 'discard' as const, discarderId: 2 as PlayerId, tileId: tile.id },
    paoResponsibilities: { daisangen: 3 as PlayerId } };
  const won = declareRon(window, 0);
  const match = updateMatchGame({ ...startMatch(window, paoRules), honba: 2 }, won);
  assert.deepEqual(match.lastSettlement?.payments.map(({ payerId, basePoints }) => [payerId, basePoints]), [[2, 24000], [3, 24000]]);
  assert.deepEqual(match.lastSettlement?.payments.map(({ payerId, honbaPoints }) => [payerId, honbaPoints]), [[2, 600], [3, 0]]);
  assertPointConservation(match);

  const same = { ...window, paoResponsibilities: { daisangen: 2 as PlayerId } };
  const sameWon = declareRon(same, 0);
  const sameMatch = updateMatchGame({ ...startMatch(same, paoRules), honba: 2 }, sameWon);
  assert.deepEqual(sameMatch.lastSettlement?.payments.map(({ payerId, basePoints }) => [payerId, basePoints]), [[2, 48000]]);
  assert.equal(sameMatch.lastSettlement?.payments[0].honbaPoints, 600);
  assertPointConservation(sameMatch);
});

test('子の大三元ロンでも責任対象役満を折半し、供託と本場を放銃者にだけ加算する', () => {
  const base = kanGame({ hands: { 0: ['12m', '22p'] }, melds: { 0: [
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 }, { type: 'pon', group: '777z', from: 3 },
  ] }, draw: 'man-3', turn: 2 });
  const tile = base.players[2].drawnTile!;
  const players = [...base.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[2] = { ...players[2], river: [tile], drawnTile: null, drawnTileSource: null };
  const window = { ...base, dealerId: 1 as PlayerId, rules: paoRules, players, phase: 'awaiting-ron' as const,
    ronWindow: { kind: 'discard' as const, discarderId: 2 as PlayerId, tileId: tile.id },
    paoResponsibilities: { daisangen: 3 as PlayerId } };
  const won = declareRon(window, 0);
  assert.equal(won.winResult?.winMethod, 'ron');
  const match = updateMatchGame({ ...startMatch(window, paoRules), points: [24500, 24500, 24500, 24500],
    honba: 1, depositSticks: 2 }, won);
  assert.deepEqual(match.lastSettlement?.payments.map(({ payerId, basePoints, honbaPoints }) => [payerId, basePoints, honbaPoints]),
    [[2, 16000, 300], [3, 16000, 0]]);
  assert.deepEqual(match.lastSettlement?.deposits, { recipientId: 0, points: 2000 });
  assertPointConservation(match);
});

test('四槓子単独は四つ目の大明槓責任者がツモ全額を負担し、他の槓では責任払いにしない', () => {
  const game = kanGame({ hands: { 0: ['5m'] }, melds: { 0: [
    { type: 'daiminkan', group: '1111m', from: 1 }, { type: 'daiminkan', group: '2222p', from: 2 },
    { type: 'daiminkan', group: '3333s', from: 3 }, { type: 'daiminkan', group: '4444m', from: 1 },
  ] }, draw: 'man-5', turn: 0 });
  const won = declareTsumo({ ...game, rules: paoRules, paoResponsibilities: { suukantsu: 3 } }, 0);
  assert.ok(won.winResult?.candidate.yaku.some(item => item.id === 'suukantsu'));
  assert.equal(won.winResult?.yakumanCount, 1);
  assert.deepEqual(won.winResult?.payments, [{ playerId: 3, points: 48000 }]);
  const settled = updateMatchGame(startMatch(game, paoRules), won);
  assert.deepEqual(settled.lastSettlement?.payments.map(item => [item.payerId, item.basePoints]), [[3, 48000]]);
  assertPointConservation(settled);
});

test('パオOFFは通常ツモ精算を変えず、ダブル大四喜の倍率は候補の2倍を保持する', () => {
  const offGame = { ...daisangenTsumo(), rules: { ...paoRules, pao: false }, paoResponsibilities: { daisangen: 3 as PlayerId } };
  const off = declareTsumo(offGame, 0);
  assert.equal(off.winResult?.yakumanBreakdown, undefined);
  assert.deepEqual(off.winResult?.payments.map(payment => payment.points), [16000, 16000, 16000]);

  const double = { ...DEFAULT_GAME_RULES, pao: true, doubleYakuman: true };
  assert.equal(normalizeGameRules(double).doubleYakuman, true);
});

test('オンラインWorker相当のsession JSON復元でもパオ責任者を保持し、ホスト確定ルールを維持する', () => {
  const identities = [0, 1, 2, 3].map(seat => ({ seat: seat as PlayerId, name: `P${seat}`, control: 'human' as const, connected: true })) as OnlineGameSession['identities'];
  const started = startOnlineGame(identities, 0, () => 0.5, paoRules);
  const called = call(callFixture([
    { type: 'pon', group: '555z', from: 1 }, { type: 'pon', group: '666z', from: 2 },
  ], ['77z', '123m', '45p'], 'red'), 0, 'pon');
  const session = { ...started, match: { ...started.match, game: called } };
  const restored = hydrateOnlineGame(JSON.stringify(session));
  assert.ok(restored);
  assert.equal(restored.match.rules?.pao, true);
  assert.equal(restored.match.game.paoResponsibilities?.daisangen, 3);
  assert.deepEqual(restored.match.game.paoResponsibilityOrder, ['daisangen']);
  const snapshot = createPlayerGameView(restored, 0, 'ABC234', new Set([0, 1, 2, 3]));
  assert.equal(snapshot.paoResponsibilities?.daisangen, 3, 'Worker snapshot should publish the established responsibility');
  const secondClientSnapshot = createPlayerGameView(restored, 2, 'ABC234', new Set([0, 1, 2, 3]));
  assert.deepEqual(secondClientSnapshot.paoResponsibilities, snapshot.paoResponsibilities,
    'all clients should receive the same authoritative responsibility');
  assert.deepEqual(secondClientSnapshot.paoResponsibilityOrder, snapshot.paoResponsibilityOrder,
    'all clients should receive the same responsibility order');
});
