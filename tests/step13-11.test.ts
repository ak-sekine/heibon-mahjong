import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeYaku, type WinningContext, type YakuId } from '../src/analysis/yaku.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { discardFromPlayer } from '../src/game/discard.ts';
import { evaluateWin } from '../src/game/win.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { canDeclareKyuushuKyuuhai } from '../src/game/special-draws.ts';
import { assertPointConservation, settleRound, startMatch, updateMatchGame } from '../src/game/match.ts';
import { GameController } from '../src/ui/controller.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey } from '../src/model/tile.ts';
import type { GameState, MatchState, PhysicalTile, PlayerId, PlayerState, TsumoResult } from '../src/model/game.ts';
import { yakuDisplayName } from '../src/rendering/table.ts';
import { inventory, transition } from './helpers.ts';
import { FIRST_TURN_HANDS, chiihouGame, chiihouSecondTurnGame, dealerSecondTurnGame, tenhouGame,
  type FirstTurnHand } from './step13-11-fixture.ts';

const yakuIds = (result: TsumoResult): YakuId[] => result.candidate.yaku.map(yaku => yaku.id);
const winningTsumo = (game: GameState, playerId: PlayerId): TsumoResult => {
  const result = declareTsumo(game, playerId).winResult;
  assert.ok(result && result.winMethod === 'tsumo');
  return result;
};
const tileKind = (key: string) => {
  const kind = TILE_KINDS.find(tile => tileKindKey(tile) === key);
  assert.ok(kind, `unknown tile ${key}`);
  return kind;
};
const faces = (hand: FirstTurnHand) => [...hand.hand, hand.draw].map(key => ordinaryTile(tileKind(key)));

function matchFor(game: GameState, points: readonly [number,number,number,number] = [25000,25000,25000,25000],
  depositSticks = 0, honba = 0, roundNumber = 1): MatchState {
  const match = { ...startMatch(game), points, depositSticks, honba, roundNumber, status: 'playing' as const, lastSettlement: null };
  assertPointConservation(match);
  return match;
}

function replaceTile(game: GameState, first: PhysicalTile, second: PhysicalTile): GameState {
  const swap = (tile: PhysicalTile) => tile.id === first.id ? second : tile.id === second.id ? first : tile;
  const players = game.players.map(player => ({
    ...player,
    hand: player.hand.map(swap),
    drawnTile: player.drawnTile ? swap(player.drawnTile) : null,
    river: player.river.map(swap),
    discardHistory: player.discardHistory?.map(swap),
    melds: player.melds?.map(meld => ({ ...meld, tiles: meld.tiles.map(swap) as typeof meld.tiles })),
  })) as unknown as GameState['players'];
  return { ...game, liveWall: game.liveWall.map(swap), deadWall: game.deadWall.map(swap), players };
}

test('親0〜3の配牌14枚で天和が成立し、通常役・翻数を加えない', () => {
  for (const playerId of [0,1,2,3] as const) {
    const game = tenhouGame(playerId);
    assert.equal(game.players[playerId].drawnTileSource, 'deal');
    assert.equal(canDeclareTsumo(game, playerId), true);
    inventory(game, game);
    const won = transition(game, game, state => declareTsumo(state, playerId));
    const result = won.winResult as TsumoResult;
    assert.deepEqual(yakuIds(result), ['tenhou']);
    assert.equal(result.yakumanCount, 1);
    assert.equal(result.totalHan, 0);
    assert.equal(result.totalHanIncludingDora, 0);
    assert.equal(result.doraHan, 0);
    assert.equal(result.uraDoraHan, 0);
    assert.equal(result.redDoraHan, 0);
    assert.equal(won.phase, 'won');
  }
});

