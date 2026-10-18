import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTsumoPayments } from '../src/analysis/score.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { getCallOptions } from '../src/game/calls.ts';
import { getKanOptions } from '../src/game/kan.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { assertPointConservation, nextRound, settleRound, startMatch, updateMatchGame } from '../src/game/match.ts';
import { canDeclareRiichi, declareRiichi } from '../src/game/riichi.ts';
import { canDeclareRon, declareRon, getRonCandidates, getWaitingTileKinds, passRon } from '../src/game/ron.ts';
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai, getNagashiManganWinners, isFourWindsDraw } from '../src/game/special-draws.ts';
import { canDeclareTsumo } from '../src/game/tsumo.ts';
import { tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { GameController } from '../src/ui/controller.ts';
import { riichiStart } from './riichi-fixture.ts';
import { ronGame } from './ron-fixture.ts';
import { fixedRound } from './match-fixture.ts';
import { inventory } from './helpers.ts';
import { arrangedDeal, calledNagashiGame, childKokushiGame, childKyuushuGame, childKyuushuKanGame, eightOrphanGame, fourWindsGame, mixedDiscardNagashiGame, mixedFirstFourGame, nagashiGame, noDiscardHistoryGame, parentKyuushuGame, playerPonGame, sameKindHistoryMismatchGame } from './step13-10-fixture.ts';
import { startGame } from '../src/game/start.ts';

function withPlayer(game: GameState, id: PlayerId, update: (player: PlayerState) => PlayerState): GameState {
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[id] = update(players[id]);
  return { ...game, players };
}

function matchReadyFor(game: GameState, points?: readonly [number,number,number,number], depositSticks = 0, honba = 0) {
  return { ...startMatch(startGame()), game, points: points ?? [25000,25000,25000,25000], depositSticks, honba };
}

function roundFourRiichi(game: GameState, alreadyRiichi: number, doubleSeat?: PlayerId) {
  const players = game.players.map(player => player.id !== 0 && player.id <= alreadyRiichi
    ? { ...player, riichi: { declarationTileId: `past-${player.id}`, doubleRiichi: player.id === doubleSeat } }
    : player) as unknown as GameState['players'];
  const match = startMatch({ ...game, players });
  const points = [25000 - alreadyRiichi * 1000,25000,25000,25000] as [number,number,number,number];
  const ready = { ...match, points, depositSticks: alreadyRiichi };
  assertPointConservation(ready);
  return ready;
}

test('流し満貫 uses only outside discards and physical discard IDs', () => {
  const terminal = nagashiGame([0]);
  assert.deepEqual(getNagashiManganWinners(terminal), [0]);
  const honors = nagashiGame([0], tile => tile.tile.category === 'honor');
  assert.deepEqual(getNagashiManganWinners(honors), [0]);
  const { game:middle, initial:middleInitial } = mixedDiscardNagashiGame();
  inventory(middle,middleInitial);
  assert.equal(getNagashiManganWinners(middle).includes(0),false,'a single 2–8 discard disqualifies that player');

  const untracked = withPlayer(terminal, 0, player => ({ ...player, discardHistory: undefined }));
  assert.deepEqual(getNagashiManganWinners(untracked), []);
  const { game:sameFaceDifferentId, initial:sameFaceInitial } = sameKindHistoryMismatchGame();
  inventory(sameFaceDifferentId, sameFaceInitial);
  const missingHistoryTile = sameFaceDifferentId.players[0].discardHistory!.find(historyTile => !sameFaceDifferentId.players[0].river.some(tile => tile.id === historyTile.id))!;
  const riverReplacement = sameFaceDifferentId.players[0].river.find(tile => tileKindKey(tile.tile) === tileKindKey(missingHistoryTile.tile))!;
  assert.notEqual(riverReplacement.id, missingHistoryTile.id);
  assert.deepEqual(getNagashiManganWinners(sameFaceDifferentId), []);

  const { game:noDiscards, initial:noDiscardsInitial } = noDiscardHistoryGame();
  inventory(noDiscards, noDiscardsInitial);
  assert.equal(getNagashiManganWinners(noDiscards).includes(0),false,'the player with no discard is not a winner');
  for (const type of ['chi','pon','daiminkan'] as const) {
    const { game, initial } = calledNagashiGame(type);
    inventory(game, initial);
    assert.deepEqual(getNagashiManganWinners(game), [], `${type} removes the physical discard from the source river`);
  }
});

test('流し満貫 ignores own melds, tenpai and wind/phase outside ordinary exhaustive draws', () => {
  const base = parentKyuushuGame();
  const nagashi = nagashiGame([0]);
  const { game:withOwnPon, initial:ponBefore } = playerPonGame(nagashi, 0);
  inventory(withOwnPon, ponBefore);
  const before = withOwnPon.players[0].hand.length;
  assert.equal(before, 10);
  assert.deepEqual(getNagashiManganWinners(withOwnPon), [0]);
  assert.deepEqual(getNagashiManganWinners({ ...base, phase: 'awaiting-draw' }), []);
  assert.deepEqual(getNagashiManganWinners({ ...nagashiGame([0]), abortiveDraw: 'four-kans' }), []);
  assert.deepEqual(getNagashiManganWinners({ ...nagashiGame([0]), phase: 'won' }), []);
  assert.ok(base.players.every(player => player.discardHistory?.length === 0));
});

test('流し満貫 settles child and dealer payments, honba, deposits and dealer movement', () => {
  const childGame = nagashiGame([1]);
  const child = settleRound(matchReadyFor(childGame, [23000,25000,25000,25000], 2, 2));
  const childResult = child.lastSettlement!;
  assert.equal(childResult.reason, 'nagashi-mangan');
  assert.deepEqual(childResult.nagashiManganWinners, [1]);
  assert.equal(childResult.tenpai, null, 'Nagashi does not receive noten transfers');
  assert.deepEqual(childResult.payments.map(p => [p.payerId,p.recipientId,p.basePoints,p.honbaPoints,p.points]), [
    [0,1,4000,200,4200], [2,1,2000,200,2200], [3,1,2000,200,2200],
  ]);
  assert.deepEqual(childResult.deposits, { recipientId:1, points:2000 });
  assert.equal(child.depositSticks, 0);
  assert.deepEqual(childResult.next, { roundNumber:2, dealerId:1, honba:0 });
  assert.equal(childResult.matchEnded, false);
  assertPointConservation(child);
  assert.equal(settleRound(child), child, 'settlement is idempotent');
  inventory(childGame, childGame);

  const dealerGame = nagashiGame([0]);
  const dealer = settleRound(matchReadyFor(dealerGame, undefined, 0, 1));
  assert.deepEqual(dealer.lastSettlement!.payments.map(p => [p.payerId,p.recipientId,p.basePoints,p.honbaPoints,p.points]), [
    [1,0,4000,100,4100], [2,0,4000,100,4100], [3,0,4000,100,4100],
  ]);
  assert.deepEqual(dealer.lastSettlement!.next, { roundNumber:1, dealerId:0, honba:2 });
  assertPointConservation(dealer);
  assert.deepEqual(calculateTsumoPayments(2000, 1, 0), [{ playerId:0, points:4000 }, { playerId:2, points:2000 }, { playerId:3, points:2000 }]);
});

test('複数人の流し満貫は相互支払いを相殺し、供託は親から最も近い1人へ渡す', () => {
  const game = nagashiGame([1,2]);
  const settled = settleRound(matchReadyFor(game, [23000,25000,25000,25000], 2, 1));
  const result = settled.lastSettlement!;
  assert.deepEqual(result.nagashiManganWinners, [1,2]);
  assert.equal(result.payments.length, 6);
  assert.ok(result.payments.some(payment => payment.payerId === 1 && payment.recipientId === 2));
  assert.ok(result.payments.some(payment => payment.payerId === 2 && payment.recipientId === 1));
  assert.deepEqual(result.deposits, { recipientId:1, points:2000 });
  assert.deepEqual(result.next, { roundNumber:2, dealerId:1, honba:0 });
  assert.equal(result.after.reduce((sum,points)=>sum+points,0) + settled.depositSticks * 1000, 100000);
  assertPointConservation(settled);
  const next = nextRound(settled);
  assert.equal(next.roundNumber,2);
  assert.equal(next.dealerId,1);
  assert.equal(next.honba,0);
  assert.deepEqual(next.points,settled.points);
});

test('九種九牌: nine distinct orphan kinds are available on dealer deal and child first draw', () => {
  const parent = parentKyuushuGame(9);
  assert.equal(parent.players[0].drawnTileSource, 'deal');
  assert.equal(canDeclareKyuushuKyuuhai(parent,0), true);
  const child = childKyuushuGame(9);
  assert.equal(child.players[1].drawnTileSource, 'live-wall');
  assert.equal(child.turnPlayerId,1);
  assert.equal(canDeclareKyuushuKyuuhai(child,1), true);

  const eight = eightOrphanGame();
  const eightTiles = [...eight.players[0].hand,eight.players[0].drawnTile!];
  assert.equal(eightTiles.length,14);
  assert.equal(new Set(eightTiles.filter(tile => tile.tile.category === 'honor' || tile.tile.category === 'suited' && [1,9].includes(tile.tile.rank)).map(tile => tileKindKey(tile.tile))).size,8);
  assert.equal(canDeclareKyuushuKyuuhai(eight,0), false, 'three physical man-1 tiles plus its drawn copy count as one kind');
  assert.equal(canDeclareKyuushuKyuuhai(parentKyuushuGame(8),0), false);
});

test('九種九牌: declaration is optional, immediate, free and keeps point/dealer state', async () => {
  const game = parentKyuushuGame(9);
  const declared = declareKyuushuKyuuhai(game,0);
  assert.equal(declared.phase,'wall-exhausted');
  assert.equal(declared.abortiveDraw,'kyuushu-kyuuhai');
  assert.equal(declared.winResult,null);
  inventory(declared,game);
  const match = updateMatchGame(startMatch(game),declared);
  assert.equal(match.lastSettlement?.reason,'kyuushu-kyuuhai');
  assert.deepEqual(match.lastSettlement?.before,match.lastSettlement?.after);
  assert.equal(match.lastSettlement?.tenpai,null);
  assert.equal(match.lastSettlement?.payments.length,0);
  assert.equal(match.lastSettlement?.next?.dealerId,game.dealerId);
  assert.equal(match.lastSettlement?.next?.roundNumber,1);
  assert.equal(match.lastSettlement?.next?.honba,1);
  assertPointConservation(match);

  const controller = new GameController(()=>game,{wait:async()=>{}});
  controller.match = startMatch(game);
  assert.equal(controller.canKyuushuKyuuhai,true);
  controller.declareKyuushuKyuuhai();
  assert.equal(controller.match.lastSettlement?.reason,'kyuushu-kyuuhai');
  assert.equal(controller.canNextRound,true);
  await controller.nextRound();
  assert.equal(controller.match.status,'playing');
  assert.equal(controller.game.abortiveDraw,undefined);
  assert.deepEqual(controller.match.points,match.points);

  const noDeclare = discardTile(game,0,game.players[0].drawnTile!.id);
  assert.notEqual(noDeclare.phase,'wall-exhausted');
  assert.equal(startMatch(noDeclare).status,'playing');
});

test('九種九牌: prior discard, a call/kan, meld, pending window and wrong turn reject it', () => {
  const game = parentKyuushuGame(9);
  const discarded = discardTile(game,0,game.players[0].drawnTile!.id);
  assert.equal(canDeclareKyuushuKyuuhai(discarded,0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,turnPlayerId:1},0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,phase:'awaiting-draw'},0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,callsMade:true},0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,kanCount:1},0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,pendingRiichi:{playerId:0,declarationTileId:'pending'}},0),false);
  assert.equal(canDeclareKyuushuKyuuhai({...game,ronWindow:{discarderId:1,tileId:'pending'}},0),false);
  assert.equal(canDeclareKyuushuKyuuhai(playerPonGame(game,0).game,0),false);
  assert.equal(canDeclareKyuushuKyuuhai(playerPonGame(game,1).game,0),false);
  assert.throws(()=>declareKyuushuKyuuhai(parentKyuushuGame(8),0),RangeError);
  assert.throws(()=>declareKyuushuKyuuhai(game,1),RangeError);
});

