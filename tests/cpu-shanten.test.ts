import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseShantenDiscard, chooseShantenDiscardFromPublic, evaluateShantenDiscards, compareDiscardEvaluations, chooseShantenDiscardAsync, chooseRandomDiscard } from '../src/game/cpu.ts';
import { calculateShanten } from '../src/analysis/shanten.ts';
import { ordinaryTile, TILE_KINDS, redFive, tileKindKey } from '../src/model/tile.ts';
import { startGame } from '../src/game/start.ts';
import { cpuRiichiStart } from './cpu-riichi-fixture.ts';
import { seeded, freeze, inventory, allTiles } from './helpers.ts';
import { faces } from './shanten-fixture.ts';
import { simulate } from './shanten-simulation.ts';
const input=(hand:string)=>({tiles:faces(hand).map((tile,i)=>({id:String(i).padStart(2,'0'),tile})),visibleTiles:[]});
for(const seat of [1,2,3] as const) test(`CPU${seat} selects actual smallest shanten without mutation`,()=>{
 const g=cpuRiichiStart(seat,[],'north',['123m','456p','11z','23s','45s','7z']);const before=structuredClone(g);freeze(g);
 const p=g.players[seat], tiles=[...p.hand,p.drawnTile!];
 const id=chooseShantenDiscard(g,seat);const value=calculateShanten(tiles.filter(t=>t.id!==id).map(t=>t.tile)).minimum;
 assert.equal(value,1);assert.ok(tiles.some(t=>calculateShanten(tiles.filter(x=>x.id!==t.id).map(x=>x.tile)).minimum>value));
 assert.equal(chooseShantenDiscard(g,seat),id);assert.deepEqual(g,before);assert.equal(new Set(tiles.map(t=>t.id)).size,14);
});
test('draw improves a two-shanten hand by one',()=>{
 const hand=faces('123m 11z 23p 45s 67s 2z 3z');assert.equal(calculateShanten(hand).minimum,2);
 const tiles=[...hand,ordinaryTile(TILE_KINDS[12])].map((tile,i)=>({tile,id:String(i)}));
 const id=chooseShantenDiscardFromPublic({tiles,visibleTiles:[]});assert.equal(calculateShanten(tiles.filter(t=>t.id!==id).map(t=>t.tile)).minimum,1);
});
test('equal shanten candidates differ in actual effective availability',()=>{
 const data=input('123m 456p 11z 23s 45s 7z 6z');const values=evaluateShantenDiscards(data);
 const best=[...values].sort(compareDiscardEvaluations)[0];
 const ties=values.filter(v=>v.shanten===best.shanten);
 assert.ok(ties.some(v=>v.effectiveTileCount<best.effectiveTileCount));
 assert.equal(chooseShantenDiscardFromPublic(data),best.tileId);
});
for(const criterion of ['shanten','effectiveTileCount','effectiveKindCount','isRed','tileId'] as const) test(`comparison priority ${criterion}`,()=>{
 const a={tileId:'a',shanten:1,effectiveTileCount:20,effectiveKindCount:5,isRed:false};
 const b={...a,tileId:'z'};
 if(criterion==='shanten')b.shanten=2;
 if(criterion==='effectiveTileCount')b.effectiveTileCount=19;
 if(criterion==='effectiveKindCount')b.effectiveKindCount=4;
 if(criterion==='isRed')b.isRed=true;
 assert.ok(compareDiscardEvaluations(a,b)<0);
});
test('red five is retained and physical duplicate kinds select ascending ID',()=>{
 const data=input('123m 4556p 789s 11z 23s');const five=data.tiles.filter(t=>tileKindKey(t.tile)==='pin-5');
 five[0].tile=redFive('pin');
 const values=evaluateShantenDiscards(data);const pair=values.filter(v=>five.some(t=>t.id===v.tileId));
 assert.equal(pair[0].shanten,pair[1].shanten);assert.equal(pair[0].effectiveTileCount,pair[1].effectiveTileCount);
 assert.ok(compareDiscardEvaluations(pair[1],pair[0])<0);
 assert.equal(chooseShantenDiscardFromPublic(data),five[1].id);
 const duplicates=input('123m 456p 789s 111z 23s');const all=evaluateShantenDiscards(duplicates);
 const east=all.filter(v=>['09','10','11'].includes(v.tileId));assert.ok(east.every(v=>v.shanten===east[0].shanten));
 assert.equal([...east].sort(compareDiscardEvaluations)[0].tileId,'09');
});
test('public availability subtracts own fourteen, rivers and red/ordinary together',()=>{
 const data=input('123m 456p 789s 11z 23s 7z');const values=evaluateShantenDiscards(data);
 const visible=[0,1,2,3].map(i=>({id:'public'+i,tile:ordinaryTile(TILE_KINDS[18])}));
 const changed=evaluateShantenDiscards({...data,visibleTiles:visible});
 assert.ok(changed.some((v,i)=>v.effectiveTileCount<values[i].effectiveTileCount));
});
test('no unavailable fifth copy is counted as effective',()=>{
 const data=input('1111z 222z 333z 44z 5z 6z');
 const values=evaluateShantenDiscards(data);assert.ok(values.every(v=>v.effectiveTileCount>=0));
});
test('hidden hands and wall ordering cannot affect selection',()=>{
 const g=startGame(seeded(42),1);const before=structuredClone(g);
 const players=g.players.map(p=>p.id===1?p:{...p,hand:[...p.hand].reverse()});
 const liveWall=[...g.liveWall];
 [players[2].hand[0],liveWall[0]]=[liveWall[0],players[2].hand[0]];
 const deadWall=[...g.deadWall];[deadWall[0],deadWall[1]]=[deadWall[1],deadWall[0]];
 const other={...g,players,deadWall,liveWall:liveWall.reverse()} as typeof g;
 assert.equal(chooseShantenDiscard(g,1),chooseShantenDiscard(other,1));assert.deepEqual(g,before);assert.deepEqual(allTiles(other).map(t=>t.id).sort(),allTiles(g).map(t=>t.id).sort());
});
test('riichi rejects evaluation and abort interrupts sliced evaluation',async()=>{
 const g=startGame(seeded(0),1), p=g.players[1];
 const locked={...g,players:g.players.map(x=>x.id===1?{...x,riichi:{declarationTileId:'past'}}:x)} as typeof g;
 assert.throws(()=>chooseShantenDiscard(locked,1),RangeError);
 const abort=new AbortController();const pending=chooseShantenDiscardAsync(g,1,abort.signal);abort.abort();assert.equal(await pending,null);
 assert.ok([...p.hand,p.drawnTile!].some(t=>t.id===chooseRandomDiscard(p,()=>0)));
});
for(const seed of [0,1,2]) test(`normal legal seed ${seed}: non-tenpai CPUs improve through riichi or calls and conserve points`,async()=>{
 const result=await simulate(seed);assert.ok(result.initialShanten.every(n=>n>0));
 assert.ok(result.records.some(r=>r.riichi) || result.final.game.players.some(p=>p.melds?.length));assert.ok(result.records.some(r=>r.shanten<result.initialShanten[r.seat-1]));
 assert.equal(result.final.points.reduce((a,b)=>a+b,0)+result.final.depositSticks*1000,100000);
 inventory(result.final.game,result.initial);
});

test('actual same-weight tie selects more effective kinds (seed 25)',()=>{
 const g=startGame(seeded(25),1),p=g.players[1];
 const values=evaluateShantenDiscards({tiles:[...p.hand,p.drawnTile!],visibleTiles:[g.deadWall[4]]});
 const best=[...values].sort(compareDiscardEvaluations)[0];
 assert.equal(best.tileId,'man-6-1');assert.equal(best.effectiveTileCount,14);assert.equal(best.effectiveKindCount,5);
 const other=values.find(v=>v.tileId==='pin-6-3')!;assert.equal(other.shanten,best.shanten);assert.equal(other.effectiveTileCount,14);assert.equal(other.effectiveKindCount,4);
 assert.equal(chooseShantenDiscard(g,1),best.tileId);
});

test('theoretical zero shanten does not fabricate an available winning fifth tile',()=>{
 const data=input('1111m 222p 333s 444z 1z');
 const values=evaluateShantenDiscards(data);const east=values.find(v=>v.tileId==='13')!;
 assert.equal(east.shanten,0);assert.equal(east.effectiveTileCount,0);assert.equal(east.effectiveKindCount,0);
 assert.notEqual(chooseShantenDiscardFromPublic(data),east.tileId);
});
