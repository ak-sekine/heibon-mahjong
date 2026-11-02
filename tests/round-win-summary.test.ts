import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRoundWinSummary, type RoundWinSummary } from '../src/rendering/round-win-summary.ts';

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
        winnerName: '自分', method: 'ron', han: 4, fu: 40, scoreTier: 'mangan', yakumanCount: 0, points: 8000,
        yaku: ['riichi'], doraCounts: scenario.counts,
      }]);
      const section = summary.children[0];
      assert.equal(section.children.length, 2, scenario.label);
      assert.equal(section.children[1].className, 'round-summary-yaku', scenario.label);
      assert.equal(section.children[1].textContent, scenario.expected, scenario.label);
    }

    const mixed = new Node();
    renderRoundWinSummary(mixed as unknown as HTMLElement, [{
      winnerName: 'CPU1', method: 'tsumo', han: 5, fu: 30, scoreTier: 'mangan', yakumanCount: 0, points: 8000,
      yaku: ['riichi', 'ippatsu'], doraCounts: { normal: 3, ura: 1, red: 0 },
    }]);
    assert.equal(mixed.children[0].children[1].textContent, '立直・一発・ドラ4');
  } finally {
    globalThis.document = original;
  }
});

test('shared win summary uses the calculated score tier and preserves fu only below mangan', () => {
  const cases: readonly Readonly<{ label: string; han: number; fu: number | null; tier: RoundWinSummary['scoreTier']; yakumanCount?: number; expected: string }>[] = [
    { label: 'below mangan', han: 3, fu: 40, tier: 'normal', expected: '3翻 40符' },
    { label: 'four han thirty fu below mangan', han: 4, fu: 30, tier: 'normal', expected: '4翻 30符' },
    { label: 'three han seventy fu mangan', han: 3, fu: 70, tier: 'mangan', expected: '3翻 満貫' },
    { label: 'four han forty fu mangan', han: 4, fu: 40, tier: 'mangan', expected: '4翻 満貫' },
    { label: 'five han mangan', han: 5, fu: 30, tier: 'mangan', expected: '5翻 満貫' },
    { label: 'six han haneman', han: 6, fu: 20, tier: 'haneman', expected: '6翻 跳満' },
    { label: 'seven han haneman', han: 7, fu: 30, tier: 'haneman', expected: '7翻 跳満' },
    { label: 'eight han baiman', han: 8, fu: 20, tier: 'baiman', expected: '8翻 倍満' },
    { label: 'ten han baiman', han: 10, fu: 30, tier: 'baiman', expected: '10翻 倍満' },
    { label: 'eleven han sanbaiman', han: 11, fu: 30, tier: 'sanbaiman', expected: '11翻 三倍満' },
    { label: 'twelve han sanbaiman', han: 12, fu: 30, tier: 'sanbaiman', expected: '12翻 三倍満' },
    { label: 'counted yakuman', han: 13, fu: 30, tier: 'kazoe-yakuman', expected: '数え役満' },
    { label: 'single yakuman', han: 0, fu: null, tier: 'yakuman', yakumanCount: 1, expected: '役満' },
    { label: 'double yakuman', han: 0, fu: null, tier: 'yakuman', yakumanCount: 2, expected: 'ダブル役満' },
    { label: 'combined triple yakuman', han: 0, fu: null, tier: 'yakuman', yakumanCount: 3, expected: 'トリプル役満' },
  ];
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node() } as unknown as Document;
  try {
    for (const scenario of cases) {
      const summary = new Node();
      renderRoundWinSummary(summary as unknown as HTMLElement, [{
        winnerName: '自分', method: 'ron', han: scenario.han, fu: scenario.fu,
        scoreTier: scenario.tier, yakumanCount: scenario.yakumanCount ?? 0, points: 32000,
        yaku: ['riichi'], doraCounts: { normal: 0, ura: 0, red: 0 },
      }]);
      const value = summary.children[0].children[0].children[1];
      assert.equal(value.textContent, scenario.expected, scenario.label);
    }
  } finally {
    globalThis.document = original;
  }
});

test('each winner keeps their own tier and calculated point total across win methods and seats', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node() } as unknown as Document;
  try {
    const summary = new Node();
    const winners: RoundWinSummary[] = [
      { winnerName: '親', method: 'ron', han: 6, fu: 20, scoreTier: 'haneman', yakumanCount: 0, points: 18000,
        yaku: ['riichi'], doraCounts: { normal: 0, ura: 0, red: 0 } },
      { winnerName: '親ツモ', method: 'tsumo', han: 6, fu: 20, scoreTier: 'haneman', yakumanCount: 0, points: 18000,
        yaku: ['riichi'], doraCounts: { normal: 0, ura: 0, red: 0 } },
      { winnerName: '子', method: 'ron', han: 4, fu: 30, scoreTier: 'normal', yakumanCount: 0, points: 3900,
        yaku: ['tanyao'], doraCounts: { normal: 0, ura: 0, red: 0 } },
      { winnerName: '別の子', method: 'tsumo', han: 0, fu: null, scoreTier: 'yakuman', yakumanCount: 2, points: 64000,
        yaku: [{ id: 'daisangen', yakuman: 1 }, { id: 'tsuuiisou', yakuman: 1 }], doraCounts: { normal: 0, ura: 0, red: 0 } },
    ];
    renderRoundWinSummary(summary as unknown as HTMLElement, winners);
    assert.deepEqual(summary.children.map(section => section.children[0].children.map(node => node.textContent).join('')),
      ['親 ロン・6翻 跳満・18,000点', '親ツモ ツモ・6翻 跳満・18,000点',
        '子 ロン・4翻 30符・3,900点', '別の子 ツモ・ダブル役満・64,000点']);
  } finally { globalThis.document = original; }
});
