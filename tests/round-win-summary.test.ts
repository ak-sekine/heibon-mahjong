import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRoundWinSummary } from '../src/rendering/round-win-summary.ts';

class Node {
  textContent = '';
  className = '';
  children: Node[] = [];
  append(...children: Node[]) { this.children.push(...children); }
}

test('shared win summary appends the computed normal, ura, and red dora counts once', () => {
  const cases = [
    { label: 'normal only', counts: { normal: 2, ura: 0, red: 0 }, expected: '立直・ドラ2' },
    { label: 'ura only', counts: { normal: 0, ura: 1, red: 0 }, expected: '立直・ドラ1' },
    { label: 'red only', counts: { normal: 0, ura: 0, red: 1 }, expected: '立直・ドラ1' },
    { label: 'normal and ura', counts: { normal: 2, ura: 1, red: 0 }, expected: '立直・ドラ3' },
    { label: 'normal and red', counts: { normal: 2, ura: 0, red: 1 }, expected: '立直・ドラ3' },
    { label: 'all kinds', counts: { normal: 2, ura: 1, red: 1 }, expected: '立直・ドラ4' },
    { label: 'zero dora', counts: { normal: 0, ura: 0, red: 0 }, expected: '立直' },
  ] as const;
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node() } as unknown as Document;
  try {
    for (const scenario of cases) {
      const summary = new Node();
      renderRoundWinSummary(summary as unknown as HTMLElement, [{
        winnerName: '自分', method: 'ron', han: 4, fu: 40, yakumanCount: 0, points: 8000,
        yaku: ['riichi'], doraCounts: scenario.counts,
      }]);
      const section = summary.children[0];
      assert.equal(section.children.length, 2, scenario.label);
      assert.equal(section.children[1].className, 'round-summary-yaku', scenario.label);
      assert.equal(section.children[1].textContent, scenario.expected, scenario.label);
    }

    const mixed = new Node();
    renderRoundWinSummary(mixed as unknown as HTMLElement, [{
      winnerName: 'CPU1', method: 'tsumo', han: 5, fu: 30, yakumanCount: 0, points: 8000,
      yaku: ['riichi', 'ippatsu'], doraCounts: { normal: 3, ura: 1, red: 0 },
    }]);
    assert.equal(mixed.children[0].children[1].textContent, '立直・一発・ドラ4');
  } finally {
    globalThis.document = original;
  }
});