test('配牌時のツモは既存操作から行え、不完全形や中盤のdeal偽装は拒否する', () => {
  const game = tenhouGame(0);
  const controller = new GameController(() => game, { wait: async () => {} });
  assert.equal(controller.canTsumo, true);
  controller.declareTsumo();
  assert.equal(controller.game.winResult?.winMethod, 'tsumo');
  assert.deepEqual(yakuIds(controller.game.winResult as TsumoResult), ['tenhou']);

  const incomplete = tenhouGame(0, { ...FIRST_TURN_HANDS.standard, draw: 'man-9' });
  assert.equal(canDeclareTsumo(incomplete, 0), false);
  assert.throws(() => declareTsumo(incomplete, 0), RangeError);

  const secondDraw = dealerSecondTurnGame();
  inventory(secondDraw, secondDraw);
  assert.equal(canDeclareTsumo(secondDraw, 0), true);
  assert.equal(yakuIds(winningTsumo(secondDraw, 0)).includes('tenhou'), false);
  const players = [...secondDraw.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[0] = { ...players[0], drawnTileSource: 'deal' };
  const forged = { ...secondDraw, players };
  assert.equal(canDeclareTsumo(forged, 0), false);
  inventory(forged, secondDraw);
});

test('天和状態にないdeal・手番・保留中のロンやリーチ・副露・カンでは配牌ツモを許さない', () => {
  const game = tenhouGame(0);
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  const states: readonly GameState[] = [
    { ...game, phase: 'awaiting-draw' },
    { ...game, turnPlayerId: 1 },
    { ...game, callsMade: true },
    { ...game, kanCount: 1 },
    { ...game, pendingRiichi: { playerId: 0, declarationTileId: 'pending' } },
    { ...game, ronWindow: { discarderId: 1, tileId: 'pending' } },
    { ...game, players: players.map(player => player.id === 1 ? { ...player, riichi: { declarationTileId: 'past' } } : player) as unknown as GameState['players'] },
  ];
  for (const state of states) assert.equal(canDeclareTsumo(state, 0), false);
  assert.equal(canDeclareTsumo({ ...game, dealerId: 1 }, 0), false);
});

test('CPU親は配牌で通常のツモを優先し、九種九牌より先に天和を宣言する', async () => {
  const game = tenhouGame(1, FIRST_TURN_HANDS.kokushi);
  assert.equal(canDeclareTsumo(game, 1), true);
  assert.equal(canDeclareKyuushuKyuuhai(game, 1), true);
  let match = startMatch(game);
  const runner = new AutomaticTurnRunner({ wait: async () => {} });
  await runner.runMatch(() => match, next => { match = next; });
  assert.equal(match.game.winResult?.winMethod, 'tsumo');
  assert.equal(match.lastSettlement?.reason, 'tsumo');
  assert.deepEqual(yakuIds(match.game.winResult as TsumoResult), ['tenhou', 'kokushi-musou']);
  inventory(match.game, game);
});

test('天和は国士無双・四暗刻・九蓮宝燈と同じ候補内で合算する', () => {
  const kokushi = winningTsumo(tenhouGame(0, FIRST_TURN_HANDS.kokushi), 0);
  assert.equal(kokushi.candidate.shape, 'thirteen-orphans');
  assert.deepEqual(yakuIds(kokushi), ['tenhou', 'kokushi-musou']);
  assert.equal(kokushi.yakumanCount, 2);
  assert.equal(kokushi.totalHan, 0);

  const suuankou = winningTsumo(tenhouGame(0, FIRST_TURN_HANDS.suuankou), 0);
  assert.deepEqual(yakuIds(suuankou), ['tenhou', 'suuankou']);
  assert.equal(suuankou.yakumanCount, 2);

  const chuuren = winningTsumo(tenhouGame(0, FIRST_TURN_HANDS.chuuren), 0);
  assert.deepEqual(yakuIds(chuuren), ['tenhou', 'chuuren-poutou']);
  assert.equal(chuuren.yakumanCount, 2);
});

test('七対子の天和は天和だけ、字一色七対子の地和は字一色と複合する', () => {
  const ordinary = winningTsumo(tenhouGame(0, FIRST_TURN_HANDS.sevenPairs), 0);
  assert.equal(ordinary.candidate.shape, 'seven-pairs');
  assert.deepEqual(yakuIds(ordinary), ['tenhou']);
  assert.equal(ordinary.totalHan, 0);

  const honors = winningTsumo(chiihouGame(1, FIRST_TURN_HANDS.honorsSevenPairs), 1);
  assert.equal(honors.candidate.shape, 'seven-pairs');
  assert.deepEqual(yakuIds(honors), ['chiihou', 'tsuuiisou']);
  assert.equal(honors.yakumanCount, 2);
  assert.equal(honors.totalHan, 0);
});

test('子1・2・3の第一ツモは地和になり、先行した通常打牌は条件を妨げない', () => {
  for (const playerId of [1,2,3] as const) {
    const game = chiihouGame(playerId);
    inventory(game, game);
    assert.equal(game.players[playerId].drawnTileSource, 'live-wall');
    assert.ok(game.players[0].discardHistory?.length);
    if (playerId === 3) {
      assert.equal(game.players[1].discardHistory?.length, 1);
      assert.equal(game.players[2].discardHistory?.length, 1);
    }
    assert.equal(canDeclareTsumo(game, playerId), true);
    const result = winningTsumo(game, playerId);
    assert.deepEqual(yakuIds(result), ['chiihou']);
    assert.equal(result.yakumanCount, 1);
    assert.equal(result.totalHan, 0);
  }
  assert.equal(canDeclareTsumo(tenhouGame(0), 0), true, 'the dealer has Tenhou, not Chiihou');
});

test('子の第二ツモでは地和にならず、同じ手牌の通常ツモは引き続き成立する', () => {
  const game = chiihouSecondTurnGame();
  inventory(game, game);
  assert.equal(game.players[1].discardHistory?.length, 1);
  assert.equal(game.players[1].drawnTileSource, 'live-wall');
  assert.equal(canDeclareTsumo(game, 1), true);
  const result = winningTsumo(game, 1);
  assert.equal(yakuIds(result).includes('chiihou'), false);
  assert.deepEqual(yakuIds(result), ['menzen-tsumo']);
});

test('鳴き・カン・成立済みリーチ後の第一ツモには地和を付けない', () => {
  const game = chiihouGame(1);
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  const variants: readonly GameState[] = [
    { ...game, callsMade: true },
    { ...game, kanCount: 1 },
    { ...game, players: players.map(player => player.id === 1 ? { ...player,
      riichi: { declarationTileId: 'past' } } : player) as unknown as GameState['players'] },
  ];
  for (const state of variants) {
    inventory(state, game);
    const result = evaluateWin(state, 1, state.players[1].drawnTile!, 'tsumo');
    assert.ok(result, 'ordinary closed-hand tsumo remains available');
    assert.equal(result.candidate.yaku.some(yaku => yaku.id === 'chiihou'), false);
  }
});

test('海底・嶺上・ロン・副露や相反する第一ツモフラグは不正な入力として拒否する', () => {
  const hand = faces(FIRST_TURN_HANDS.standard);
  const base: WinningContext = { winMethod: 'tsumo', winningTile: tileKind(FIRST_TURN_HANDS.standard.draw),
    seatWind: 'east', roundWind: 'east' };
  const invalid: readonly Partial<WinningContext>[] = [
    { tenhou: true, chiihou: true },
    { tenhou: true, winMethod: 'ron' },
    { chiihou: true, rinshan: true },
    { chiihou: true, haitei: true },
    { tenhou: true, houtei: true },
    { chiihou: true, riichi: true },
    { tenhou: true, isClosed: false, openMelds: [{}] as unknown as WinningContext['openMelds'] },
  ];
  for (const patch of invalid) {
    assert.throws(() => analyzeYaku(hand, { ...base, ...patch } as WinningContext), RangeError,
      `invalid flags ${JSON.stringify(patch)}`);
  }
  const ron = analyzeYaku(hand, { ...base, winMethod: 'ron' });
  assert.ok(ron.candidates.every(candidate => !candidate.yaku.some(yaku => yaku.id === 'tenhou' || yaku.id === 'chiihou')));
});

test('役満候補では一般役・ドラ・赤ドラを翻に加えない', () => {
  const game = tenhouGame(0);
  const red = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
    ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
  ])].find(tile => tile.tile.category === 'suited' && tile.tile.suit === 'man' && tile.tile.rank === 5 && tile.tile.isRed)!;
  const ordinary = game.players[0].hand.find(tile => tile.tile.category === 'suited' &&
    tile.tile.suit === 'man' && tile.tile.rank === 5 && !tile.tile.isRed)!;
  const redGame = replaceTile(game, red, ordinary);
  inventory(redGame, game);
  const result = winningTsumo(redGame, 0);
  assert.equal(result.redDoraCount, 1);
  assert.equal(result.redDoraHan, 0);
  assert.equal(result.doraHan, 0);
  assert.equal(result.uraDoraHan, 0);
  assert.equal(result.totalHan, 0);
  assert.equal(result.totalHanIncludingDora, 0);
});