test('CPU declares 九種九牌 before kan, riichi or discard, but tsumo remains first', async () => {
  const kyuushu = childKyuushuKanGame();
  assert.ok(canDeclareKyuushuKyuuhai(kyuushu,1));
  assert.ok(getKanOptions(kyuushu,1).some(option=>option.meld.type==='ankan'));
  assert.equal(canDeclareTsumo(kyuushu,1),false);
  let match = startMatch(kyuushu);
  const runner = new AutomaticTurnRunner({wait:async()=>{}});
  await runner.runMatch(()=>match,next=>{match=next;});
  assert.equal(match.lastSettlement?.reason,'kyuushu-kyuuhai');
  inventory(match.game,kyuushu);

  const kokushi = childKokushiGame();
  assert.ok(canDeclareTsumo(kokushi,1));
  assert.ok(canDeclareKyuushuKyuuhai(kokushi,1));
  let winningMatch = startMatch(kokushi);
  await runner.runMatch(()=>winningMatch,next=>{winningMatch=next;});
  assert.equal(winningMatch.game.winResult?.winMethod,'tsumo');
  assert.equal(winningMatch.lastSettlement?.reason,'tsumo');
  inventory(winningMatch.game,kokushi);
});

test('四風連打: each of the four winds aborts after exactly four first discards', () => {
  for (const wind of ['east','south','west','north'] as const) {
    const game = fourWindsGame(wind);
    assert.equal(game.phase,'wall-exhausted');
    assert.equal(game.abortiveDraw,'four-winds');
    assert.deepEqual(game.players.map(player => player.discardHistory?.length),[1,1,1,1]);
    assert.ok(game.players.every(player => tileKindKey(player.discardHistory![0].tile) === wind));
    assert.equal(game.callsMade,false);
    assert.deepEqual(getCallOptions(game,0),[],'the fourth matching wind cannot be called after aborting');
    inventory(game,game);
    const match = startMatch(game);
    assert.equal(match.lastSettlement?.reason,'four-winds');
    assert.equal(match.lastSettlement?.tenpai,null);
    assert.equal(match.lastSettlement?.payments.length,0);
    assert.deepEqual(match.lastSettlement?.before,match.lastSettlement?.after);
    assert.deepEqual(match.lastSettlement?.next,{roundNumber:1,dealerId:game.dealerId,honba:1});
    assertPointConservation(match);
  }
});

