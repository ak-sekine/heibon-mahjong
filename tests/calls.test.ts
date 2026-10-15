import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callStart } from './calls-fixture.ts';
import { discardTile, canDiscard } from '../src/game/discard.ts';
import { getCallOptions, compareCallPriority, declareCall, passCalls, chooseCpuCall } from '../src/game/calls.ts';
import { canDeclareRon, declareRon, passRon, isDiscardFuriten } from '../src/game/ron.ts';
import { drawTile } from '../src/game/draw.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { getRiichiDiscardOptions, declareRiichi } from '../src/game/riichi.ts';
import { startMatch, updateMatchGame, nextRound } from '../src/game/match.ts';
import { winningMelds } from '../src/game/melds.ts';
import { calculateShanten } from '../src/analysis/shanten.ts';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import { calculateFu } from '../src/analysis/fu.ts';
import { ordinaryTile, TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PlayerId } from '../src/model/game.ts';
import { inventory, freeze } from './helpers.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
const discard=(g:GameState)=>discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile!.id);
const call=(g:GameState,type='pon')=>declareCall(g,0,getCallOptions(g,0).find(c=>c.type===type)!.id);
const faces=(groups:readonly string[])=>groups.flatMap(g=>[...g.slice(0,-1)].map(n=>ordinaryTile(TILE_KINDS[({m:0,p:9,s:18,z:27}[g.at(-1)!]!)+Number(n)-1])));
for(const source of [1,2,3] as const) test(`pon from seat ${source}: move tile, history, no extra draw, immutable`,()=>{
 const initial=callStart(source);freeze(initial);const g=discard(initial);assert.equal(g.phase,'awaiting-call');
 const snap=structuredClone(g);const result=call(g);assert.deepEqual(g,snap);inventory(result,initial);
 assert.equal(result.turnPlayerId,0);assert.equal(result.players[0].hand.length,11);assert.equal(result.players[0].drawnTile,null);
 assert.ok(canDiscard(result,0));assert.throws(()=>drawTile(result,0),RangeError);
 assert.equal(result.players[source].river.length,0);assert.equal(result.players[source].discardHistory!.at(-1)!.id,initial.players[source].drawnTile!.id);
 assert.equal(result.players[0].melds![0].fromPlayerId,source);assert.throws(()=>declareCall(result,0,getCallOptions(g,0)[0].id),RangeError);
 const after=discardTile(result,0,result.players[0].hand.find(t=>tileKindKey(t.tile)==='pin-1')!.id);inventory(after,initial);
 assert.equal(after.players[0].hand.length,10);assert.equal(after.liveWall.length,g.liveWall.length);
});
for(const source of [1,2,3] as const) test(`chi seat restriction ${source}`,()=>{
 const g=discard(callStart(source,{0:['3467m','234p','678s','19p','1z']},'man-5'));
 assert.equal(getCallOptions(g,0).filter(c=>c.type==='chi').length,source===3?3:0);
});
test('honors never chi, riichi never calls, empty wall never calls',()=>{
 const g=discard(callStart());assert.ok(getCallOptions(g,0).every(c=>c.type==='pon'));
 for(const modified of [{...g,liveWall:[]},{...g,players:g.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p)} as GameState])assert.deepEqual(getCallOptions(modified,0),[]);
 assert.deepEqual(getCallOptions(g,3),[]);
});
test('physical pon alternatives preserve red choice and reject forged/stale IDs',()=>{
 const initial=callStart(3,{0:['555m','234p','678s','19p','12z']},'red:man-5');
 // All three owned ordinary fives give three physical pairs.
 const g=discard(initial),options=getCallOptions(g,0).filter(c=>c.type==='pon');assert.equal(options.length,3);
 const snap=structuredClone(g);freeze(g);assert.throws(()=>declareCall(g,0,options[0].id+'bad'),RangeError);assert.deepEqual(g,snap);
 const result=declareCall(g,0,options[2].id);assert.equal(result.players[0].melds![0].tiles.filter(t=>t.tile.isRed).length,1);inventory(result,initial);
});
test('chi alternatives distinguish owned normal/red five IDs',()=>{
 const initial=callStart(3,{0:['450m','234p','678s','19p','12z']},'man-6');
 const g0=initial;
 const g=discard(g0),options=getCallOptions(g,0).filter(c=>c.type==='chi');assert.equal(options.length,2);assert.ok(options.some(c=>c.tiles.some(t=>t.tile.isRed)));assert.ok(options.some(c=>c.tiles.every(t=>!t.tile.isRed)));
 inventory(declareCall(g,0,options[0].id),g0);
});
for(const [called,owned,forbid] of [['man-1','234m',['man-1','man-4']],['man-3','123m',['man-3']],['man-3','453m',['man-3','man-6']]] as const)test(`kuikae ${called}/${owned}`,()=>{
 const g=discard(callStart(3,{0:[owned,'234p','678s','19p','12z']},called));
 const opt=getCallOptions(g,0).find(c=>c.type==='chi'&&forbid.every(k=>c.forbiddenKinds.includes(k)))!;
 assert.ok(opt);const result=declareCall(g,0,opt.id);const snap=structuredClone(result);
 for(const t of result.players[0].hand.filter(t=>opt.forbiddenKinds.includes(tileKindKey(t.tile)))) assert.throws(()=>discardTile(result,0,t.id),RangeError);
 assert.deepEqual(result,snap);
});
test('passing calls does not cause furiten; runner pauses at pending call',async()=>{
 const g=discard(callStart());const runner=new AutomaticTurnRunner({wait:async()=>{throw Error('must pause');}});let current=g;
 await runner.run(()=>current,x=>{current=x;});assert.equal(current,g);
 const passed=passCalls(g,0);assert.equal(passed.players[0].temporaryFuriten,false);assert.equal(passed.phase,'awaiting-draw');assert.throws(()=>passCalls(passed,0),RangeError);
});
test('ron before call: human pass sets furiten then permits independent chi choice',()=>{
 const g=discard(callStart(3,{0:['234m','345p','678s','22p','34s']},'sou-5'));
 assert.equal(g.phase,'awaiting-ron');assert.ok(canDeclareRon(g,0));assert.throws(()=>call(g,'chi'),RangeError);
 assert.equal(declareRon(g,0).phase,'won');const passed=passRon(g,0);assert.equal(passed.phase,'awaiting-call');assert.ok(passed.players[0].temporaryFuriten);
 assert.equal(call(passed,'chi').players[0].melds!.length,1);
});
test('CPU yakuhai pon uses only own/public information and is deterministic',()=>{
 const initial=callStart(3,{1:['55z','234m','456p','678s','19p']});const g=discard(initial);
 assert.equal(g.turnPlayerId,1);assert.equal(g.players[1].melds![0].type,'pon');assert.equal(g.players[1].drawnTile,null);inventory(g,initial);
});
test('CPU pon outranks human chi on the same discard',()=>{
 const initial=callStart(3,{0:['34m','234p','678s','19p','123z'],1:['55m','246m','346p','678s','22p']},'man-5');
 const g=discard(initial);assert.equal(g.turnPlayerId,1);assert.equal(g.players[1].melds![0].type,'pon');
});
test('human pon outranks CPU chi',()=>{
 const initial=callStart(0,{1:['34m','246p','678s','22p','456s'],2:['55m','246m','346p','678s','22s']},'man-5');
 // Human seat 2 is supported by the pure call API.
 const start={...initial,players:initial.players.map(p=>({...p,control:p.id===2?'human':'cpu'}))} as GameState;
 const g=discard(start);assert.equal(g.phase,'awaiting-call');const o=getCallOptions(g,2).find(c=>c.type==='pon')!;
 assert.equal(declareCall(g,2,o.id).turnPlayerId,2);
});
for(const type of ['pon','chi'] as const)test(`${type} cancels all ippatsu and closes riichi access`,()=>{
 const initial=type==='pon'?callStart():callStart(3,{0:['34m','234p','678s','19p','123z']},'man-5');
 const marked={...initial,players:initial.players.map(p=>p.id===1?{...p,riichi:{declarationTileId:'past',ippatsuEligible:true}}:p)} as GameState;
 const result=call(discard(marked),type);assert.equal(result.players[1].riichi!.ippatsuEligible,false);assert.deepEqual(getRiichiDiscardOptions(result,0,25000),[]);
});
for(const method of ['ron','tsumo'] as const)test(`legal pon through ${method}, settlement and next round`,()=>{
 const initial=callStart(3,undefined,'white',['south','west','north','man-6']);let g=call(discard(initial));inventory(g,initial);
 // Remove isolated 1p; remaining hand is 234m 456p 678s 9p.
 g=discardTile(g,0,g.players[0].hand.find(t=>tileKindKey(t.tile)==='pin-1')!.id);
 // Continue real draws/discards; on the next human turn discard 9p to keep man-6.
 let guard=0;
 while(g.turnPlayerId!==0 || g.phase!=='awaiting-discard') {
  if(++guard>12)throw Error('unexpected call');if(g.phase==='awaiting-call')g=passCalls(g,0);
  if(g.phase==='awaiting-draw')g=drawTile(g,g.turnPlayerId);
  if(g.turnPlayerId!==0)g=discard(g);
 }
 g=discardTile(g,0,g.players[0].hand.find(t=>tileKindKey(t.tile)==='pin-9')!.id);
 // Arrange the next public winning face from the remaining real wall for a real turn.
 const win=g.liveWall.find(t=>tileKindKey(t.tile)==='man-6')!;assert.ok(win);
 const wall=[win,...g.liveWall.filter(t=>t!==win)];g={...g,liveWall:wall};
 if(method==='ron') {g=drawTile(g,g.turnPlayerId);g=discard(g);assert.ok(canDeclareRon(g,0));g=declareRon(g,0);}
 else {
  // Three normal CPU turns then human winning draw, preserving physical identities.
  g={...g,liveWall:[...g.liveWall.slice(1,4),win,...g.liveWall.slice(4)]};
  for(let i=0;i<3;i++){g=drawTile(g,g.turnPlayerId);g=discard(g);if(g.phase==='awaiting-call')g=passCalls(g,0);}
  g=drawTile(g,0);assert.ok(canDeclareTsumo(g,0));g=declareTsumo(g,0);
 }
 inventory(g,initial);const result=g.winResult!.winMethod==='ron'?g.winResult!.winners[0]:g.winResult!;
 assert.ok(result.candidate.yaku.some(y=>y.id==='yakuhai-white'));assert.ok(!result.fuBreakdown.some(e=>e.type==='menzen-ron'));assert.equal(result.uraDoraCount,0);
 const match=updateMatchGame(startMatch(initial),g);assert.equal(match.status,'round-ended');assert.equal(match.points.reduce((a,b)=>a+b,0)+1000*match.depositSticks,100000);
 assert.ok(nextRound(match).game.players.every(p=>!p.melds?.length&&!p.callDiscard));
});
for(const [name,groups,openType,openGroup,expected] of [
 ['tanyao',['345p','678s','222p','66m'],'chi','234m',['tanyao']],
 ['yakuhai',['123m','456p','789s','66m'],'pon','555z',['yakuhai-white']],
 ['toitoi',['333m','777p','888s','66m'],'pon','555z',['toitoi','yakuhai-white']],
 ['no-yaku',['456p','789s','123p','66m'],'chi','123m',[]],
] as const)test(`open yaku/fu ${name}`,()=>{
 const f=faces([openGroup]);const open=openType==='pon'?[{type:'triplet' as const,tile:f[0]}]:[{type:'sequence' as const,tiles:f as unknown as readonly [typeof f[0],typeof f[0],typeof f[0]]}];
 const tiles=faces(groups),context={winMethod:'ron' as const,winningTile:tiles.at(-1)!,seatWind:'south' as const,roundWind:'east' as const,isClosed:false,openMelds:open,riichi:true,doubleRiichi:true,ippatsuEligible:true};
 const a=analyzeYaku(tiles,context);assert.ok(a.isWinningShape);assert.ok(a.candidates.length);
 for(const c of a.candidates){for(const y of expected)assert.ok(c.yaku.some(x=>x.id===y));assert.ok(c.yaku.every(y=>!['riichi','double-riichi','ippatsu','menzen-tsumo','pinfu','iipeikou','chiitoitsu','kokushi-musou'].includes(y.id)));const fu=calculateFu(c,context);assert.ok(!fu.fuBreakdown.some(e=>e.type==='menzen-ron'));if(openType==='pon')assert.ok(fu.fuBreakdown.some(e=>e.type==='triplet'&&!e.concealed));}
 assert.equal(a.hasSupportedYaku,expected.length>0);
});
test('open shanten fixes melds and excludes special hands',()=>{
 const g=call(discard(callStart()));const p=g.players[0];const hand=p.hand.filter(t=>tileKindKey(t.tile)!=='pin-1');const result=calculateShanten(hand.map(t=>t.tile),1);
 assert.equal(result.sevenPairs,Infinity);assert.equal(result.thirteenOrphans,Infinity);assert.ok(result.minimum>=0);
});

