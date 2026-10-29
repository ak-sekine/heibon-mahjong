import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMatch,settleRound,nextRound,rankPlayers,assertPointConservation,updateMatchGame } from '../src/game/match.ts';
import { fixedRound,fixedRon } from './match-fixture.ts';
import { startGame } from '../src/game/start.ts';
import { GameController } from '../src/ui/controller.ts';
import { inventory,freeze,seeded } from './helpers.ts';
import type { PlayerId } from '../src/model/game.ts';
import type { Points } from '../src/model/match.ts';
for(const ready of [[],[0],[0,2],[0,1,2],[0,1,2,3]] as readonly (readonly PlayerId[])[])test(`draw ${ready.length} tenpai: noten transfers and immutable inventory`,()=>{
 const game=fixedRound(0,ready);inventory(game,game);const snapshot=structuredClone(game);freeze(game);
 const match=startMatch(game);const n=ready.length;const expected=[0,1,2,3].map(id=>25000+(!n || n===4 ? 0 : ready.includes(id as PlayerId) ? 3000/n : -3000/(4-n)));
 assert.deepEqual(match.points,expected);assert.deepEqual(match.lastSettlement!.tenpai,[0,1,2,3].map(id=>ready.includes(id as PlayerId)));
 assert.equal(match.lastSettlement!.payments.reduce((sum,p)=>sum+p.notenPoints,0),!n || n===4 ? 0 : 3000);assert.equal(settleRound(match),match);assertPointConservation(match);assert.deepEqual(game,snapshot);
 assert.equal(match.lastSettlement!.next!.honba,1);assert.equal(match.lastSettlement!.next!.roundNumber,ready.includes(0)?1:2);
});
test('furiten and no-yaku waits count as tenpai; draw deposits carry over',()=>{
 let game=fixedRound(0,[0]);game={...game,players:game.players.map(p=>({...p,temporaryFuriten:true})) as typeof game.players};
 const match=settleRound({...startMatch(),game,points:[24000,25000,25000,25000] as Points,depositSticks:1});assert.equal(match.lastSettlement!.tenpai![0],true);assert.equal(match.depositSticks,1);assert.equal(match.lastSettlement!.deposits,null);assertPointConservation(match);
});
for(const roundNumber of [1,2,3,4]) for(const scenario of ['dealer-win','child-win','dealer-tenpai','dealer-noten','double-dealer','double-child'] as const)test(`east ${roundNumber}: ${scenario}`,()=>{
 const game=scenario==='dealer-win'?fixedRon(0,[0]):scenario==='child-win'?fixedRon(0,[1]):scenario==='double-dealer'?fixedRon(0,[0,2]):scenario==='double-child'?fixedRon(0,[1,2]):fixedRound(0,scenario==='dealer-tenpai'?[0]:[1]);
 const repeat=['dealer-win','dealer-tenpai','double-dealer'].includes(scenario);const isDraw=game.phase==='wall-exhausted';
 const match=settleRound({...startMatch(),game,roundNumber,honba:2});assert.equal(match.status,!repeat&&roundNumber===4?'match-ended':'round-ended');
 if(match.lastSettlement!.next){assert.equal(match.lastSettlement!.next.roundNumber,roundNumber+Number(!repeat));assert.equal(match.lastSettlement!.next.dealerId,repeat?0:1);assert.equal(match.lastSettlement!.next.honba,isDraw||repeat?3:0);}
 else {assert.equal(nextRound(match),match);assert.equal(match.lastSettlement!.matchEnded,true);}
});
test('new round keeps points/deposits, rebuilds inventory, resets rivers/furiten/results and winds',()=>{
 const ended=startMatch(fixedRound(0,[1]));const next=nextRound(ended,id=>startGame(seeded(29),id));
 assert.equal(next.points,ended.points);assert.equal(next.roundNumber,2);assert.equal(next.dealerId,1);assert.equal(next.honba,1);assert.equal(next.roundWind,'east');assert.deepEqual(next.game.players.map(p=>p.wind),['north','east','south','west']);
 assert.ok(next.game.players.every(p=>!p.temporaryFuriten&&p.river.length===0&&p.hand.length===13));assert.equal(next.game.winResult,null);assert.equal(next.game.ronWindow,null);assert.equal(next.lastSettlement,null);assert.equal(next.game.deadWall.length,14);assert.equal(next.game.liveWall.length,69);inventory(next.game,next.game);assert.equal(nextRound(next),next);
});
test('next round forbidden during play and ron window',()=>{
 const match=startMatch();assert.equal(nextRound(match),match);const waiting={...match,game:{...match.game,phase:'awaiting-ron' as const}};assert.equal(nextRound(waiting),waiting);
});
test('wrong next dealer factory rejected',()=>assert.throws(()=>nextRound(startMatch(fixedRon(0,[1])),()=>startGame()),RangeError));
test('points descending, ties by smaller PlayerId',()=>assert.deepEqual(rankPlayers({...startMatch(),points:[25000,30000,30000,15000]}),[{playerId:1,points:30000,rank:1},{playerId:2,points:30000,rank:2},{playerId:0,points:25000,rank:3},{playerId:3,points:15000,rank:4}]));
test('dealer consecutive wins increment honba',()=>{
 let match=startMatch(fixedRon(0,[0]));for(let i=1;i<=3;i++){assert.equal(match.lastSettlement!.next!.honba,i);match=updateMatchGame(nextRound(match),fixedRon(0,[0]));}
});
test('fixed complete east match: seven rounds to rankings',()=>{
 let match=startMatch();const steps=[
  {game:fixedRon(0,[0]),next:[1,0,1]},
  {game:fixedRon(0,[1]),next:[2,1,0]},
  {game:fixedRound(1,[1,2]),next:[2,1,1]},
  {game:fixedRound(1,[0]),next:[3,2,2]},
  {game:fixedRon(2,[0]),next:[4,3,0]},
  {game:fixedRon(3,[3],2),next:[4,3,1]},
  {game:fixedRon(3,[0],2),next:null},
 ];
 for(const step of steps){inventory(step.game,step.game);match=updateMatchGame(match,step.game);assertPointConservation(match);assert.deepEqual(match.lastSettlement!.after,match.points);
  if(step.next){const n=match.lastSettlement!.next!;assert.deepEqual([n.roundNumber,n.dealerId,n.honba],step.next);match=nextRound(match,id=>startGame(seeded(73),id));}
 }
 assert.equal(match.status,'match-ended');assert.deepEqual(match.points,[41000,29700,15500,13800]);
 assert.deepEqual(rankPlayers(match).map(p=>p.playerId),[0,1,2,3]);assert.equal(nextRound(match),match);
});
test('CPU tsumo callback settles once, old wait cannot overwrite a reset',async()=>{
 let release: (()=>void)|undefined;const ui=new GameController(undefined,{randomizeSeating:false,wait:()=>new Promise<void>(r=>release=r)});
 ui.select(ui.game.players[0].drawnTile!.id);const old=ui.confirm();assert.ok(release);ui.newGame();const match=ui.match;release!();await old;assert.equal(ui.match,match);assert.equal(ui.match.lastSettlement,null);assert.deepEqual(ui.match.points,[25000,25000,25000,25000]);
});
test('next round double click and reset invalidate previous CPU generation',async()=>{
 let release: (()=>void)|undefined;const ui=new GameController(undefined,{randomizeSeating:false,wait:()=>new Promise<void>(r=>release=r)});ui.match=startMatch(fixedRon(0,[1]));const old=ui.nextRound();assert.equal(ui.game.dealerId,1);assert.ok(release);const game=ui.game;await ui.nextRound();assert.equal(ui.game,game);ui.newGame();const match=ui.match;release!();await old;assert.equal(ui.match,match);assert.equal(ui.game.dealerId,0);
});
test('ended match ignores subsequent game updates and retains final ranking',()=>{
 const match=settleRound({...startMatch(),roundNumber:4,game:fixedRon(0,[1])});assert.equal(updateMatchGame(match,startGame()),match);assert.equal(nextRound(match),match);
});