test('四風連打 rejects mixed winds, dragons, and any earlier call or kan', () => {
  const mixed = mixedFirstFourGame(['east','east','south','east']);
  assert.equal(mixed.abortiveDraw,undefined);
  assert.equal(isFourWindsDraw(mixed),false);
  const dragons = mixedFirstFourGame(['white','white','white','white']);
  assert.equal(dragons.abortiveDraw,undefined);
  assert.equal(isFourWindsDraw(dragons),false);

  const completed = fourWindsGame('east');
  const afterFourthWithoutAbort = { ...completed, phase:'awaiting-draw' as const, abortiveDraw:undefined };
  assert.equal(isFourWindsDraw(afterFourthWithoutAbort),true);
  assert.equal(isFourWindsDraw({ ...afterFourthWithoutAbort,callsMade:true }),false);
  assert.equal(isFourWindsDraw({ ...afterFourthWithoutAbort,kanCount:1 }),false);
});

test('ロン解決は鳴き・途中流局より前に行い、見逃し後も既存のフリテン処理を通る', () => {
  // A legal 136-tile hand cannot ron on the fourth matching wind: those four
  // discards consume all four physical copies. Verify the ordinary ron gate
  // separately, while the four-winds fixture above verifies its no-ron path.
  const ron = ronGame(3,[0]);
  assert.equal(ron.phase,'awaiting-ron');
  assert.ok(getRonCandidates(ron).some(candidate=>candidate.winnerId===0));
  assert.ok(canDeclareRon(ron,0));
  assert.equal(declareRon(ron,0).phase,'won');
  const passed = passRon(ron,0);
  assert.equal(passed.players[0].temporaryFuriten,true);
  assert.notEqual(passed.phase,'wall-exhausted');
});

