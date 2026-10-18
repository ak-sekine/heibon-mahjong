import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callStart,openWinGame} from './calls-fixture.ts';
import {inventory,freeze} from './helpers.ts';
import {evaluateWin} from '../src/game/win.ts';
import {canDeclareTsumo,declareTsumo} from '../src/game/tsumo.ts';
import {declareRon,getWaitingTileKinds,isDiscardFuriten,resolveDiscardRon} from '../src/game/ron.ts';
import {discardTile} from '../src/game/discard.ts';
import {declareCall,getCallOptions,passCalls,chooseCpuCall,resolveDiscardCalls} from '../src/game/calls.ts';
import {declareRiichi} from '../src/game/riichi.ts';
import {startMatch,updateMatchGame} from '../src/game/match.ts';
import {winningMelds} from '../src/game/melds.ts';
import {tileKindKey} from '../src/model/tile.ts';
import {AutomaticTurnRunner} from '../src/game/automatic-turns.ts';
import {GameController} from '../src/ui/controller.ts';
import {ronStart} from './ron-fixture.ts';
import {chooseShantenDiscard,chooseShantenDiscardAsync} from '../src/game/cpu.ts';
import type {GameState} from '../src/model/game.ts';
for(const method of ['ron','tsumo'] as const)for(const [name,hand,open,han] of [
 ['tanyao',['345p','678s','222p','66m'],['234m'],1],
 ['yakuhai',['123m','456p','789s','66m'],['555z'],1],
 ['toitoi',['333m','777p','888s','66m'],['555z'],5],
 ['two melds',['678s','222p','66m'],['234m','345p'],1],
 ['four melds',['66m'],['234m','345p','678s','222p'],1],
] as const)test(`open ${name} ${method}: score and tile conservation`,()=>{
 const g=openWinGame(hand,open,method);freeze(g);inventory(g,g);
 const won=method==='ron'?declareRon(g,0):declareTsumo(g,0);inventory(won,g);
 const result=won.winResult!.winMethod==='ron'?won.winResult!.winners[0]:won.winResult!;
 assert.equal(result.yakuHan,han);assert.equal(result.uraDoraCount,0);
 assert.ok(!result.fuBreakdown.some(e=>e.type==='menzen-ron'));
 assert.ok(result.fu!>=30 || method==='tsumo');
});
for(const method of ['ron','tsumo'] as const)test(`dora-only open hand cannot ${method}`,()=>{
 const g=openWinGame(['456p','789s','123p','66m'],['123m'],method);
 // Actual red dragon dora indicator can be swapped without fabricating a tile.
 const win=method==='ron'?g.players[3].river.at(-1)!:g.players[0].drawnTile!;
 assert.equal(evaluateWin(g,0,win,method),null);assert.equal(canDeclareTsumo(g,0),false);
 assert.throws(()=>method==='ron'?declareRon(g,0):declareTsumo(g,0),RangeError);
});
test('normal and red dora in open meld both count, ura does not',()=>{
 const g=openWinGame(['345p','678s','222p','66m'],['406m'],'ron','man-4');
 const result=declareRon(g,0).winResult!;assert.equal(result.winMethod,'ron');if(result.winMethod!=='ron')throw Error();
 assert.equal(result.winners[0].doraCount,1);assert.equal(result.winners[0].redDoraCount,1);assert.equal(result.winners[0].totalHanIncludingDora,3);
});
test('open ron minimum 30 fu and explicit adjustment',()=>{
 const g=openWinGame(['345p','678s','234p','66m'],['234m'],'ron');
 const result=declareRon(g,0).winResult!;if(result.winMethod!=='ron')throw Error();
 // Winning pair is tanki and contributes wait fu; choose ryanmen tile as win instead.
 const p=g.players[0],t=p.hand.find(t=>tileKindKey(t.tile)==='sou-8')!,win=g.players[3].river[0];
 const adjusted={...g,players:g.players.map(x=>x.id===0?{...x,hand:x.hand.map(v=>v===t?win:v)}:x.id===3?{...x,river:[t]}:x),ronWindow:{discarderId:3,tileId:t.id}} as GameState;
 const a=declareRon(adjusted,0).winResult!;if(a.winMethod!=='ron')throw Error();assert.equal(a.winners[0].fu,30);assert.ok(a.winners[0].fuBreakdown.some(e=>e.type==='open-ron-minimum'));
});
test('open and concealed terminal triplet fu remain distinct',()=>{
 const g=openWinGame(['111m','777p','888s','66m'],['555z'],'tsumo');const r=declareTsumo(g,0).winResult!;if(r.winMethod!=='tsumo')throw Error();
 const entries=r.fuBreakdown.filter(e=>e.type==='triplet');assert.ok(entries.some(e=>e.type==='triplet'&&!e.concealed&&e.fu===4));assert.ok(entries.some(e=>e.type==='triplet'&&e.concealed&&e.fu===8));
});
test('called discard remains in furiten history and fifth-copy waits are excluded',()=>{
 const g=openWinGame(['345p','678s','222p','66m'],['234m'],'ron');
 const valid=g.players[0],six=g.players[3].river[0];
 const waits=getWaitingTileKinds(valid.hand.map(t=>t.tile),winningMelds(valid.melds));assert.ok(waits.some(k=>tileKindKey(k)==='man-6'));
 assert.equal(isDiscardFuriten({...valid,river:[],discardHistory:[six]}),true);
});
for(const winners of [[0,1],[0,1,2]] as const)test(`multi ron beats all call processing: ${winners.length}`,()=>{
 const g=ronStart(3,winners);const discarded=discardTile(g,3,g.players[3].drawnTile!.id);const won=declareRon(discarded,0);assert.equal(won.winResult!.winMethod,'ron');if(won.winResult!.winMethod==='ron')assert.equal(won.winResult!.winners.length,winners.length);assert.ok(won.players.every(p=>!p.melds?.length));
});
test('CPU ron precedes available human pon',()=>{
 const g=callStart(3,{0:['55m','234p','678s','19p','123z'],1:['123m','456p','789s','22p','46m']},'man-5');
 // CPU kanchan has no yaku until riichi, so establish an existing riichi marker.
 const marked={...g,players:g.players.map(p=>p.id===1?{...p,riichi:{declarationTileId:'past'}}:p)} as GameState;
 const result=discardTile(marked,3,marked.players[3].drawnTile!.id);assert.equal(result.phase,'won');assert.ok(!result.players[0].melds?.length);
});
test('riichi declaration taken by pon establishes deposit, cancels its ippatsu',()=>{
 const initial=callStart(3,{0:['55m','234p','678s','19p','123z'],3:['123p','456p','789s','22m','46s']},'man-5');
 let m=declareRiichi(startMatch(initial),3,initial.players[3].drawnTile!.id);assert.equal(m.game.phase,'awaiting-call');assert.equal(m.depositSticks,1);assert.ok(m.game.players[3].riichi?.ippatsuEligible);
 m=updateMatchGame(m,declareCall(m.game,0,getCallOptions(m.game,0).find(c=>c.type==='pon')!.id));assert.equal(m.depositSticks,1);assert.equal(m.points[3],24000);assert.ok(m.game.players[3].riichi);assert.equal(m.game.players[3].riichi!.ippatsuEligible,false);
});
test('prior calls prevent double riichi but allow a fresh ippatsu',()=>{
 const initial=callStart(3,{3:['123p','456p','789s','22m','46s']},'north');
 const match=declareRiichi(startMatch({...initial,callsMade:true}),3,initial.players[3].drawnTile!.id);assert.equal(match.game.players[3].riichi!.doubleRiichi,false);assert.equal(match.game.players[3].riichi!.ippatsuEligible,true);
});
test('CPU call policy ignores other hidden hands and wall contents',()=>{
 const g=callStart(3,{1:['55z','234m','456p','678s','19p']});const window={...g,phase:'awaiting-ron',players:g.players.map(p=>p.id===3?{...p,drawnTile:null,drawnTileSource:null,river:[p.drawnTile!]}:p),ronWindow:{discarderId:3,tileId:g.players[3].drawnTile!.id}} as GameState;
 const options=getCallOptions(window,1);const before=chooseCpuCall(window.players[1],options);
 assert.ok(before);const hidden={...window,liveWall:[...window.liveWall].reverse(),deadWall:[...window.deadWall].reverse(),players:window.players.map(p=>p.id===0?{...p,hand:[...p.hand].reverse()}:p)} as GameState;
 assert.equal(chooseCpuCall(hidden.players[1],getCallOptions(hidden,1))!.id,before.id);
});
test('open CPU asynchronous discard obeys kuikae and abort',async()=>{
 const initial=callStart(3,{1:['55z','234m','456p','678s','19p']});const g=discardTile(initial,3,initial.players[3].drawnTile!.id);
 const sync=chooseShantenDiscard(g,1);assert.ok(!g.players[1].callDiscard!.forbiddenKinds.includes(tileKindKey(g.players[1].hand.find(t=>t.id===sync)!.tile)));
 const abort=new AbortController();abort.abort();const pending=chooseShantenDiscardAsync(g,1,abort.signal);assert.equal(await pending,null);
});
test('reset aborts CPU discard after a call and clears all melds',async()=>{
 const initial=callStart(3,{1:['55z','234m','456p','678s','19p']});let release!:()=>void;
 const ui=new GameController(()=>initial,{wait:()=>new Promise(r=>{release=r;})});
 ui.game=discardTile(initial,3,initial.players[3].drawnTile!.id);const runner=new AutomaticTurnRunner({wait:()=>new Promise(r=>{release=r;})});let g=ui.game;
 const pending=runner.run(()=>g,x=>{g=x;});runner.cancel();g=initial;release();await pending;assert.equal(g,initial);
 ui.newGame();assert.ok(ui.game.players.every(p=>!p.melds?.length));
});

test('a physical ID duplicated between concealed and public tiles cannot win',()=>{
 const g=openWinGame(['345p','678s','222p','66m'],['234m'],'tsumo');
 const p=g.players[0],meld=p.melds![0];
 const invalid={...g,players:g.players.map(x=>x.id===0?{...p,melds:[{...meld,tiles:[{...meld.tiles[0],id:p.hand[0].id},...meld.tiles.slice(1)]}]}:x)} as GameState;
 const snapshot=structuredClone(invalid);assert.equal(canDeclareTsumo(invalid,0),false);assert.throws(()=>declareTsumo(invalid,0),RangeError);assert.deepEqual(invalid,snapshot);
});