test('天和・地和の表示名を概要と詳細で同じ表記にする', () => {
  assert.equal(yakuDisplayName('tenhou'), '天和');
  assert.equal(yakuDisplayName('chiihou'), '地和');
});

test('1・2・3役満の既存点数計算は親子別のツモ支払いを返す', () => {
  const score = (winnerId: PlayerId, dealerId: PlayerId, yakumanCount: number) => calculateScore({
    totalHanIncludingDora: 0, fu: null, yakumanCount, winnerId, dealerId, winMethod: 'tsumo',
  });
  assert.deepEqual(score(0,0,1).payments.map(payment => [payment.playerId,payment.points]), [[1,16000],[2,16000],[3,16000]]);
  assert.deepEqual(score(1,0,1).payments.map(payment => [payment.playerId,payment.points]), [[0,16000],[2,8000],[3,8000]]);
  assert.deepEqual(score(1,0,2).payments.map(payment => [payment.playerId,payment.points]), [[0,32000],[2,16000],[3,16000]]);
  assert.deepEqual(score(0,0,3).payments.map(payment => [payment.playerId,payment.points]), [[1,48000],[2,48000],[3,48000]]);
});

test('天和の本場・供託を既存精算で受け取り、親連荘と冪等性を保つ', () => {
  const game = tenhouGame(0);
  const won = declareTsumo(game, 0);
  const match = matchFor(game, [24000,25000,25000,25000], 1, 2);
  const settled = updateMatchGame(match, won);
  const settlement = settled.lastSettlement!;
  assert.deepEqual(settlement.payments.map(payment => [payment.payerId,payment.basePoints,payment.honbaPoints,payment.points]), [
    [1,16000,200,16200], [2,16000,200,16200], [3,16000,200,16200],
  ]);
  assert.deepEqual(settlement.deposits, { recipientId:0, points:1000 });
  assert.deepEqual(settlement.next, { roundWind:'east', roundNumber:1, dealerId:0, honba:3 });
  assert.equal(settlement.matchEnded, false);
  assert.equal(settled.depositSticks, 0);
  assert.equal(settled.points[0] - match.points[0], 49600);
  assertPointConservation(settled);
  assert.equal(settleRound(settled), settled);
});

