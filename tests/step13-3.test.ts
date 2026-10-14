import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import { countDora, doraKindFromIndicator } from '../src/analysis/dora.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { ordinaryTile, redFive, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { declareRiichi, resolvePendingRiichi } from '../src/game/riichi.ts';
import { uraDoraIndicators, exposedDoraIndicators } from '../src/game/dora.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { declareRon, passRon, canDeclareRon } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { evaluateWin } from '../src/game/win.ts';
import { startMatch, updateMatchGame, assertPointConservation, nextRound } from '../src/game/match.ts';
import { riichiStart } from './riichi-fixture.ts';
import { cpuRiichiStart } from './cpu-riichi-fixture.ts';
import { ronStart, withRiverTile } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { fixedRound } from './match-fixture.ts';
import { freeze, inventory } from './helpers.ts';

const ids = [0,1,2,3] as const;
function playerChange(g: GameState, id: PlayerId, changes: Partial<PlayerState>): GameState {
 return {...g,players:g.players.map(p=>p.id===id?{...p,...changes}:p) as unknown as GameState['players']};
}
/** Swap real physical tiles, never invent a fifth copy or change IDs. */
function ura(g: GameState, key: string): GameState {
 const deadWall=[...g.deadWall],liveWall=[...g.liveWall];
 if(tileKindKey(deadWall[5].tile)===key)return g;
 const index=liveWall.findIndex(t=>tileKindKey(t.tile)===key);
 if(index>=0){[deadWall[5],liveWall[index]]=[liveWall[index],deadWall[5]];return {...g,deadWall,liveWall};}
 const deadIndex=deadWall.findIndex(t=>tileKindKey(t.tile)===key);
 if(deadIndex>=0){[deadWall[5],deadWall[deadIndex]]=[deadWall[deadIndex],deadWall[5]];return {...g,deadWall};}
 for(const p of g.players.slice(1)) {
  const hand=[...p.hand],index=hand.findIndex(t=>tileKindKey(t.tile)===key);
  if(index>=0){[deadWall[5],hand[index]]=[hand[index],deadWall[5]];return playerChange({...g,deadWall},p.id,{hand});}
 }
 throw new RangeError(`Unavailable ura indicator ${key}`);
}
function move(g: GameState) {const drawn=drawTile(g,g.turnPlayerId);return discardTile(drawn,drawn.turnPlayerId,drawn.players[drawn.turnPlayerId].drawnTile!.id);}
function establish(g: GameState) {return declareRiichi(startMatch(g),g.turnPlayerId,g.players[g.turnPlayerId].drawnTile!.id);}
const man=(rank: 1|4|5|9)=>ordinaryTile({category:'suited',suit:'man',rank});

