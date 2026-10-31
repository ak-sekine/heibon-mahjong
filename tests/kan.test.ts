import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ankanGame,kakanGame,kanGame} from './kan-fixture.ts';
import {getKanOptions,declareKan,canTakeRinshan,chooseCpuKan} from '../src/game/kan.ts';
import {getCallOptions,declareCall,compareCallPriority} from '../src/game/calls.ts';
import {discardTile,canDiscard} from '../src/game/discard.ts';
import {getRonCandidates,declareRon,passRon} from '../src/game/ron.ts';
import {canDeclareTsumo,declareTsumo} from '../src/game/tsumo.ts';
import {exposedDoraIndicators,uraDoraIndicators} from '../src/game/dora.ts';
import {isClosedForRiichi,getRiichiDiscardOptions,declareRiichi} from '../src/game/riichi.ts';
import {canDeclareKyuushuKyuuhai} from '../src/game/special-draws.ts';
import {winningMelds} from '../src/game/melds.ts';
import {startMatch,assertPointConservation,nextRound,updateMatchGame} from '../src/game/match.ts';
import {AutomaticTurnRunner} from '../src/game/automatic-turns.ts';
import {allTiles,freeze} from './helpers.ts';
import {tileKindKey} from '../src/model/tile.ts';
import type {GameState} from '../src/model/game.ts';
import {childKyuushuKanGame,parentOpeningKanGame,parentKyuushuGame} from './step13-10-fixture.ts';
function conserved(g:GameState,initial:GameState) {
 assert.equal(allTiles(g).length,136);assert.equal(new Set(allTiles(g).map(t=>t.id)).size,136);
 assert.deepEqual(allTiles(g).map(t=>t.id).sort(),allTiles(initial).map(t=>t.id).sort());assert.equal(g.deadWall.length,14);
}
const kan=(g:GameState)=>declareKan(g,g.turnPlayerId,getKanOptions(g,g.turnPlayerId)[0].id);
for(const [name,make] of [['ankan',ankanGame],['kakan',kakanGame]] as const)test(`${name}: atomic tile transfer, rinshan, indicators, discard and source metadata`,()=>{
 const g=make();freeze(g);const result=kan(g);conserved(result,g);
 assert.equal(result.kanCount,1);assert.equal(result.players[0].melds![0].tiles.length,4);
 assert.equal(result.players[0].drawnTile,g.deadWall[0]);assert.equal(result.players[0].drawnTileSource,'rinshan');
 assert.equal(result.deadWall[0],g.liveWall.at(-1));assert.equal(result.liveWall.length,g.liveWall.length-1);
 assert.equal(exposedDoraIndicators(result).length,2);assert.equal(uraDoraIndicators(result).length,2);
 assert.equal(isClosedForRiichi(result.players[0]),name==='ankan');assert.ok(canDiscard(result,0));
 if(name==='kakan') {assert.equal(result.players[0].melds![0].calledTileId,g.players[0].melds![0].calledTileId);assert.equal(result.players[0].melds![0].fromPlayerId,3);}
 const after=discardTile(result,0,result.players[0].drawnTile!.id);conserved(after,g);assert.equal(after.players[0].drawnTileSource,null);
});
for(const key of ['man','pin','sou'])test(`red ${key} five is a fourth physical tile`,()=>{
 const suffix={man:'m',pin:'p',sou:'s'}[key]!;
 const g=kanGame({hands:{0:[`555${suffix}`,'123z','456z','123m','7z']},draw:`red:${key}-5`});
 const r=kan(g);conserved(r,g);assert.equal(r.players[0].melds![0].tiles.filter(t=>t.tile.isRed).length,1);
});
test('two own choices use unique physical IDs and stale/forged requests are immutable',()=>{
 const g=kanGame({hands:{0:['1111z','2222z','345p','67s']},draw:'sou-8'});assert.equal(getKanOptions(g,0).length,2);
 for(const o of getKanOptions(g,0))conserved(declareKan(g,0,o.id),g);
 const snapshot=structuredClone(g);assert.throws(()=>declareKan(g,0,'bad'),RangeError);assert.deepEqual(g,snapshot);
 const r=kan(g);assert.throws(()=>declareKan(r,0,getKanOptions(g,0)[0].id),RangeError);
});
test('dealer can ankan from a genuine initial deal before the first discard',()=>{
 const g=parentOpeningKanGame();assert.equal(g.players[0].drawnTileSource,'deal');assert.equal(getKanOptions(g,0).length,1);
 const option=getKanOptions(g,0)[0],r=declareKan(g,0,option.id);conserved(r,g);
 assert.equal(r.kanCount,1);assert.equal(r.callsMade,true);assert.equal(r.players[0].drawnTileSource,'rinshan');
 assert.equal(r.players[0].melds![0].type,'ankan');assert.equal(r.players[0].hand.length,10);assert.ok(canDiscard(r,0));
 assert.equal(exposedDoraIndicators(r).length,2);assert.equal(r.deadWall[0],g.liveWall.at(-1));
});
test('opening ankan follows the dealer seat after seating advances',()=>{
 const g=parentOpeningKanGame(false,137,2),options=getKanOptions(g,2);assert.equal(g.dealerId,2);assert.equal(g.turnPlayerId,2);
 assert.equal(g.players[2].drawnTileSource,'deal');assert.equal(options.length,1);
 const r=declareKan(g,2,options[0].id);conserved(r,g);assert.equal(r.players[2].drawnTileSource,'rinshan');
});
test('dealer without an opening quad can make an ordinary first discard',()=>{
 const g=parentKyuushuGame(9);assert.deepEqual(getKanOptions(g,0),[]);assert.ok(canDiscard(g,0));
 const r=discardTile(g,0,g.players[0].drawnTile!.id);conserved(r,g);assert.equal(r.kanCount,0);assert.equal(r.players[0].river.length,1);
});
test('dealer may choose either opening ankan candidate while retaining all physical IDs',()=>{
 const g=parentOpeningKanGame(true),options=getKanOptions(g,0);assert.equal(options.length,2);
 for(const option of options){
  const r=declareKan(g,0,option.id);conserved(r,g);assert.equal(r.players[0].melds!.length,1);
  assert.equal(tileKindKey(r.players[0].melds![0].tiles[0].tile),tileKindKey(option.meld.tiles[0].tile));
 }
});
test('child first live-wall draw keeps ankan and 九種九牌 ordering intact',()=>{
 const g=childKyuushuKanGame();assert.equal(g.turnPlayerId,1);assert.equal(g.players[1].drawnTileSource,'live-wall');
 assert.ok(getKanOptions(g,1).some(option=>option.meld.type==='ankan'));assert.ok(canDeclareKyuushuKyuuhai(g,1));
 const r=declareKan(g,1,getKanOptions(g,1)[0].id);conserved(r,g);assert.equal(r.players[1].drawnTileSource,'rinshan');
 assert.equal(canDeclareKyuushuKyuuhai(r,1),false,'kan cancels the first-turn 九種九牌 option');
});
for(const patch of [{liveWall:[]},{deadWall:[]},{kanCount:4},{phase:'awaiting-draw'},{pendingRiichi:{playerId:0,declarationTileId:'x'}}] as const)test(`illegal kan ${JSON.stringify(patch)}`,()=>{
 const g={...ankanGame(),...patch} as GameState;assert.deepEqual(getKanOptions(g,0),[]);assert.throws(()=>declareKan(g,0,'bad'),RangeError);
});
for(const seat of [1,2,3] as const)test(`daiminkan from ${seat}, pon priority and history`,()=>{
 const initial=kanGame({hands:{0:['111z','234m','456p','678s','2z']},turn:seat,draw:'east'});
 const g=discardTile(initial,seat,initial.players[seat].drawnTile!.id),options=getCallOptions(g,0);
 assert.ok(options.some(o=>o.type==='pon'));const o=options.find(o=>o.type==='daiminkan')!;assert.ok(o);
 const r=declareCall(g,0,o.id);conserved(r,initial);assert.equal(r.turnPlayerId,0);assert.equal(r.players[seat].river.length,0);assert.ok(r.players[seat].discardHistory!.some(t=>t.id===o.calledTileId));
 assert.equal(r.players[0].drawnTile,initial.deadWall[0]);assert.equal(r.players[0].melds![0].fromPlayerId,seat);
 assert.equal(compareCallPriority(g,o,{...o,type:'pon',tiles:o.tiles.slice(0,3) as any,id:o.id}),0);
});
test('rinshan is a yaku for an open no-yaku hand, ends on discard; ankan retains menzen tsumo',()=>{
 for(const type of ['ankan','kakan'] as const){
  const g=type==='ankan'?ankanGame():kakanGame();const r=kan(g);assert.ok(canDeclareTsumo(r,0));
  const win=declareTsumo(r,0).winResult!;assert.equal(win.winMethod,'tsumo');if(win.winMethod!=='tsumo')return;
  assert.ok(win.candidate.yaku.some(y=>y.id==='rinshan'));assert.equal(win.candidate.yaku.some(y=>y.id==='menzen-tsumo'),type==='ankan');
  assert.ok(win.fuBreakdown.some(e=>e.type==='kan' && e.fu===(type==='ankan'?32:16)));
 }
});
function robbed(human=false):GameState {
 return kanGame({turn:human?1:0,draw:'man-1',melds:{[human?1:0]:[{type:'pon',group:'111m'}]},hands:{[human?1:0]:['234p','678s','22z','45s'],[human?0:1]:['23m','456p','789s','333z','66s']}});
}
test('CPU chankan: uncommitted pon, no new dora/rinshan, dedicated winning reference and payer',()=>{
 const g=robbed();const r=kan(g);conserved(r,g);assert.equal(r.phase,'won');assert.equal(r.kanCount,0);assert.deepEqual(r.deadWall,g.deadWall);
 assert.equal(r.players[0].melds![0].type,'pon');const w=r.winResult!;assert.equal(w.winMethod,'ron');if(w.winMethod!=='ron')return;
 assert.equal(w.winningTile,g.players[0].drawnTile);assert.ok(w.winners[0].candidate.yaku.some(y=>y.id==='chankan'));assert.equal(w.winners[0].payments[0].playerId,0);assertPointConservation(startMatch(r));
});
test('human chankan pauses and respects ron/pass and furiten',()=>{
 const g=robbed(true),r=kan(g);assert.equal(r.phase,'awaiting-ron');assert.equal(r.players[1].melds![0].type,'pon');assert.ok(getRonCandidates(r).some(c=>c.winnerId===0));
 assert.equal(declareRon(r,0).phase,'won');const passed=passRon(r,0);assert.equal(passed.players[0].temporaryFuriten,true);assert.equal(passed.players[1].melds![0].type,'kakan');conserved(passed,g);
 const f={...g,players:g.players.map(p=>p.id===0?{...p,temporaryFuriten:true}:p) as unknown as GameState['players']};assert.equal(kan(f).phase,'awaiting-discard');
});
test('ankan robbery is kokushi only',()=>{
 const g=kanGame({hands:{0:['111m','234p','678s','22z','45s'],1:['9m','19p','19s','11234567z']},draw:'man-1'});
 const r=kan(g);assert.equal(r.phase,'won');assert.equal(r.kanCount,0);assert.equal(r.players[0].melds!.length,0);assert.equal(r.winResult?.winMethod,'ron');conserved(r,g);
});
test('riichi ankan keeps identical waits and triplet decomposition; rinshan re-kan forbidden',()=>{
 const g=ankanGame();const p=g.players[0];const riichi={...g,players:g.players.map(q=>q.id===0?{...p,riichi:{declarationTileId:'past',ippatsuEligible:true}}:q) as unknown as GameState['players']};
 assert.equal(getKanOptions(riichi,0).length,1);const r=kan(riichi);assert.equal(r.players[0].riichi!.ippatsuEligible,false);assert.equal(getKanOptions({...riichi,players:riichi.players.map(p=>p.id===0?{...p,drawnTileSource:'rinshan'}:p) as unknown as GameState['players']},0).length,0);
});
test('riichi rejects sequence reassignment and kakan',()=>{
 const g=kanGame({hands:{0:['111222333m','456p','1z']},draw:'man-1'});
 const r={...g,players:g.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']};assert.equal(getKanOptions(r,0).length,0);
 const k=kakanGame();assert.equal(getKanOptions({...k,players:k.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']},0).length,0);
});
for(const distributed of [false,true])test(`four kans distributed=${distributed}: cap, dora, settlement and reset`,()=>{
 const g=kanGame({hands:{0:distributed?['444z','234m','456p','5z']:['444z','5z']},melds:distributed?{0:[{type:'ankan',group:'1111z'}],1:[{type:'ankan',group:'2222z'},{type:'ankan',group:'3333z'}]}:{0:[{type:'ankan',group:'1111z'},{type:'ankan',group:'2222z'},{type:'ankan',group:'3333z'}]},draw:'north',rinshan:['sou-9','pin-9','man-9','white']});
 const r=kan(g);conserved(r,g);assert.equal(r.kanCount,4);assert.equal(r.players[0].drawnTile,g.deadWall[3]);assert.equal(exposedDoraIndicators(r).length,5);assert.equal(uraDoraIndicators(r).length,5);assert.equal(canTakeRinshan(r),false);
 if(distributed){assert.equal(r.abortiveDraw,'four-kans');const m=startMatch(r);assert.equal(m.lastSettlement!.reason,'four-kans');assert.equal(m.lastSettlement!.payments.length,0);assert.equal(m.lastSettlement!.next!.honba,1);assert.equal(m.lastSettlement!.next!.dealerId,m.dealerId);assertPointConservation(m);assert.equal(nextRound(m).game.kanCount,0);}
 else {assert.ok(canDeclareTsumo(r,0));const w=declareTsumo(r,0).winResult!;assert.equal(w.yakumanCount,4);assert.deepEqual(w.candidate.yaku.map(y=>y.id).sort(),['daisuushii','suuankou','suukantsu','tsuuiisou']);assert.equal(w.doraHan,0);assert.equal(w.redDoraHan,0);}
});
test('three kans give two han and ura follows established riichi',()=>{
 const g=kanGame({hands:{0:['123m','2z']},melds:{0:[{type:'ankan',group:'1111z'},{type:'ankan',group:'3333z'},{type:'ankan',group:'5555z'}]},draw:'south'});
 const r=declareTsumo(g,0).winResult!;assert.equal(r.winMethod,'tsumo');assert.ok(r.candidate.yaku.some(y=>y.id==='sankantsu'&&y.han===2));assert.equal(r.uraDoraHan,0);
 const ready={...g,players:g.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']};assert.ok(getRiichiDiscardOptions(g,0,25000).length);assert.equal(winningMelds(g.players[0].melds).length,3);assert.equal(declareTsumo(ready,0).winResult!.winMethod,'tsumo');
});
test('CPU kan cancellation does not write stale state',async()=>{
 const g=ankanGame(),cpu={...g,players:g.players.map(p=>p.id===0?{...p,control:'cpu' as const}:p) as unknown as GameState['players']};assert.ok(chooseCpuKan(cpu,0));
 let release!:()=>void,writes=0;const runner=new AutomaticTurnRunner({wait:()=>new Promise<void>(r=>release=r)});const task=runner.run(()=>cpu,()=>writes++);runner.cancel();release();await task;assert.equal(writes,0);
});
for(const n of [0,1,2,3,4])test(`dora and ura pairs ${n+1} map to reserved slots`,()=>{
 const g={...ankanGame(),kanCount:n};assert.deepEqual(exposedDoraIndicators(g),[4,6,8,10,12].slice(0,n+1).map(i=>g.deadWall[i]));assert.deepEqual(uraDoraIndicators(g),[5,7,9,11,13].slice(0,n+1).map(i=>g.deadWall[i]));
});
for(const type of ['ankan','daiminkan','kakan'] as const)for(const terminal of [false,true])test(`${type} ${terminal?'terminal':'simple'} fu is counted once`,()=>{
 const g=kanGame({hands:{0:['123p','456s','77z','23m']},melds:{0:[{type,group:terminal?'9999m':'5550p'}]},draw:'man-1'});
 const rinshan={...g,players:g.players.map(p=>p.id===0?{...p,drawnTileSource:'rinshan' as const}:p) as unknown as GameState['players']};
 const w=declareTsumo(rinshan,0).winResult!;const entries=w.fuBreakdown.filter(e=>e.type==='kan');assert.equal(entries.length,1);assert.equal(entries[0].fu,(type==='ankan'?16:8)*(terminal?2:1));
});
for(const count of [2,3])test(`chankan resolves ${count} ron winners and conserves deposits/honba`,()=>{
 const hands:any={0:['234p','678s','22z','45s'],1:['23m','456p','789s','333z','66s'],2:['23m','123p','456s','444z','77s']};
 if(count===3)hands[3]=['23m','789p','123s','555z','88s'];
 const g=kanGame({hands,melds:{0:[{type:'pon',group:'111m'}]},draw:'man-1'});const r=kan(g),w=r.winResult!;assert.equal(w.winMethod,'ron');if(w.winMethod!=='ron')return;assert.equal(w.winners.length,count);
 const match=startMatch(g);const m=updateMatchGame({...match,points:[24000,25000,25000,25000],depositSticks:1,honba:2},r);assertPointConservation(m);assert.equal(m.lastSettlement!.deposits!.recipientId,1);assert.ok(m.lastSettlement!.payments.every(p=>p.payerId===0&&p.honbaPoints===600));
});
test('consecutive kans take original slots 0 then 1 and reveal dora immediately',()=>{
 const g=kanGame({hands:{0:['1111z','2222z','345p','67s']},draw:'sou-8',rinshan:['west','north']});const first=kan(g);assert.equal(first.players[0].drawnTile,g.deadWall[0]);
 const second=kan(first);conserved(second,g);assert.equal(second.players[0].drawnTile,g.deadWall[1]);assert.equal(second.kanCount,2);assert.equal(exposedDoraIndicators(second).length,3);assert.equal(second.deadWall[1],first.liveWall.at(-1));
});
test('all established ippatsu rights expire, failed robbery keeps them intact',()=>{
 const g=ankanGame(),ready={...g,players:g.players.map(p=>p.id===1?{...p,riichi:{declarationTileId:'past',ippatsuEligible:true}}:p) as unknown as GameState['players']};assert.equal(kan(ready).players[1].riichi!.ippatsuEligible,false);
 const b=robbed(),robbing={...b,players:b.players.map(p=>p.id===1?{...p,riichi:{declarationTileId:'past',ippatsuEligible:true}}:p) as unknown as GameState['players']};assert.equal(kan(robbing).players[1].riichi!.ippatsuEligible,true);
});
test('four-kans settlement carries deposit, dealer and 100000 total; idempotent',()=>{
 const g=kanGame({hands:{0:['444z','234m','456p','5z']},melds:{0:[{type:'ankan',group:'1111z'}],1:[{type:'ankan',group:'2222z'},{type:'ankan',group:'3333z'}]},draw:'north'});
 const start=startMatch(g),m=updateMatchGame({...start,points:[24000,25000,25000,25000],depositSticks:1,honba:3},kan(g));assert.equal(m.depositSticks,1);assert.equal(m.lastSettlement!.next!.honba,4);assertPointConservation(m);assert.equal(updateMatchGame(m,g),m);
});
test('CPU kakan uses only own/public information and progresses with 300ms boundaries',async()=>{
 const g=kakanGame(),cpu={...g,players:g.players.map(p=>p.id===0?{...p,control:'cpu' as const}:p) as unknown as GameState['players']};
 assert.ok(chooseCpuKan(cpu,0));const changed={...cpu,players:cpu.players.map(p=>p.id===1?{...p,hand:[]}:p) as unknown as GameState['players']};assert.equal(chooseCpuKan(changed,0)!.id,chooseCpuKan(cpu,0)!.id);
 let state=cpu;const waits:number[]=[];const runner=new AutomaticTurnRunner({wait:async(ms)=>{waits.push(ms);}});await runner.run(()=>state,g=>{state=g;});assert.equal(state.phase,'won');assert.equal(state.kanCount,1);assert.deepEqual(waits,[300,300]);conserved(state,cpu);
});
test('dora counts every fourth tile and red five; matching kan ura only for riichi',()=>{
 const g=kanGame({hands:{0:['234p','678s','222z','6p']},melds:{0:[{type:'ankan',group:'5550m'}]},draw:'pin-6',indicators:['man-4','pin-5'],ura:['man-4','pin-5']});
 const w=declareTsumo(g,0).winResult!;assert.equal(w.doraCount,6);assert.equal(w.redDoraCount,1);assert.equal(w.uraDoraCount,0);
 const ready={...g,players:g.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']};const r=declareTsumo(ready,0).winResult!;assert.equal(r.uraDoraCount,6);assert.equal(r.uraDoraHan,6);
});
test('standard hand cannot rob ankan; riichi cannot kan without the actual drawn fourth',()=>{
 const g=kanGame({hands:{0:['111m','234p','678s','22z','45s'],1:['23m','456p','789s','333z','66s']},draw:'man-1'});const r=kan(g);assert.equal(r.phase,'awaiting-discard');assert.equal(r.kanCount,1);conserved(r,g);
 const four=kanGame({hands:{0:['1111z','234m','456p','67s','2z']},draw:'sou-8'});const ready={...four,players:four.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as GameState['players']};assert.equal(getKanOptions(ready,0).length,0);
});
for(const type of ['ankan','daiminkan','kakan'] as const)test(`ron with ${type} evaluates one meld, four physical tiles and closed ron fu`,()=>{
 const g=kanGame({hands:{0:['123p','456s','777z','2m']},melds:{0:[{type,group:'1111z'}]},draw:'man-2'}),tile=g.players[0].drawnTile!;
 const window={...g,turnPlayerId:3 as const,phase:'awaiting-ron' as const,ronWindow:{discarderId:3 as const,tileId:tile.id},players:g.players.map(p=>p.id===0?{...p,drawnTile:null,drawnTileSource:null}:p.id===3?{...p,river:[tile],discardHistory:[tile]}:p) as unknown as GameState['players']};
 const r=declareRon(window,0);conserved(r,g);assert.equal(r.winResult!.winMethod,'ron');if(r.winResult!.winMethod!=='ron')return;const w=r.winResult!.winners.find(w=>w.winnerId===0)!;
 assert.equal(w.fuBreakdown.some(e=>e.type==='menzen-ron'),type==='ankan');assert.equal(w.fuBreakdown.filter(e=>e.type==='kan').length,1);assertPointConservation(startMatch(r));
});
for(const [group,draw] of [['555m','red:man-5'],['550m','man-5']] as const)test(`kakan adds the exact ${draw} ID and preserves the original called tile`,()=>{
 const g=kanGame({hands:{0:['234p','678s','22z','45s']},melds:{0:[{type:'pon',group}]},draw});const r=kan(g);conserved(r,g);const m=r.players[0].melds![0];assert.equal(m.type,'kakan');if(m.type!=='kakan')return;
 assert.equal(m.addedTileId,g.players[0].drawnTile!.id);assert.equal(m.calledTileId,g.players[0].melds![0].calledTileId);assert.equal(m.tiles.filter(t=>t.tile.isRed).length,1);
});

test('first discard after an established ankan permits ordinary riichi, not double riichi',()=>{
 const g=kanGame({hands:{0:['111z','234m','456p','678s','2z']},draw:'east',rinshan:['west']});const r=kan(g);const option=getRiichiDiscardOptions(r,0,25000).find(o=>o.tileId===r.players[0].drawnTile!.id)!;assert.ok(option);
 const m=declareRiichi(startMatch(r),0,option.tileId);assert.equal(m.game.players[0].riichi!.doubleRiichi,false);assert.equal(m.depositSticks,1);assertPointConservation(m);
});