test('地和＋国士無双は2役満の子支払いで親交代し、東4局の子和了で対局を終える', () => {
  const game = chiihouGame(1, FIRST_TURN_HANDS.kokushi);
  const result = winningTsumo(game, 1);
  assert.deepEqual(yakuIds(result), ['chiihou','kokushi-musou']);
  assert.equal(result.yakumanCount, 2);
  const settled = updateMatchGame(matchFor(game), declareTsumo(game, 1));
  assert.deepEqual(settled.lastSettlement!.payments.map(payment => [payment.payerId,payment.points]), [
    [0,32000], [2,16000], [3,16000],
  ]);
  assert.deepEqual(settled.lastSettlement!.next, { roundWind:'east', roundNumber:2, dealerId:1, honba:0 });
  assertPointConservation(settled);

  const eastFour = updateMatchGame(matchFor(game, [25000,25000,25000,25000], 0, 0, 4), declareTsumo(game, 1));
  assert.equal(eastFour.status, 'match-ended');
  assert.equal(eastFour.lastSettlement!.matchEnded, true);
  assert.equal(eastFour.lastSettlement!.next, null);
  assertPointConservation(eastFour);
});

test('親の東4局天和は連荘して次局へ進み、3役満の実手も候補内で合算する', () => {
  const game = dealerSecondTurnGame(FIRST_TURN_HANDS.honorsDaisangen, 2301);
  inventory(game, game);
  const result = winningTsumo(game, 0);
  assert.deepEqual(yakuIds(result).sort(), ['daisangen','suuankou','tsuuiisou'].sort());
  assert.equal(result.yakumanCount, 3);
  assert.equal(result.totalHan, 0);

  const firstDeal = tenhouGame(0, FIRST_TURN_HANDS.honorsDaisangen, 2302);
  const tenhou = winningTsumo(firstDeal, 0);
  assert.equal(tenhou.yakumanCount, 4, '天和 also combines with the same three existing yakuman');

  const eastFourGame = tenhouGame(0);
  const eastFour = updateMatchGame(matchFor(eastFourGame, [25000,25000,25000,25000], 0, 0, 4), declareTsumo(eastFourGame, 0));
  assert.equal(eastFour.status, 'round-ended');
  assert.deepEqual(eastFour.lastSettlement!.next, { roundWind:'east', roundNumber:4, dealerId:0, honba:1 });
  assertPointConservation(eastFour);
});

test('CPU子は第一ツモで地和を自動宣言する', async () => {
  const game = chiihouGame(1, FIRST_TURN_HANDS.standard);
  let match = startMatch(game);
  const runner = new AutomaticTurnRunner({ wait: async () => {} });
  await runner.runMatch(() => match, next => { match = next; });
  assert.equal(match.game.winResult?.winMethod, 'tsumo');
  assert.equal(match.lastSettlement?.reason, 'tsumo');
  assert.deepEqual(yakuIds(match.game.winResult as TsumoResult), ['chiihou']);
  assertPointConservation(match);
  inventory(match.game, game);
});