test('CPU chiihou settlement once, double human confirmation and delayed completion safe',async()=>{
 const {cpuTsumoStart}=await import('./cpu-tsumo-fixture.ts');let notifications=0;
 const ui=new GameController(()=>cpuTsumoStart(1),{wait:async()=>{},onChange:()=>notifications++});
 ui.select(ui.game.players[0].drawnTile!.id);const run=ui.confirm();await ui.confirm();await run;
 assert.deepEqual(ui.match.points,[9000,57000,17000,17000]);const settled=ui.match;assert.equal(settleRound(settled),settled);assert.deepEqual(settled.lastSettlement!.after,settled.points);assert.ok(notifications>0);assert.equal(ui.match.status,'round-ended');
});
test('human ron double declaration cannot pay twice',async()=>{
 const {scoringGame}=await import('./scoring-fixture.ts');const ui=new GameController(()=>scoringGame('ron-parent'));ui.declareRon();const settled=ui.match;assert.throws(()=>ui.declareRon(),RangeError);assert.equal(ui.match,settled);assert.deepEqual(settled.points,[30800,19200,25000,25000]);
});
test('human tsumo double declaration cannot pay twice',async()=>{
 const {scoringGame}=await import('./scoring-fixture.ts');const ui=new GameController(()=>scoringGame('pinfu-parent'));ui.declareTsumo();const settled=ui.match;ui.declareTsumo();assert.equal(ui.match,settled);assert.deepEqual(settled.points,[27100,24300,24300,24300]);
});
test('automatic live-wall exhaustion settles once and next round clears draw',async()=>{
 const {AutomaticTurnRunner}=await import('../src/game/automatic-turns.ts');let match=startMatch();const ended=fixedRound(0,[0,2]);
 match={...match,game:{...ended,phase:'awaiting-draw'}};
 const runner=new AutomaticTurnRunner({wait:async()=>{}});await runner.run(()=>match.game,game=>{match=updateMatchGame(match,game);});
 assert.equal(match.game.phase,'wall-exhausted');assert.deepEqual(match.points,[26500,23500,26500,23500]);const settled=match;await runner.run(()=>match.game,game=>{match=updateMatchGame(match,game);});assert.equal(match,settled);assert.equal(nextRound(match).lastSettlement,null);
});

test('waits without any supported ron yaku still count as draw tenpai',async()=>{
 const {getWaitingTileKinds}=await import('../src/game/ron.ts');const {analyzeYaku}=await import('../src/analysis/yaku.ts');const {ordinaryTile}=await import('../src/model/tile.ts');
 const game=fixedRound(0,[0],false,3,[['123m','456p','789s','55z','67m']]);const hand=game.players[0].hand.map(t=>t.tile);
 const waits=getWaitingTileKinds(hand);assert.ok(waits.length>0);
 for(const kind of waits){const analysis=analyzeYaku([...hand,ordinaryTile(kind)],{winMethod:'ron',winningTile:kind,seatWind:'east',roundWind:'east'});assert.equal(analysis.isWinningShape,true);assert.equal(analysis.hasSupportedYaku,false);}
 assert.equal(startMatch(game).lastSettlement!.tenpai![0],true);
});
