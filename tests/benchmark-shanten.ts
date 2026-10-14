import { calculateShanten, ShantenCalculator, tileCounts } from '../src/analysis/shanten.ts';
import { evaluateShantenDiscards } from '../src/game/cpu.ts';
import { startGame } from '../src/game/start.ts';
import { seeded } from './helpers.ts';
import { simulate } from './shanten-simulation.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
const summary=(xs:number[])=>{const sorted=[...xs].sort((a,b)=>a-b);return {mean:xs.reduce((a,b)=>a+b,0)/xs.length,median:sorted[Math.floor(xs.length/2)],max:sorted.at(-1)};};
const games=Array.from({length:120},(_,i)=>startGame(seeded(i),1));
for(const g of games.slice(0,20)){calculateShanten(g.players[1].hand.map(t=>t.tile));evaluateShantenDiscards({tiles:[...g.players[1].hand,g.players[1].drawnTile!],visibleTiles:[g.deadWall[4]]});}
const shanten:number[]=[],selection:number[]=[],caches:number[]=[],candidates:number[]=[];
for(const g of games){const p=g.players[1];let t=performance.now();calculateShanten(p.hand.map(t=>t.tile));shanten.push(performance.now()-t);
 t=performance.now();const calc=new ShantenCalculator(),counts=tileCounts([...p.hand,p.drawnTile!].map(t=>t.tile),14);for(let i=0;i<34;i++)if(counts[i]){counts[i]--;calc.calculate(counts);counts[i]++;}candidates.push(performance.now()-t);
 t=performance.now();evaluateShantenDiscards({tiles:[...p.hand,p.drawnTile!],visibleTiles:[g.deadWall[4]]},n=>caches.push(n));selection.push(performance.now()-t);
}
const comparisons=[];
for(const seed of [0,1,2,3,4,5,6,7])for(const random of [false,true]){const r=await simulate(seed,random);comparisons.push({seed,random,initialShanten:r.initialShanten,riichiSeats:[...new Set(r.records.filter(x=>x.riichi).map(x=>x.seat))],tenpaiSeats:[...new Set(r.records.filter(x=>x.shanten===0).map(x=>x.seat))],bestShanten:[1,2,3].map(id=>Math.min(r.initialShanten[id-1],...r.records.filter(x=>x.seat===id).map(x=>x.shanten))),records:r.records});}
const report={environment:{node:process.version,platform:process.platform},hands:120,unit:'ms',shanten:summary(shanten),fourteenCandidates:summary(candidates),selectionIncludingEffectiveTiles:summary(selection),cacheEntries:summary(caches),comparisons};
mkdirSync('docs/step13.2.1',{recursive:true});writeFileSync('docs/step13.2.1/benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,comparisons:comparisons.map(({records,...r})=>r)},null,2));