for(const id of ids) for(const past of [false,true]) test(`seat ${id} ${past?'ordinary':'double'} declaration starts ippatsu after resolution`,()=>{
 let g=id===0?riichiStart('tsumo'):cpuRiichiStart(id);
 if(past)g=withRiverTile(g,id,'east');
 // Other players having discarded cannot affect this player's first discard.
 g=withRiverTile(g,((id+1)%4) as PlayerId,'south');
 freeze(g);const m=establish(g);const r=m.game.players[id].riichi!;
 assert.equal(r.doubleRiichi,!past);assert.equal(r.ippatsuEligible,true);assert.equal(r.passedRon,false);
 assert.equal(resolvePendingRiichi(m),m);assert.equal(m.depositSticks,1);assertPointConservation(m);inventory(m.game,g);
 let next=m.game;for(let i=0;i<3;i++){next=move(next);assert.equal(next.players[id].riichi,r);}
 next=drawTile(next,id);assert.equal(next.players[id].riichi,r);
 next=discardTile(next,id,next.players[id].drawnTile!.id);
 assert.equal(next.players[id].riichi?.ippatsuEligible,false);assert.equal(next.players[id].riichi?.doubleRiichi,!past);inventory(next,g);
});
for(const riichi of [false,true]) for(const doubleRiichi of [false,true]) for(const ippatsuEligible of [false,true]) for(const winMethod of ['ron','tsumo'] as const)
 test(`context riichi=${riichi} double=${doubleRiichi} ippatsu=${ippatsuEligible} ${winMethod}`,()=>{
 const g=riichiStart();const winning=g.liveWall.find(t=>tileKindKey(t.tile)==='man-5')!;
 const a=analyzeYaku([...g.players[0].hand,winning].map(t=>t.tile),{winMethod,winningTile:winning.tile,seatWind:'east',roundWind:'east',riichi,doubleRiichi,ippatsuEligible});
 for(const c of a.candidates){
  assert.equal(c.yaku.find(y=>y.id==='riichi')?.han,riichi&&!doubleRiichi?1:undefined);
  assert.equal(c.yaku.find(y=>y.id==='double-riichi')?.han,riichi&&doubleRiichi?2:undefined);
  assert.equal(c.yaku.find(y=>y.id==='ippatsu')?.han,riichi&&ippatsuEligible?1:undefined);
  assert.equal(c.totalHan,(riichi?(doubleRiichi?2:1)+(ippatsuEligible?1:0):0)+(winMethod==='tsumo'?1:0));
 }
});
for(const field of ['ippatsuEligible','doubleRiichi'] as const)test(`context rejects nonboolean ${field}`,()=>{
 const g=tsumoGame(),winning=g.players[0].drawnTile!;
 assert.throws(()=>analyzeYaku([...g.players[0].hand,winning].map(t=>t.tile),{winMethod:'tsumo',winningTile:winning.tile,seatWind:'east',roundWind:'east',[field]:1 as unknown as boolean}),RangeError);
});
test('ura uses exactly the hidden partner, same physical reference, immutable wall',()=>{
 const g=riichiStart(),snapshot=structuredClone(g);freeze(g);
 assert.equal(uraDoraIndicators(g).length,1);assert.equal(uraDoraIndicators(g)[0],g.deadWall[5]);
 assert.equal(exposedDoraIndicators(g)[0],g.deadWall[4]);assert.deepEqual(g,snapshot);
});
for(const length of [0,1,13,15,16])test(`ura rejects dead wall length ${length}`,()=>{
 const g=riichiStart();assert.throws(()=>uraDoraIndicators({...g,deadWall:Array.from({length},()=>g.deadWall[0])}),RangeError);
});
for(const [indicator,key] of [[man(9),'man-1'],[ordinaryTile({category:'honor',honor:'north'}),'east'],[ordinaryTile({category:'honor',honor:'red'}),'white']] as const)
 test(`ura indicator wrap ${key}`,()=>assert.equal(tileKindKey(doraKindFromIndicator(indicator)),key));
