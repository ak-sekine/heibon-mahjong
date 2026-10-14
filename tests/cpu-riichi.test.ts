import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatchState } from '../src/model/match.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { chooseCpuRiichiDiscard } from '../src/game/cpu.ts';
import { canDeclareRiichi, declareRiichi, getRiichiDiscardOptions, resolvePendingRiichi } from '../src/game/riichi.ts';
import { startMatch, updateMatchGame, assertPointConservation, settleRound } from '../src/game/match.ts';
import { canDeclareRon, declareRon, passRon } from '../src/game/ron.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { GameController } from '../src/ui/controller.ts';
import { cpuRiichiStart } from './cpu-riichi-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { fixedRound } from './match-fixture.ts';
import { inventory, freeze } from './helpers.ts';
import { tileKindKey } from '../src/model/tile.ts';
const declaration=(game:GameState)=>game.players[game.turnPlayerId].drawnTile!.id;
function declare(game=cpuRiichiStart()) {return declareRiichi(startMatch(game),game.turnPlayerId,declaration(game));}
function move(match:MatchState) {const g=drawTile(match.game,match.game.turnPlayerId);return updateMatchGame(match,discardTile(g,g.turnPlayerId,declaration(g)));}
for(const id of [1,2,3] as const) test(`CPU${id} declares, pays once, gains riichi and respects physical tsumogiri`,()=>{
  const initial=cpuRiichiStart(id);freeze(initial);assert.ok(canDeclareRiichi(initial,id,declaration(initial),25000));
  const m=declare(initial);assert.equal(m.points[id],24000);assert.equal(m.depositSticks,1);assert.equal(m.game.pendingRiichi,null);
  assert.equal(m.game.players[id].riichi?.declarationTileId,declaration(initial));assertPointConservation(m);inventory(m.game,initial);
  assert.equal(resolvePendingRiichi(m),m);assert.throws(()=>declareRiichi(m,id,declaration(initial)),RangeError);
  let match=m;for(let i=0;i<3;i++)match=move(match);const g=drawTile(match.game,id);
  assert.throws(()=>discardTile(g,id,g.players[id].hand[0].id),RangeError);
  const next=discardTile(g,id,declaration(g));assert.deepEqual(next.players[id].hand,m.game.players[id].hand);inventory(next,initial);
});
test('pure strategy chooses maximum wait-kind count and physical ID tie-break',()=>{
  const g=cpuTsumoGame(1,['123m','123m','789p','22p','456s']);const snapshot=structuredClone(g);freeze(g);const options=getRiichiDiscardOptions(g,1,25000);
  assert.ok(new Set(options.map(o=>o.waitKindCount)).size>1);const maximum=Math.max(...options.map(o=>o.waitKindCount));
  const ties=options.filter(o=>o.waitKindCount===maximum).map(o=>o.tileId).sort();assert.ok(ties.length>1);
  assert.equal(chooseCpuRiichiDiscard(g,1,25000),ties[0]);assert.equal(chooseCpuRiichiDiscard(g,1,25000),ties[0]);assert.deepEqual(g,snapshot);
});
for(const reason of ['points','wall','already','turn','ron','ended'] as const) test(`CPU riichi rejection: ${reason}`,()=>{
  let g=cpuRiichiStart();let points=25000;
  if(reason==='points')points=999;
  if(reason==='wall')g={...g,liveWall:g.liveWall.slice(0,3)};
  if(reason==='already')g={...g,players:g.players.map(p=>p.id===1?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']};
  if(reason==='turn')g={...g,turnPlayerId:2};
  if(reason==='ron')g={...g,phase:'awaiting-ron'};
  if(reason==='ended') {assert.throws(()=>declareRiichi({...startMatch(g),status:'round-ended'},1,declaration(g)),RangeError);return;}
  assert.equal(chooseCpuRiichiDiscard(g,1,points),null);
});
test('fixed wall scenario A: CPU draw, declaration, forced tsumogiri, riichi tsumo and deposit receipt',()=>{
  const dealt=cpuRiichiStart();const initial={...dealt,phase:'awaiting-draw' as const,liveWall:[dealt.players[1].drawnTile!,...dealt.liveWall],players:dealt.players.map(p=>p.id===1?{...p,drawnTile:null,drawnTileSource:null}:p) as unknown as GameState['players']};
  const drawn=drawTile(initial,1);let match=declare(drawn);inventory(match.game,initial);
  for(let i=0;i<3;i++)match=move(match);let g=drawTile(match.game,1);assert.equal(canDeclareTsumo(g,1),false);
  match=updateMatchGame(match,discardTile(g,1,declaration(g)));assert.equal(tileKindKey(match.game.players[1].river.at(-1)!.tile),'west');
  for(let i=0;i<3;i++)match=move(match);g=drawTile(match.game,1);assert.ok(canDeclareTsumo(g,1));
  const settled=updateMatchGame(match,declareTsumo(g,1));const result=settled.game.winResult!;
  assert.equal(result.winMethod,'tsumo');if(result.winMethod!=='tsumo')return;
  assert.equal(result.candidate.yaku.find(y=>y.id==='double-riichi')?.han,2);assert.equal(settled.lastSettlement?.deposits?.recipientId,1);
  assert.equal(settled.lastSettlement?.deposits?.points,1000);assert.equal(settled.depositSticks,0);assertPointConservation(settled);inventory(settled.game,initial);assert.equal(settleRound(settled),settled);
});
for(const winners of [[0],[2],[0,2],[0,2,3]] as const) test(`declaration ron rejects riichi and deposit: winners ${winners}`,()=>{
  const initial=cpuRiichiStart(1,winners);const pending=declare(initial);
  if(winners.includes(0 as never)) {
    assert.equal(pending.game.phase,'awaiting-ron');assert.deepEqual(pending.game.pendingRiichi,{playerId:1,declarationTileId:declaration(initial),doubleRiichi:true});
    assert.equal(pending.points[1],25000);assert.equal(pending.depositSticks,0);assert.equal(pending.game.players[1].riichi,null);
    assert.equal(resolvePendingRiichi(pending),pending);assert.throws(()=>drawTile(pending.game,1),RangeError);
  }
  const settled=winners.includes(0 as never)?updateMatchGame(pending,declareRon(pending.game,0)):pending;
  assert.equal(settled.game.phase,'won');assert.equal(settled.game.players[1].riichi,null);assert.equal(settled.game.pendingRiichi,null);
  assert.equal(settled.lastSettlement?.before[1],25000);assert.equal(settled.depositSticks,0);assert.equal(settled.lastSettlement?.deposits,null);
  const result=settled.game.winResult!;assert.equal(result.winMethod,'ron');if(result.winMethod!=='ron')return;
  assert.deepEqual([...result.winners.map(w=>w.winnerId)].sort(),[...winners].sort());assert.ok(result.winners.every(w=>!w.candidate.yaku.some(y=>y.id==='riichi')));
  assertPointConservation(settled);inventory(settled.game,initial);assert.equal(resolvePendingRiichi(settled),settled);
});
for(const winners of [[0],[0,2],[0,2,3]] as const) test(`pass declaration ron resolves CPUs before establishment: ${winners}`,()=>{
  const initial=cpuRiichiStart(1,winners);const pending=declare(initial);const passed=passRon(pending.game,0);
  const match=updateMatchGame(pending,passed);inventory(match.game,initial);assertPointConservation(match);assert.equal(match.game.pendingRiichi,null);
  if(winners.length===1) {
    assert.equal(match.game.phase,'awaiting-draw');assert.equal(match.points[1],24000);assert.equal(match.depositSticks,1);assert.ok(match.game.players[1].riichi);
    assert.equal(resolvePendingRiichi(match),match);assert.equal(updateMatchGame(match,match.game).depositSticks,1);
    assert.throws(()=>drawTile(passed,passed.turnPlayerId),RangeError);
  } else {
    assert.equal(match.game.phase,'won');assert.equal(match.game.players[1].riichi,null);assert.equal(match.depositSticks,0);assert.equal(match.lastSettlement?.before[1],25000);
  }
});
test('multi-ron allocates existing deposits by existing seat order, with no new deposit',()=>{
  const initial=cpuRiichiStart(1,[0,2,3]);const before={...startMatch(initial),points:[24000,24000,25000,25000] as const,depositSticks:2};
  const pending=declareRiichi(before,1,declaration(initial));const match=updateMatchGame(pending,declareRon(pending.game,0));
  assert.deepEqual(match.lastSettlement?.deposits,{recipientId:2,points:2000});assert.equal(match.lastSettlement?.before[1],24000);assertPointConservation(match);
});
test('two CPU riichi and human+CPU deposits conserve points; draw carries them',()=>{
  const groups=['123m','456p','789s','22p','46m'];
  const initial=cpuRiichiStart(1,[],'north',groups,{2:groups});
  let match=declare(initial);let g=drawTile(match.game,2);
  assert.ok(canDeclareRiichi(g,2,declaration(g),25000));match=declareRiichi(updateMatchGame(match,g),2,declaration(g));
  assert.equal(match.depositSticks,2);assertPointConservation(match);inventory(match.game,initial);
  const ended=updateMatchGame(match,fixedRound(1,[1]));assert.equal(ended.depositSticks,2);assertPointConservation(ended);
  const human=cpuRiichiStart(0,[],'north',groups,{1:groups});let mixed=declare(human);g=drawTile(mixed.game,1);
  mixed=declareRiichi(updateMatchGame(mixed,g),1,declaration(g));assert.equal(mixed.depositSticks,2);assertPointConservation(mixed);inventory(mixed.game,human);
});
test('runMatch chooses tsumo ahead of riichi and never invokes normal discard',async()=>{
  let match=startMatch(cpuTsumoGame(1));const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:()=>{throw Error('unexpected discard');}});
  await runner.runMatch(()=>match,m=>{match=m;});assert.equal(match.game.phase,'won');assert.equal(match.game.players[1].riichi,null);assert.equal(match.depositSticks,0);
});
test('runMatch CPU riichi precedes injected normal discard and stops for human ron',async()=>{
  let match=startMatch(cpuRiichiStart(1,[0],'sou-5',['123m','456p','789s','22p','46m']));
  assert.equal(chooseCpuRiichiDiscard(match.game,1,25000),declaration(match.game));
  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:()=>{throw Error('normal discard');}});
  await runner.runMatch(()=>match,m=>{match=m;});assert.equal(match.game.phase,'awaiting-ron');assert.equal(match.points[1],25000);assert.equal(match.depositSticks,0);
});
test('legacy run still honors injected discard; Match run falls back with insufficient points',async()=>{
  let game=cpuRiichiStart();let count=0;const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:p=>{count++;return p.drawnTile!.id;}});
  await runner.run(()=>game,g=>{game=g;});assert.ok(count>0);assert.equal(game.players[1].riichi,null);
  let match={...startMatch(cpuRiichiStart()),points:[49001,999,25000,25000] as const};count=0;
  await runner.runMatch(()=>match,m=>{match=m as typeof match;});assert.ok(count>0);assert.equal(match.game.players[1].riichi,null);assertPointConservation(match);
});
test('established CPU uses drawn physical tile without calling normal strategy',async()=>{
  let match=declare();for(let i=0;i<3;i++)match=move(match);match=updateMatchGame(match,drawTile(match.game,1));const draw=declaration(match.game);
  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:p=>{assert.notEqual(p.id,1);return p.drawnTile!.id;}});
  await runner.runMatch(()=>match,m=>{match=m;});assert.equal(match.game.players[1].river.at(-1)?.id,draw);assert.equal(match.depositSticks,1);
});
test('cancel/reset/new round invalidates old promises; duplicate run does not charge twice',async()=>{
  const waits:(()=>void)[]=[];let match=startMatch(cpuRiichiStart());const runner=new AutomaticTurnRunner({wait:()=>new Promise(r=>waits.push(r))});
  const first=runner.runMatch(()=>match,m=>{match=m;});await runner.runMatch(()=>match,m=>{match=m;});assert.equal(waits.length,1);
  runner.cancel();match=startMatch();const fresh=match;waits[0]();await first;assert.equal(match,fresh);
});
test('controller pass resumes after CPU pending declaration, then reset cancels next CPU',async()=>{
  const waits:(()=>void)[]=[];const initial=cpuRiichiStart(1,[0]);const ui=new GameController(()=>initial,{wait:()=>new Promise(r=>waits.push(r))});
  ui.match=declare(initial);const passed=ui.passRon();assert.equal(ui.match.depositSticks,1);assert.ok(ui.game.players[1].riichi);assert.equal(ui.game.pendingRiichi,null);
  assert.equal(waits.length,1);ui.newGame();const fresh=ui.match;waits[0]();await passed;assert.equal(ui.match,fresh);assert.equal(ui.match.depositSticks,0);
});
test('pending declaration cannot be duplicated, finalized early or drawn through',()=>{
  const m=declare(cpuRiichiStart(1,[0]));const id=m.game.pendingRiichi!.declarationTileId;
  assert.equal(resolvePendingRiichi(m),m);assert.throws(()=>declareRiichi(m,1,id),RangeError);assert.throws(()=>discardTile(m.game,1,id),RangeError);
  assert.throws(()=>drawTile(m.game,2),RangeError);assert.equal(m.depositSticks,0);
});
test('replayed pass resolution cannot charge again or overwrite a fresh match',()=>{
  const pending=declare(cpuRiichiStart(1,[0]));const passed=passRon(pending.game,0);const established=updateMatchGame(pending,passed);
  assert.equal(updateMatchGame(established,passed),established);assert.equal(established.depositSticks,1);assertPointConservation(established);
  const fresh=startMatch();assert.equal(updateMatchGame(fresh,passed),fresh);
});
test('CPU riichi ron gains one han through shared scoring',()=>{
  let match=declare();const initial=match.game;let g=drawTile(match.game,2);
  const winning=g.liveWall.find(t=>tileKindKey(t.tile)==='man-5')!;
  // Exchange current physical draw with a future winning draw, keeping 136 tiles.
  const players=[...g.players] as [PlayerState,PlayerState,PlayerState,PlayerState];const old=players[2].drawnTile!;
  players[2]={...players[2],drawnTile:winning};g={...g,players,liveWall:g.liveWall.map(t=>t.id===winning.id?old:t)};
  const won=discardTile(g,2,winning.id);assert.equal(won.phase,'won');match=updateMatchGame(match,won);
  const result=won.winResult!;if(result.winMethod!=='ron')assert.fail('Expected ron');
  assert.equal(result.winners[0].candidate.yaku.find(y=>y.id==='double-riichi')?.han,2);assert.equal(match.lastSettlement?.deposits?.recipientId,1);assertPointConservation(match);inventory(won,initial);
});
test('human ron receives an established CPU deposit with no second settlement',()=>{
  const g=cpuRiichiStart(1,[0]);const before={...startMatch(g),points:[25000,24000,25000,25000] as const,depositSticks:1};
  const pending=declareRiichi(before,1,declaration(g));const settled=updateMatchGame(pending,declareRon(pending.game,0));
  assert.deepEqual(settled.lastSettlement?.deposits,{recipientId:0,points:1000});assertPointConservation(settled);assert.equal(settleRound(settled),settled);
});
test('wait snapshot cannot overwrite replacement match at the same CPU turn',async()=>{
  let release!:()=>void;let match=startMatch(cpuRiichiStart());const runner=new AutomaticTurnRunner({wait:()=>new Promise(r=>{release=r;})});
  const pending=runner.runMatch(()=>match,m=>{match=m;});match=startMatch(cpuRiichiStart());const fresh=match;release();await pending;
  assert.equal(match,fresh);assert.equal(match.depositSticks,0);
});
test('three live tiles preserve injected normal discard and cannot trigger CPU riichi',async()=>{
  const game=cpuRiichiStart();let match=startMatch({...game,liveWall:game.liveWall.slice(0,3)});let count=0;
  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:p=>{count++;return p.drawnTile!.id;}});
  await runner.runMatch(()=>match,m=>{match=m;});assert.ok(count>0);assert.equal(match.game.players[1].riichi,null);assert.equal(match.depositSticks,0);assertPointConservation(match);
});