test('四風連打 outranks an unconfirmed fourth riichi and does not collect its stick', () => {
  const hand = ['man-1','man-2','man-3','man-4','man-5','man-6','pin-7','pin-8','pin-9','white','white','white','man-3'];
  let successful: ReturnType<typeof startMatch> | null = null;
  let original: GameState | null = null;
  let initialDeal: GameState | null = null;
  for (let seed = 911; seed < 1111 && !successful; seed++) {
    const dealt = arrangedDeal({dealerId:1,handKinds:{0:hand},firstDrawKinds:{0:'east',1:'east',2:'east',3:'east'},seed});
    if (dealt.players.some(player => getWaitingTileKinds(player.hand.map(tile=>tile.tile)).some(kind=>tileKindKey(kind)==='east'))) continue;
    initialDeal = dealt;
    let match = startMatch(dealt);
    let failed = false;
    for (const id of [1,2,3] as const) {
      let game = match.game;
      if (game.phase === 'awaiting-draw') game = drawTile(game,id);
      if (game.phase !== 'awaiting-discard' || game.turnPlayerId !== id) { failed = true; break; }
      game = discardTile(game,id,game.players[id].drawnTile!.id);
      if (game.phase !== 'awaiting-draw') { failed = true; break; }
      match = updateMatchGame(match,game);
    }
    if (failed || match.status !== 'playing') continue;
    const game = drawTile(match.game,0);
    if (!canDeclareRiichi(game,0,game.players[0].drawnTile!.id,match.points[0])) continue;
    original = game;
    successful = declareRiichi(updateMatchGame(match,game),0,game.players[0].drawnTile!.id);
  }
  assert.ok(successful && original && initialDeal,'a valid tenpai last hand was arranged from the physical wall');
  assert.equal(successful.lastSettlement?.reason,'four-winds');
  assert.equal(successful.game.abortiveDraw,'four-winds');
  assert.equal(successful.game.players[0].riichi,null);
  assert.equal(successful.depositSticks,0);
  assert.deepEqual(successful.lastSettlement?.before,successful.lastSettlement?.after);
  inventory(successful.game,initialDeal);
  assertPointConservation(successful);
});

