import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDepositDisplaySticks, renderDepositSticks, depositSvgMarkup } from '../src/rendering/deposit-sticks.ts';
import { renderMatch } from '../src/rendering/match.ts';
import { startMatch, updateMatchGame, nextRound, assertPointConservation } from '../src/game/match.ts';
import { declareRiichi } from '../src/game/riichi.ts';
import { drawTile } from '../src/game/draw.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { riichiStart } from './riichi-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { fixedRound } from './match-fixture.ts';
import { freeze } from './helpers.ts';

for (const [units, expected] of [[0,[]],[1,[[1000,1]]],[4,[[1000,4]]],[5,[[5000,1]]],[6,[[5000,1],[1000,1]]],[10,[[10000,1]]],[12,[[10000,1],[1000,2]]],[17,[[10000,1],[5000,1],[1000,2]]],[25,[[10000,2],[5000,1]]]] as const) {
  test(`exchange ${units} units is immutable and preserves the amount`, () => {
    const result = getDepositDisplaySticks(units);
    assert.deepEqual(result.map(s => [s.points,s.count]), expected);
    assert.equal(result.reduce((sum,s) => sum+s.points*s.count,0), units*1000);
    assert.ok(Object.isFrozen(result)); assert.ok(result.every(Object.isFrozen));
  });
}
for (const value of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, '1', null, undefined]) {
  test(`reject invalid deposit ${String(value)}`, () => assert.throws(() => getDepositDisplaySticks(value as number), RangeError));
}
test('exchange preserves every amount through 100000 points', () => {
  for (let n=0;n<=100;n++) assert.equal(getDepositDisplaySticks(n).reduce((sum,s)=>sum+s.points*s.count,0),n*1000);
});
test('SVG denominations have equal dimensions and distinct dot patterns without external assets', () => {
  for (const [points,count,radii] of [[1000,1,['3.6']],[5000,3,['2.5','2.5','2.5']],[10000,6,Array(6).fill('2.2')]] as const) {
    const svg=depositSvgMarkup(points); assert.equal((svg.match(/<circle /g)||[]).length,count);
    assert.deepEqual([...svg.matchAll(/<circle [^>]*r="([^"]+)"/g)].map(match=>match[1]),radii);
    assert.match(svg,/viewBox="0 0 60 16"/); assert.match(svg,/aria-hidden="true"/); assert.doesNotMatch(svg,/<image|<use|<script/);
  }
});
class Node {
  content={firstElementChild:this}; children: Node[]=[]; hidden=false; disabled=false; textContent=''; className=''; innerHTML='';
  dataset: Record<string,string>={}; attributes: Record<string,string>={};
  setAttribute(k:string,v:string){this.attributes[k]=v;}
  replaceChildren(...children:Node[]){this.children=children;}
  append(...children:Node[]){this.children.push(...children);}
}
test('match rendering updates deposits across riichi, CPU/self collection, draw, next round and reset without mutation', () => {
  const nodes=new Map(['#deposit-sticks','#match-info','#match-result','#next-round'].map(k=>[k,new Node()]));
  const original=globalThis.document;
  globalThis.document={querySelector:(k:string)=>nodes.get(k),createElement:()=>new Node()} as unknown as Document;
  const area=nodes.get('#deposit-sticks')!;
  const render=(m:ReturnType<typeof startMatch>,expected:number[])=>{
    const snapshot=structuredClone(m); freeze(m); renderMatch(m); assert.deepEqual(m,snapshot); assertPointConservation(m);
    assert.deepEqual(area.children.map(n=>Number(n.dataset.points)),expected); assert.equal(area.hidden,expected.length===0);
    assert.equal(expected.reduce((a,b)=>a+b,0),m.depositSticks*1000);
  };
  try {
    const initial=startMatch(riichiStart('cpu-tsumo')); render(initial,[]);
    const ready=declareRiichi(initial,0,initial.game.players[0].drawnTile!.id); render(ready,[1000]);
    const drawn=drawTile(ready.game,1); const won=updateMatchGame(ready,declareTsumo(drawn,1)); render(won,[]); render(won,[]);
    const own={...startMatch(tsumoGame()),points:[19000,25000,25000,25000] as const,depositSticks:6}; render(own,[5000,1000]);
    assert.equal(area.attributes['aria-label'],'供託合計 6000点。5000点棒1本、1000点棒1本');
    assert.ok(area.children.every(n=>n.attributes['aria-hidden']==='true'));
    render(updateMatchGame(own,declareTsumo(own.game,0)),[]);
    const carried=updateMatchGame(ready,fixedRound(0,[0])); render(carried,[1000]); render(nextRound(carried),[1000]);
    render(startMatch(),[]);
    // Same settlement identity must not skip an updated deposit display.
    renderMatch({...initial,depositSticks:5}); assert.deepEqual(area.children.map(n=>n.dataset.points),['5000']);
    renderDepositSticks(area as unknown as HTMLElement,0); assert.equal(area.children.length,0);
  } finally {globalThis.document=original;}
});
