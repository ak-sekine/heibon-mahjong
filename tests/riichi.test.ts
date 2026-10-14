import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRiichiDiscardOptions, canDeclareRiichi, declareRiichi } from '../src/game/riichi.ts';
import { discardTile, discardFromPlayer } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { canDeclareRon, declareRon, passRon } from '../src/game/ron.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { evaluateWin } from '../src/game/win.ts';
import { startMatch, updateMatchGame, assertPointConservation, nextRound, settleRound } from '../src/game/match.ts';
import { GameController } from '../src/ui/controller.ts';
import { tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { riichiStart } from './riichi-fixture.ts';
import { inventory, freeze } from './helpers.ts';
import { withRiverTile } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { fixedRound } from './match-fixture.ts';

function change(game: GameState, changes: Partial<PlayerState>): GameState {
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[0] = {...players[0],...changes}; return {...game,players};
}
function established(mode: Parameters<typeof riichiStart>[0] = 'ron', game = riichiStart(mode)) { return declareRiichi(startMatch(game),0,game.players[0].drawnTile!.id);
}
function humanDraw(mode: 'tsumo' | 'same-kind' = 'tsumo', initial = riichiStart(mode)) {
  let match = established(mode, initial);
  for(let i=0;i<3;i++) {
    let game = drawTile(match.game,match.game.turnPlayerId);
    game = discardTile(game,game.turnPlayerId,game.players[game.turnPlayerId].drawnTile!.id);
    match = updateMatchGame(match,game);
  }
  return updateMatchGame(match,drawTile(match.game,0));
}

test('options enumerate exact physical IDs in deterministic order, with shape-only waits', () => {
  const game=riichiStart(); freeze(game);
  const options=getRiichiDiscardOptions(game,0,25000);
  assert.ok(options.length); assert.deepEqual(options.map(o=>o.tileId),[...options.map(o=>o.tileId)].sort());
  for(const option of options) { assert.equal(option.waitKindCount,option.waitingTileKinds.length); assert.ok(option.waitKindCount>0); }
  assert.ok(canDeclareRiichi(game,0,game.players[0].drawnTile!.id,25000));
  const hand=game.players[0].hand;
  assert.equal(canDeclareRiichi(game,0,hand.find(t=>tileKindKey(t.tile)==='man-1')!.id,25000),false);
  const pair=hand.filter(t=>tileKindKey(t.tile)==='pin-2');
  // Both copies produce the same 13-tile shape, but separate physical options.
  assert.equal(options.some(o=>o.tileId===pair[0].id),options.some(o=>o.tileId===pair[1].id));
  assert.equal(canDeclareRiichi(game,0,'missing',25000),false);
});
for(const [points,allowed] of [[1000,true],[999,false],[0,false]] as const) test(`points boundary ${points}`,()=>{
  const game=riichiStart();assert.equal(canDeclareRiichi(game,0,game.players[0].drawnTile!.id,points),allowed);
});
for(const [count,allowed] of [[4,true],[3,false]] as const) test(`live wall boundary ${count} excludes dead wall`,()=>{
  const game={...riichiStart(),liveWall:riichiStart().liveWall.slice(0,count)};
  assert.equal(canDeclareRiichi(game,0,game.players[0].drawnTile!.id,25000),allowed);
});
for(const phase of ['awaiting-draw','awaiting-ron','won','wall-exhausted'] as const) test(`phase ${phase} rejects riichi`,()=>{
  const game={...riichiStart(),phase};assert.deepEqual(getRiichiDiscardOptions(game,0,25000),[]);
});
test('wrong turn, missing draw, existing riichi and active ron window reject options',()=>{
  const g=riichiStart();
  for(const game of [{...g,turnPlayerId:1 as const},change(g,{drawnTile:null}),change(g,{riichi:{declarationTileId:'old'}}),{...g,ronWindow:{discarderId:0 as const,tileId:'x'}}])
    assert.deepEqual(getRiichiDiscardOptions(game,0,25000),[]);
});
test('pure declaration establishes once and conserves 100000 points, including a zero balance',()=>{
  const g=riichiStart(); const before={...startMatch(g),points:[1000,49000,25000,25000] as const};freeze(before);
  const match=declareRiichi(before,0,g.players[0].drawnTile!.id);
  assert.deepEqual(match.points,[0,49000,25000,25000]);assert.equal(match.depositSticks,1);
  assert.equal(match.game.players[0].riichi?.declarationTileId,g.players[0].drawnTile!.id);
  assert.ok(match.game.players.slice(1).every(p=>p.riichi===null));assertPointConservation(match);inventory(match.game,g);
  assert.throws(()=>declareRiichi(match,0,g.players[0].drawnTile!.id),RangeError);
});
test('invalid declarations never change tiles, points or deposits; ended matches reject',()=>{
  const before=startMatch(riichiStart()); const snapshot=structuredClone(before);freeze(before);
  assert.throws(()=>declareRiichi(before,0,'missing'),RangeError);
  assert.throws(()=>declareRiichi({...before,status:'round-ended'},0,before.game.players[0].drawnTile!.id),RangeError);
  assert.throws(()=>declareRiichi(before,1,before.game.players[0].drawnTile!.id),RangeError);
  assert.deepEqual(before,snapshot);
});
test('fixed 136-tile wall: no-yaku tenpai, riichi-only ron, deposits and dealer continuation',()=>{
  const initial=riichiStart();let match=established('ron',initial); inventory(match.game,initial);
  let g=drawTile(match.game,1);const winning=g.players[1].drawnTile!;
  g=discardTile(g,1,winning.id);assert.equal(g.phase,'awaiting-ron');assert.ok(canDeclareRon(g,0));
  assert.equal(evaluateWin(change(g,{riichi:null}),0,winning,'ron'),null);
  const won=declareRon(g,0); match=updateMatchGame(match,won);inventory(won,initial);
  const result=won.winResult!;assert.equal(result.winMethod,'ron');if(result.winMethod!=='ron') return;
  assert.deepEqual(result.winners[0].candidate.yaku.map(y=>y.id),['double-riichi','ippatsu']);assert.equal(result.winners[0].yakuHan,3);
  assert.equal(match.lastSettlement?.deposits?.points,1000);assert.equal(match.depositSticks,0);assertPointConservation(match);
  assert.equal(match.points[0],25000+result.winners[0].totalPoints);
  assert.equal(settleRound(match),match);assert.equal(match.lastSettlement?.next?.dealerId,0);assert.equal(match.lastSettlement?.next?.honba,1);
  const next=nextRound(match);assert.ok(next.game.players.every(p=>p.riichi===null));assert.deepEqual(next.points,match.points);
});
test('fixed wall: declaration tile CPU ron rejects establishment and settles only the win',()=>{
  const g=riichiStart('declared-ron');const before=startMatch(g);freeze(before);
  assert.ok(canDeclareRiichi(g,0,g.players[0].drawnTile!.id,25000));
  const match=declareRiichi(before,0,g.players[0].drawnTile!.id);
  const ordinary=updateMatchGame(before,discardTile(g,0,g.players[0].drawnTile!.id));
  assert.deepEqual(match,ordinary);assert.equal(match.game.phase,'won');assert.equal(match.game.players[0].riichi,null);
  assert.equal(match.depositSticks,0);assert.equal(match.lastSettlement?.deposits,null);assert.equal(match.lastSettlement?.before[0],25000);
  assert.equal(settleRound(match),match);assertPointConservation(match);inventory(match.game,g);
});
test('other seats receive existing deposits or an established human riichi deposit',()=>{
  const g=riichiStart('declared-ron');const before={...startMatch(g),points:[24000,25000,25000,25000] as const,depositSticks:1};
  const match=declareRiichi(before,0,g.players[0].drawnTile!.id);
  assert.equal(match.lastSettlement?.deposits?.points,1000);assert.equal(match.lastSettlement?.deposits?.recipientId,1);assertPointConservation(match);
  const initial=riichiStart('cpu-tsumo');const ready=established('cpu-tsumo',initial);
  const drawn=drawTile(ready.game,1);assert.ok(canDeclareTsumo(drawn,1));
  const cpuWin=updateMatchGame(ready,declareTsumo(drawn,1));inventory(cpuWin.game,initial);
  assert.equal(cpuWin.lastSettlement?.deposits?.recipientId,1);assert.equal(cpuWin.lastSettlement?.deposits?.points,1000);
  assert.equal(cpuWin.depositSticks,0);assert.equal(cpuWin.game.players[1].riichi,null);assert.ok(cpuWin.game.players[0].riichi);assertPointConservation(cpuWin);
});
test('normal discard never declares riichi',()=>{
  const g=riichiStart();const m=updateMatchGame(startMatch(g),discardTile(g,0,g.players[0].drawnTile!.id));
  assert.equal(m.game.players[0].riichi,null);assert.equal(m.depositSticks,0);assert.equal(m.points[0],25000);
});
test('riichi tsumo adds menzen tsumo, red dora and ordinary dora through existing scoring',()=>{
  const initial=riichiStart('tsumo');const m=humanDraw('tsumo',initial);const g=m.game;assert.ok(canDeclareTsumo(g,0));assert.ok(g.players[0].riichi);
  const won=declareTsumo(g,0);const result=won.winResult!;assert.equal(result.winMethod,'tsumo');if(result.winMethod!=='tsumo')return;
  assert.deepEqual(result.candidate.yaku.map(y=>y.id),['double-riichi','ippatsu','menzen-tsumo']);assert.equal(result.yakuHan,4);assert.equal(result.redDoraCount,1);
  assert.equal(result.totalHanIncludingDora,result.yakuHan+result.doraCount+result.uraDoraHan+result.redDoraCount);
  const settled=updateMatchGame(m,won);assert.equal(settled.lastSettlement?.deposits?.points,1000);assertPointConservation(settled);inventory(won,initial);
});
test('direct APIs forbid hand replacement; only current physical draw may be discarded',()=>{
  const initial=riichiStart('same-kind');const m=humanDraw('same-kind',initial);const g=m.game;const p=g.players[0];
  assert.equal(tileKindKey(p.drawnTile!.tile),'man-5');assert.equal(p.drawnTile!.tile.isRed,true);
  const normal=p.hand.find(t=>tileKindKey(t.tile)==='man-5'&&!t.tile.isRed)!;assert.ok(normal);
  const snapshot=structuredClone(g);freeze(g);
  assert.throws(()=>discardTile(g,0,normal.id),RangeError);assert.throws(()=>discardFromPlayer(p,normal.id),RangeError);
  assert.deepEqual(g,snapshot);const next=discardTile(g,0,p.drawnTile!.id);assert.equal(next.players[0].river.at(-1)?.id,p.drawnTile!.id);
  assert.deepEqual(next.players[0].hand,p.hand);assert.deepEqual(next.players[0].riichi,{...p.riichi,ippatsuEligible:false});inventory(next,initial);
});
test('draw/discard preserve riichi and existing temporary furiten draw reset',()=>{
  const g=humanDraw().game;const next=discardTile(g,0,g.players[0].drawnTile!.id);assert.deepEqual(next.players[0].riichi,{...g.players[0].riichi,ippatsuEligible:false});
  let current=next;for(let i=0;i<3;i++){current=drawTile(current,current.turnPlayerId);current=discardTile(current,current.turnPlayerId,current.players[current.turnPlayerId].drawnTile!.id);}
  current=drawTile(change(current,{temporaryFuriten:true}),0);assert.equal(current.players[0].temporaryFuriten,false);assert.equal(current.players[0].riichi,next.players[0].riichi);
});
test('self-discard furiten blocks riichi ron but not riichi tsumo; temporary pass still works',()=>{
  let g=established().game;g=withRiverTile(g,0,'man-5');g=drawTile(g,1);g=discardTile(g,1,g.players[1].drawnTile!.id);assert.equal(canDeclareRon(g,0),false);
  let ron=drawTile(established().game,1);ron=discardTile(ron,1,ron.players[1].drawnTile!.id);const passed=passRon(ron,0);
  assert.equal(passed.players[0].temporaryFuriten,true);assert.ok(passed.players[0].riichi);
  const tsumo=withRiverTile(humanDraw().game,0,'man-5');assert.ok(canDeclareTsumo(tsumo,0));
});
test('draw carries deposits, next round clears riichi, new match resets all balances',()=>{
  const m=established();const exhausted=fixedRound(0,[0]);const game=change(exhausted,{riichi:m.game.players[0].riichi});
  const settled=updateMatchGame(m,game);assert.equal(settled.depositSticks,1);assertPointConservation(settled);
  const next=nextRound(settled);assert.equal(next.depositSticks,1);assert.deepEqual(next.points,settled.points);assert.ok(next.game.players.every(p=>p.riichi===null));assertPointConservation(next);
  const fresh=startMatch();assert.deepEqual(fresh.points,[25000,25000,25000,25000]);assert.equal(fresh.depositSticks,0);assert.equal(fresh.dealerId,0);assert.equal(fresh.roundNumber,1);assertPointConservation(fresh);
});
test('yakuman ignores riichi han and dora; non-riichi scoring unchanged',()=>{
  const g=tsumoGame(['19m','19p','19s','12345677z']);const plain=evaluateWin(g,0,g.players[0].drawnTile!,'tsumo')!;
  const withRiichi=evaluateWin(change(g,{riichi:{declarationTileId:'past'}}),0,g.players[0].drawnTile!,'tsumo')!;
  assert.deepEqual({...withRiichi,uraDoraCount:0},plain);assert.equal(withRiichi.totalPoints,48000);assert.equal(withRiichi.totalHanIncludingDora,0);
});
test('riichi can move a hand to mangan through the existing scoring API',()=>{
  const g=tsumoGame(['234m','345p','678s','222p','66m'],false,[],'man-5');
  const plain=evaluateWin(g,0,g.players[0].drawnTile!,'tsumo')!;
  const ready=evaluateWin(change(g,{riichi:{declarationTileId:'past'}}),0,g.players[0].drawnTile!,'tsumo')!;
  assert.equal(ready.yakuHan,plain.yakuHan+1);assert.equal(plain.scoreTier,'normal');assert.equal(ready.scoreTier,'mangan');
});
test('controller declaration/discard races are single-use; reset invalidates old CPU work',async()=>{
  const waits: (()=>void)[]=[];
  const ui=new GameController(()=>riichiStart('tsumo'),{wait:()=>new Promise(resolve=>waits.push(resolve))});
  ui.select(ui.game.players[0].drawnTile!.id);assert.ok(ui.canRiichi);const pending=ui.declareRiichi();
  const snapshot=structuredClone(ui.match);await ui.declareRiichi();await ui.confirm();assert.deepEqual(ui.match,snapshot);assert.equal(ui.match.depositSticks,1);
  ui.newGame();const fresh=ui.match;waits.forEach(resolve=>resolve());await pending;assert.equal(ui.match,fresh);assert.equal(ui.match.depositSticks,0);
});
test('controller normal discard prevents competing declaration',async()=>{
  const ui=new GameController(()=>riichiStart('tsumo'),{wait:async()=>{}});ui.select(ui.game.players[0].drawnTile!.id);
  const pending=ui.confirm();await ui.declareRiichi();await pending;assert.equal(ui.match.depositSticks,0);assert.equal(ui.game.players[0].riichi,null);
});
test('controller riichi hand cannot select; no selection is needed for tsumogiri',async()=>{
  const ui=new GameController(()=>riichiStart('tsumo'),{wait:async()=>{},chooseDiscard:p=>p.drawnTile!.id});
  ui.select(ui.game.players[0].drawnTile!.id);await ui.declareRiichi();assert.ok(ui.canTsumo);assert.ok(ui.canConfirm);assert.equal(ui.selectedTileId,null);
  ui.select(ui.game.players[0].hand[0].id);assert.equal(ui.selectedTileId,null);const draw=ui.game.players[0].drawnTile!;
  const pending=ui.confirm();assert.equal(ui.game.players[0].river.at(-1)?.id,draw.id);ui.newGame();await pending;
});

test('every physical tile of a winning fourteen-tile hand is a separate riichi option',()=>{
  const g=tsumoGame();const tiles=[...g.players[0].hand,g.players[0].drawnTile!];
  const options=getRiichiDiscardOptions(g,0,25000);assert.equal(options.length,14);
  assert.deepEqual(options.map(o=>o.tileId),tiles.map(t=>t.id).sort());
  const copies=tiles.filter(t=>tileKindKey(t.tile)==='pin-2');assert.equal(copies.length,3);
  for(const tile of copies) assert.ok(options.find(o=>o.tileId===tile.id)?.waitingTileKinds.some(k=>tileKindKey(k)==='pin-2'));
});

test('controller declaration ron cannot be charged or settled twice',async()=>{
  const ui=new GameController(()=>riichiStart('declared-ron'));ui.select(ui.game.players[0].drawnTile!.id);
  await ui.declareRiichi();const settled=ui.match;await ui.declareRiichi();await ui.confirm();
  assert.equal(ui.match,settled);assert.equal(ui.match.depositSticks,0);assert.equal(ui.match.game.players[0].riichi,null);assertPointConservation(ui.match);
});