test('四家立直: the fourth formal single/double riichi charges once then aborts', () => {
  const initial = riichiStart('ron');
  const pending = roundFourRiichi(initial,3,1);
  const established = declareRiichi(pending,0,initial.players[0].drawnTile!.id);
  assert.equal(established.lastSettlement?.reason,'four-riichi');
  assert.equal(established.game.players.every(player=>player.riichi !== null),true);
  assert.equal(established.depositSticks,4);
  assert.equal(established.points[0],21000);
  assert.deepEqual(established.lastSettlement?.before,established.lastSettlement?.after);
  assert.equal(established.lastSettlement?.next?.roundNumber,1);
  assert.equal(established.lastSettlement?.next?.dealerId,established.dealerId);
  assert.equal(established.lastSettlement?.next?.honba,1);
  assertPointConservation(established);
  assert.equal(updateMatchGame(established,established.game),established,'a settled declaration cannot be charged twice');
  assert.throws(()=>declareRiichi(established,0,initial.players[0].drawnTile!.id),RangeError);
  const next = nextRound(established);
  assert.equal(next.depositSticks,4);
  assert.ok(next.game.players.every(player=>player.riichi===null));

  const three = declareRiichi(roundFourRiichi(initial,2,1),0,initial.players[0].drawnTile!.id);
  assert.equal(three.status,'playing');
  assert.equal(three.lastSettlement,null);
  assert.equal(three.depositSticks,3);
  assert.equal(three.game.players.filter(player=>player.riichi).length,3);
  assertPointConservation(three);
});

test('ロン on the fourth riichi declaration wins before charging its stick or making 四家立直', () => {
  const initial = riichiStart('declared-ron');
  const pending = roundFourRiichi(initial,3,2);
  const tileId = initial.players[0].drawnTile!.id;
  const settled = declareRiichi(pending,0,tileId);
  assert.equal(settled.lastSettlement?.reason,'ron');
  assert.equal(settled.game.players[0].riichi,null);
  const win = settled.game.winResult!;
  assert.equal(win.winMethod,'ron');
  if (win.winMethod !== 'ron') return;
  const payment = win.winners.flatMap(winner=>winner.payments).find(entry=>entry.playerId===0)!;
  assert.equal(settled.points[0],pending.points[0]-payment.points);
  assert.deepEqual(settled.lastSettlement?.deposits,{recipientId:win.winners[0].winnerId,points:3000});
  assert.equal(settled.depositSticks,0);
  assertPointConservation(settled);
});

test('ordinary exhaustive draw remains distinct and old states without histories cannot earn nagashi', () => {
  const game = fixedRound(0,[0]);
  assert.deepEqual(getNagashiManganWinners(game),[]);
  const match = startMatch(game);
  assert.equal(match.lastSettlement?.reason,'draw');
  assert.ok(match.lastSettlement?.tenpai?.[0]);
  assert.equal(match.lastSettlement?.payments.reduce((sum,payment)=>sum+payment.notenPoints,0),3000);
  assertPointConservation(match);
});

test('abortive draws carry deposits without noten moves and do not end East 4 by themselves', () => {
  const game = fourWindsGame('north');
  const match = settleRound(matchReadyFor(game,[24000,25000,25000,25000],1,3));
  assert.equal(match.lastSettlement?.reason,'four-winds');
  assert.deepEqual(match.lastSettlement?.before,match.lastSettlement?.after);
  assert.equal(match.depositSticks,1);
  assert.equal(match.lastSettlement?.next?.honba,4);
  assert.equal(match.lastSettlement?.next?.dealerId,match.dealerId);
  assert.equal(match.status,'round-ended');
  assertPointConservation(match);

  const last = { ...matchReadyFor(game,[24000,25000,25000,25000],1,0), roundNumber:4 };
  const final = settleRound(last);
  assert.equal(final.status,'round-ended');
  assert.equal(final.lastSettlement?.matchEnded,false);
  assert.equal(final.lastSettlement?.next?.roundNumber,4);
  assertPointConservation(final);
});
