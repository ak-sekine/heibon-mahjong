import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResultDialog } from '../src/ui/result-dialog.ts';
import { startMatch, settleRound } from '../src/game/match.ts';
import { fixedRound, fixedRon } from './match-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import type { GameState } from '../src/model/game.ts';

for (const scenario of ['human-ron','human-tsumo','cpu-ron','cpu-tsumo','draw','end','double','triple','triple-abortive']) test(`result dialog lifecycle: ${scenario}`, () => {
  class Node {
    open = false; hidden = false; textContent = ''; scrollTop = 100; focused = false; opens = 0;
    listeners: Record<string, (event: { preventDefault(): void }) => void> = {};
    classList = { add() {}, remove() {}, toggle() {} };
    addEventListener(name: string, callback: typeof this.listeners[string]) { this.listeners[name] = callback; }
    focus() { this.focused = true; }
    showModal() { this.open = true; this.opens++; }
    close() { this.open = false; this.listeners.close?.({ preventDefault() {} }); }
    click() { this.listeners.click?.({ preventDefault() {} }); }
  }
  const nodes = new Map(['#result-dialog','#show-result','#view-table','#result-title','#result-body','#online-result-content'].map(id => [id,new Node()]));
  const original = globalThis.document;
  globalThis.document = { querySelector: (s: string) => nodes.get(s), documentElement: new Node() } as unknown as Document;
  try {
    const ui = new ResultDialog();
    const initial = startMatch(); ui.update(initial);
    assert.equal(nodes.get('#result-dialog')!.open,false);
    const game = scenario === 'human-tsumo' ? declareTsumo(tsumoGame(),0)
      : scenario === 'cpu-tsumo' ? declareTsumo(cpuTsumoGame(1),1)
      : scenario === 'draw' ? fixedRound(0,[0,2])
      : scenario === 'end' ? fixedRon(3,[0],2)
      : scenario === 'triple-abortive' ? { ...fixedRon(0, [0]), phase: 'wall-exhausted', abortiveDraw: 'triple-ron',
        ronWindow: null, winResult: null } as GameState
        : fixedRon(0, scenario === 'cpu-ron' ? [1] : scenario === 'double' ? [0,2] : scenario === 'triple' ? [0,1,2] : [0]);
    const match = settleRound({...initial,game, ...(scenario === 'end' ? {roundNumber:4,dealerId:3 as const} : {})});
    const snapshot = structuredClone(match);
    ui.update(match);
    if (scenario === 'triple-abortive') assert.match(nodes.get('#result-title')!.textContent, /三家和/u);
    assert.equal(nodes.get('#result-dialog')!.open,false);
    assert.equal(nodes.get('#result-body')!.scrollTop,0);
    for (let i=0;i<10;i++) {
      ui.open();
      assert.equal(nodes.get('#result-dialog')!.open,true);
      assert.equal(nodes.get('#view-table')!.focused,true);
      assert.equal(nodes.get('#result-dialog')!.opens,i+1);
      ui.open();
      assert.equal(nodes.get('#result-dialog')!.opens,i+1);
      nodes.get('#view-table')!.click();
      assert.equal(nodes.get('#result-dialog')!.open,false);
      assert.equal(nodes.get('#show-result')!.focused,true);
      ui.update({...match});
      assert.equal(nodes.get('#result-dialog')!.open,false);
      assert.deepEqual(match,snapshot);
    }
    ui.open();
    assert.equal(nodes.get('#result-dialog')!.open,true);
    let prevented=false;
    nodes.get('#result-dialog')!.listeners.cancel({preventDefault(){prevented=true;}});
    assert.equal(prevented,true); assert.equal(nodes.get('#result-dialog')!.open,false);
    ui.update(startMatch());
    assert.equal(nodes.get('#result-dialog')!.open,false);
  } finally { globalThis.document = original; }
});