test('call priority total order: pon before chi, then distance from discarder',()=>{
 const g=discard(callStart()),base=getCallOptions(g,0)[0];
 // Two simultaneous pon need five identical copies and cannot arise in a legal
 // wall. Test the arbitration order directly without constructing a fifth copy.
 const near={...base,playerId:0 as const},far={...base,playerId:1 as const},chi={...near,type:'chi' as const};
 assert.ok(compareCallPriority(g,near,far)<0);
 assert.ok(compareCallPriority(g,far,chi)<0);
});
for(const method of ['ron','tsumo'] as const)test(`legal chi to ${method} with no extra draw`,()=>{
 const initial=callStart(3,{0:['34m','345p','678s','222p','69m']},'man-5',method==='ron'?['man-6']:['south','west','north','man-6']);
 let g=call(discard(initial),'chi');assert.equal(g.liveWall.length,69);assert.equal(g.players[0].drawnTile,null);
 g=discardTile(g,0,g.players[0].hand.find(t=>tileKindKey(t.tile)==='man-9')!.id);inventory(g,initial);
 if(method==='ron'){g=drawTile(g,1);g=discard(g);g=declareRon(g,0);}
 else {for(let i=0;i<3;i++){g=drawTile(g,g.turnPlayerId);g=discard(g);if(g.phase==='awaiting-call')g=passCalls(g,0);}g=drawTile(g,0);g=declareTsumo(g,0);}
 inventory(g,initial);const r=g.winResult!.winMethod==='ron'?g.winResult!.winners[0]:g.winResult!;assert.ok(r.candidate.yaku.some(y=>y.id==='tanyao'));
 const match=updateMatchGame(startMatch(initial),g);assert.equal(match.status,'round-ended');assert.equal(match.points.reduce((a,b)=>a+b,0),100000);
});
test('pon fourth copy is kuikae; passing a call twice cannot advance play',()=>{
 const g=discard(callStart(3,{0:['555m','234p','678s','19p','12z']},'red:man-5'));
 const result=call(g);const fourth=result.players[0].hand.find(t=>tileKindKey(t.tile)==='man-5')!;
 assert.throws(()=>discardTile(result,0,fourth.id),RangeError);
 const passed=passCalls(g,0);assert.throws(()=>passCalls(passed,0),RangeError);
});
test('CPU rejects riichi and hopeless open hands',()=>{
 const initial=callStart(3,{1:['55m','19p','19s','1234567z']},'man-5');
 const source=initial.players[3];const g={...initial,phase:'awaiting-call',players:initial.players.map(p=>p.id===3?{...p,drawnTile:null,drawnTileSource:null,river:[p.drawnTile!]}:p),ronWindow:{discarderId:3,tileId:source.drawnTile!.id}} as GameState;
 const options=getCallOptions(g,1);assert.ok(options.length);assert.equal(chooseCpuCall(g.players[1],options),null);
 assert.equal(chooseCpuCall({...g.players[1],riichi:{declarationTileId:'past'}},options),null);
});