for(const n of [0,1,2,3,4])test(`ura ${n} copies including red five`,()=>{
 const tiles=Array.from({length:n},(_,i)=>i===0?redFive('man'):man(5));assert.equal(countDora(tiles,[man(4)]),n);
});
for(const mode of ['ron','tsumo'] as const)for(const double of [false,true])test(`legal wall ${double?'double':'ordinary'} ippatsu ${mode}, bonus and settlement`,()=>{
 let initial=ura(riichiStart(mode),'man-4');if(!double)initial=withRiverTile(initial,0,'east');
 let m=establish(initial),g=m.game;
 if(mode==='ron'){g=move(g);assert.equal(g.phase,'awaiting-ron');g=declareRon(g,0);}
 else {for(let i=0;i<3;i++)g=move(g);g=drawTile(g,0);assert.equal(g.players[0].riichi?.ippatsuEligible,true);g=declareTsumo(g,0);}
 m=updateMatchGame(m,g);const win=g.winResult!;const r=win.winMethod==='ron'?win.winners[0]:win;
 assert.equal(r.yakuHan,(double?2:1)+1+(mode==='tsumo'?1:0));assert.equal(r.uraDoraCount,1);assert.equal(r.uraDoraHan,1);
 assert.equal(r.totalHanIncludingDora,r.yakuHan+r.doraHan+r.uraDoraHan+r.redDoraHan);
 assert.equal(r.totalPoints,calculateScore({totalHanIncludingDora:r.totalHanIncludingDora,fu:r.fu,yakumanCount:0,winnerId:0,dealerId:0,discarderId:mode==='ron'?1:undefined,winMethod:mode}).totalPoints);
 assertPointConservation(m);inventory(g,initial);
});
test('legal wall ippatsu expires before next-cycle ron and tsumo',()=>{
 const initial=withRiverTile(riichiStart('furiten'),0,'white');let m=establish(initial),g=m.game;
 g=move(g);assert.ok(canDeclareRon(g,0));g=passRon(g,0);
 assert.equal(g.players[0].riichi?.passedRon,true);assert.equal(g.players[0].riichi?.ippatsuEligible,true);
 for(let i=0;i<2;i++)g=move(g);g=drawTile(g,0);assert.equal(g.players[0].riichi?.ippatsuEligible,true);
 g=discardTile(g,0,g.players[0].drawnTile!.id);assert.equal(g.players[0].riichi?.ippatsuEligible,false);
 g=move(g);g=move(g);assert.equal(canDeclareRon(g,0),false);
 // Isolate yaku expiration from permanent furiten; evaluateWin itself is shape/scoring only.
 const r=evaluateWin({...g,ronWindow:{discarderId:2,tileId:g.players[2].river.at(-1)!.id}},0,g.players[2].river.at(-1)!,'ron')!;assert.ok(r);assert.ok(!r.candidate.yaku.some(y=>y.id==='ippatsu'));
 g=move(g);g=drawTile(g,0);assert.ok(!declareTsumo(g,0).winResult!.analysis.candidates.some(c=>c.yaku.some(y=>y.id==='ippatsu')));inventory(g,initial);
});
for(const winners of [[0],[0,2],[0,2,3]] as const)test(`pending double declaration rejected on ron ${winners}`,()=>{
 const initial=cpuRiichiStart(1,winners);const pending=establish(initial);
 assert.equal(pending.game.players[1].riichi,null);assert.equal(pending.game.pendingRiichi?.doubleRiichi,true);assert.equal(pending.depositSticks,0);
 assert.equal(resolvePendingRiichi(pending),pending);
 const m=updateMatchGame(pending,declareRon(pending.game,0));assert.equal(m.game.players[1].riichi,null);assert.equal(m.game.pendingRiichi,null);
 const win=m.game.winResult!;assert.equal(win.winMethod,'ron');if(win.winMethod==='ron')assert.ok(win.winners.every(r=>r.uraDoraCount===0&&r.uraDoraHan===0));assertPointConservation(m);inventory(m.game,initial);
});
test('human pass confirms pending double and ippatsu once',()=>{
 const initial=cpuRiichiStart(1,[0],'sou-5',['123m','456p','789s','22p','46m']);const pending=establish(initial);
 const m=resolvePendingRiichi(updateMatchGame(pending,passRon(pending.game,0)));
 assert.equal(m.game.players[1].riichi?.doubleRiichi,true);assert.equal(m.game.players[1].riichi?.ippatsuEligible,true);assert.equal(m.depositSticks,1);assert.equal(resolvePendingRiichi(m),m);assertPointConservation(m);
});
for(const winners of [[0,2],[0,2,3]] as const)for(const riichiIds of [[0],[0,2]] as const)test(`shared ura mixed multiple ron ${winners} riichi ${riichiIds}`,()=>{
 let initial=ura(ronStart(1,winners),'sou-4');
 for(const id of riichiIds){initial=withRiverTile(initial,id,'north');initial=playerChange(initial,id,{riichi:{declarationTileId:initial.players[id].river.at(-1)!.id,ippatsuEligible:true,doubleRiichi:id===2}});}
 const before={...startMatch(initial),points:ids.map(id=>riichiIds.includes(id as never)?24000:25000) as unknown as readonly [number,number,number,number],depositSticks:riichiIds.length};
 const pending=discardTile(initial,1,initial.players[1].drawnTile!.id);const g=declareRon(pending,0);const m=updateMatchGame(before,g);
 const win=g.winResult!;assert.equal(win.winMethod,'ron');if(win.winMethod!=='ron')return;
 assert.equal(win.winners.length,winners.length);for(const r of win.winners){assert.equal(r.uraDoraCount,riichiIds.includes(r.winnerId as never)?1:0);assert.equal(r.uraDoraHan,r.uraDoraCount);}
 assert.equal(m.lastSettlement?.deposits?.recipientId,2);assert.equal(m.depositSticks,0);assertPointConservation(m);inventory(g,initial);
});
for(const winMethod of ['ron','tsumo'] as const)for(const dealerId of [0,1] as const)for(const riichi of [false,true])test(`ura scoring ${winMethod} dealer=${dealerId} riichi=${riichi}`,()=>{
 let g=ura(tsumoGame(['111m','555z','456p','789s','22p'],false),'man-9');g={...g,dealerId};
 if(riichi)g=playerChange(g,0,{riichi:{declarationTileId:'past'}});
 if(winMethod==='ron')g={...g,ronWindow:{discarderId:2,tileId:g.players[0].drawnTile!.id}};
 const r=evaluateWin(g,0,g.players[0].drawnTile!,winMethod)!;assert.ok(r);assert.equal(r.uraDoraCount,riichi?3:0);assert.equal(r.uraDoraHan,riichi?3:0);
 assert.equal(r.totalHanIncludingDora,r.yakuHan+r.doraHan+r.uraDoraHan+r.redDoraHan);
 const expected=calculateScore({totalHanIncludingDora:r.totalHanIncludingDora,fu:r.fu,yakumanCount:0,winnerId:0,dealerId,discarderId:winMethod==='ron'?2:undefined,winMethod});assert.deepEqual(r.payments,expected.payments);assert.equal(r.totalPoints,expected.totalPoints);
});
test('no yaku hand remains invalid despite hidden bonus and no established riichi',()=>{
 const g=ura(riichiStart(),'man-4'),winning=g.liveWall.find(t=>tileKindKey(t.tile)==='man-5')!;
 assert.equal(evaluateWin(g,0,winning,'ron'),null);
});
test('yakuman ignores all ordinary yaku and bonus han',()=>{
 let g=ura(tsumoGame(['19m','19p','19s','12345677z']),'man-9');g=playerChange(g,0,{riichi:{declarationTileId:'past',doubleRiichi:true,ippatsuEligible:true}});
 const r=evaluateWin(g,0,g.players[0].drawnTile!,'tsumo')!;assert.equal(r.uraDoraCount,1);assert.equal(r.uraDoraHan,0);assert.equal(r.totalHanIncludingDora,0);assert.equal(r.totalPoints,48000);assert.deepEqual(r.candidate.yaku.map(y=>y.id),['kokushi-musou']);
});
test('next round and new match clear all extended riichi state',()=>{
 const m=establish(riichiStart());let exhausted=fixedRound(0,[0]);exhausted=playerChange(exhausted,0,{riichi:m.game.players[0].riichi});
 const next=nextRound(updateMatchGame(m,exhausted));assert.ok(next.game.players.every(p=>p.riichi===null));assert.equal(next.game.pendingRiichi,null);
 const fresh=startMatch();assert.ok(fresh.game.players.every(p=>p.riichi===null));assert.equal(fresh.game.pendingRiichi,null);assertPointConservation(next);assertPointConservation(fresh);
});
for(const [n,key,groups] of [
 [0,'man-4',['111m','555z','456p','789s','22p']],
 [1,'sou-8',['111m','555z','456p','789s','22p']],
 [2,'pin-1',['111m','555z','456p','789s','22p']],
 [3,'man-9',['111m','555z','456p','789s','22p']],
 [4,'man-9',['111m','123m','456p','789s','22p']],
] as const)test(`real legal winning hand has ${n} ura copies`,()=>{
 const initial=ura(tsumoGame([...groups],false),key);const g=playerChange(initial,0,{riichi:{declarationTileId:'past'}});
 const r=evaluateWin(g,0,g.players[0].drawnTile!,'tsumo')!;assert.ok(r);assert.equal(r.uraDoraCount,n);assert.equal(r.uraDoraHan,n);inventory(g,initial);
});
for(const id of [1,2,3] as const)test(`child CPU${id} double riichi ignores other seats' prior rivers`,()=>{
 let initial=cpuRiichiStart(id);initial={...initial,dealerId:0};initial=withRiverTile(initial,0,'white');
 const m=establish(initial);assert.equal(m.game.players[id].riichi?.doubleRiichi,true);assert.equal(m.game.players[id].riichi?.ippatsuEligible,true);assertPointConservation(m);inventory(m.game,initial);
});
test('another riichi declaration does not cancel established ippatsu',()=>{
 let initial=cpuRiichiStart(1,[],'north',undefined,{2:['123p','456m','789m','22s','34s']});
 let m=establish(initial);let g=drawTile(m.game,2);m=updateMatchGame(m,g);
 // CPU2's safe draw leaves the fixed 13-tile wait intact.
 m=declareRiichi(m,2,g.players[2].drawnTile!.id);assert.equal(m.game.players[1].riichi?.ippatsuEligible,true);assert.equal(m.game.players[2].riichi?.ippatsuEligible,true);assertPointConservation(m);inventory(m.game,initial);
});
test('scenario C: ordinary riichi expires, next-cycle ron is legal without ippatsu',()=>{
 let initial=withRiverTile(riichiStart('furiten'),0,'white');const liveWall=[...initial.liveWall];
 // Move the first winning draw to CPU1's next cycle, preserving all physical tiles.
 [liveWall[0],liveWall[4]]=[liveWall[4],liveWall[0]];initial={...initial,liveWall};
 let m=establish(initial),g=m.game;for(let i=0;i<3;i++)g=move(g);
 g=drawTile(g,0);assert.equal(g.players[0].riichi?.ippatsuEligible,true);
 g=discardTile(g,0,g.players[0].drawnTile!.id);assert.equal(g.players[0].riichi?.ippatsuEligible,false);
 g=move(g);assert.ok(canDeclareRon(g,0));g=declareRon(g,0);m=updateMatchGame(m,g);
 const win=g.winResult!;assert.equal(win.winMethod,'ron');if(win.winMethod==='ron')assert.deepEqual(win.winners[0].candidate.yaku.map(y=>y.id),['riichi']);assertPointConservation(m);inventory(g,initial);
});
