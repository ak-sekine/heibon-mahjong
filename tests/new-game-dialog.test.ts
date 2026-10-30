import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NewGameDialog } from '../src/ui/new-game-dialog.ts';
import { startMatch, settleRound } from '../src/game/match.ts';
import { fixedRon } from './match-fixture.ts';

for (const status of ['playing', 'round-ended', 'match-ended']) {
  for (const trigger of ['#new-game', '#result-new-game']) {
    test(`new game confirmation preserves ${status} until approved: ${trigger}`, () => {
      class Node {
        open = false;
        textContent = '';
        classes = new Set<string>();
        classList = { toggle: (name: string, force?: boolean) => { if (force ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); } };
        listeners: Record<string, (event: { preventDefault(): void }) => void> = {};
        addEventListener(name: string, callback: typeof this.listeners[string]) { this.listeners[name] = callback; }
        focus() { focused = this; }
        showModal() { this.open = true; }
        close() { this.open = false; this.listeners.close?.({ preventDefault() {} }); }
        click() { this.listeners.click?.({ preventDefault() {} }); }
      }
      let focused: Node | null = null;
      const nodes = new Map(['#new-game-dialog', '#new-game', '#result-new-game', '#main-menu-toggle', '#cancel-new-game', '#confirm-new-game', '#new-game-question'].map(id => [id, new Node()]));
      const original = globalThis.document;
      globalThis.document = { querySelector: (id: string) => nodes.get(id) } as unknown as Document;
      let match = status === 'playing' ? startMatch() : settleRound({ ...startMatch(), game: status === 'match-ended' ? fixedRon(3, [0], 2) : fixedRon(0, [1]), ...(status === 'match-ended' ? { roundNumber: 4, dealerId: 3 as const } : {}) });
      const snapshot = structuredClone(match);
      let resets = 0;
      try {
        new NewGameDialog(() => { resets++; match = startMatch(); }, () => status !== 'match-ended');
        for (const dismissal of ['button', 'escape', 'close']) {
          nodes.get(trigger)!.click();
          const confirm = nodes.get('#confirm-new-game')!;
          assert.equal(confirm.classes.has('ui-button--d2'), status !== 'match-ended');
          assert.equal(confirm.classes.has('ui-button--a'), status === 'match-ended');
          assert.equal(confirm.textContent, status === 'match-ended' ? '新しい対局を開始' : '現在の対局を終了して開始');
          assert.equal(nodes.get('#new-game-question')!.textContent.includes('復元できません'), status !== 'match-ended');
          assert.equal(nodes.get('#new-game-dialog')!.open, true);
          assert.equal(focused, nodes.get('#cancel-new-game'));
          assert.deepEqual(match, snapshot);
          if (dismissal === 'button') nodes.get('#cancel-new-game')!.click();
          else if (dismissal === 'close') nodes.get('#new-game-dialog')!.close();
          else {
            let prevented = false;
            nodes.get('#new-game-dialog')!.listeners.cancel({ preventDefault() { prevented = true; } });
            assert.equal(prevented, true);
          }
          assert.equal(focused, nodes.get(trigger === '#new-game' ? '#main-menu-toggle' : trigger));
          assert.equal(nodes.get('#new-game-dialog')!.open, false);
          assert.equal(resets, 0);
          assert.deepEqual(match, snapshot);
        }
        nodes.get('#confirm-new-game')!.click(); assert.equal(resets, 0);
        nodes.get(trigger)!.click(); nodes.get('#confirm-new-game')!.click();
        assert.equal(resets, 1);
        assert.equal(match.lastSettlement, null);
        assert.equal(match.roundNumber, 1);
        assert.deepEqual(match.points, [25000, 25000, 25000, 25000]);
        assert.equal(focused, nodes.get('#main-menu-toggle'));
        nodes.get('#confirm-new-game')!.click(); assert.equal(resets, 1);
      } finally { globalThis.document = original; }
    });
  }
}

test('new game confirmation supports the verification page without a hamburger menu', () => {
  class Node {
    open = false;
    textContent = '';
    classes = new Set<string>();
    classList = { toggle: (name: string, force?: boolean) => { if (force ?? !this.classes.has(name)) this.classes.add(name); else this.classes.delete(name); } };
    listeners: Record<string, (event: { preventDefault(): void }) => void> = {};
    addEventListener(name: string, callback: typeof this.listeners[string]) { this.listeners[name] = callback; }
    focus() { focused = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.({ preventDefault() {} }); }
    click() { this.listeners.click?.({ preventDefault() {} }); }
  }
  let focused: Node | null = null;
  const nodes = new Map(['#new-game-dialog', '#new-game', '#result-new-game', '#cancel-new-game', '#confirm-new-game', '#new-game-question'].map(id => [id, new Node()]));
  const original = globalThis.document;
  globalThis.document = { querySelector: (id: string) => nodes.get(id) } as unknown as Document;
  let resets = 0;
  try {
    new NewGameDialog(() => { resets++; });
    nodes.get('#new-game')!.click();
    assert.equal(focused, nodes.get('#cancel-new-game'));
    nodes.get('#cancel-new-game')!.click();
    assert.equal(focused, nodes.get('#new-game'));
    nodes.get('#new-game')!.click();
    nodes.get('#confirm-new-game')!.click();
    assert.equal(resets, 1);
    assert.equal(focused, nodes.get('#new-game'));
  } finally { globalThis.document = original; }
});
