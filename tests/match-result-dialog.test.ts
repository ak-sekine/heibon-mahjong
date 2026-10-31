import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rankPlayers, startMatch, settleRound } from '../src/game/match.ts';
import { MatchResultDialog } from '../src/ui/match-result-dialog.ts';
import type { PlayerGameView } from '../src/online/game-view.ts';
import { fixedRon } from './match-fixture.ts';

class ElementStub {
  open = false;
  hidden = false;
  scrollTop = 73;
  textContent = '';
  className = '';
  focused = false;
  opens = 0;
  children: ElementStub[] = [];
  attributes: Record<string, string> = {};
  listeners = new Map<string, (event?: { preventDefault(): void }) => void>();
  classList = { add() {}, remove() {} };
  addEventListener(name: string, callback: (event?: { preventDefault(): void }) => void) { this.listeners.set(name, callback); }
  append(...children: ElementStub[]) { this.children.push(...children); }
  replaceChildren(...children: ElementStub[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  showModal() { this.open = true; this.opens++; }
  close() { this.open = false; this.listeners.get('close')?.(); }
  click() { this.listeners.get('click')?.(); }
}

function mount(): { ui: MatchResultDialog; nodes: Map<string, ElementStub>; original: Document } {
  const nodes = new Map(['#match-result-dialog', '#match-result-body', '#match-result-close', '#show-match-result', '#new-game-dialog']
    .map(id => [id, new ElementStub()]));
  const original = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    createElement: () => new ElementStub(),
    documentElement: new ElementStub(),
  } as unknown as Document;
  const ui = new MatchResultDialog();
  return { ui, nodes, original };
}

test('offline match result shows all ranked players and opens/closes without changing the match', () => {
  const { ui, nodes, original } = mount();
  try {
  const game = settleRound({ ...startMatch(), roundNumber: 4, game: fixedRon(0, [1]) });
  const match = { ...game, points: [game.points[0] + 300, game.points[1], game.points[2], game.points[3] - 300] as typeof game.points };
  const snapshot = structuredClone(match);
  const names = ['長いプレイヤー名が続いても順位を読める名前', 'CPU1', 'CPU2', 'CPU3'];
  ui.updateLocal(match, names);
  ui.open(nodes.get('#show-match-result') as unknown as HTMLButtonElement);

  const dialog = nodes.get('#match-result-dialog')!;
  const body = nodes.get('#match-result-body')!;
  assert.equal(dialog.open, true);
  assert.equal(body.children[0].textContent, '東風戦');
  const rows = body.children[1].children.map(row => row.children.map(cell => cell.textContent));
  assert.deepEqual(rows, rankPlayers(match).map(player => [
    `${player.rank}位`, names[player.playerId], `${player.points.toLocaleString('ja-JP')}点`,
  ]));
  assert.equal(rows.length, 4);
  assert.equal(JSON.stringify(rows).includes('点数増減'), false);
  assert.deepEqual(match, snapshot);

  nodes.get('#match-result-close')!.click();
  assert.equal(dialog.open, false);
  assert.equal(nodes.get('#show-match-result')!.focused, true);
  body.scrollTop = 51;
  ui.open(nodes.get('#show-match-result') as unknown as HTMLButtonElement);
  assert.equal(dialog.open, true);
  assert.equal(body.scrollTop, 0);
  nodes.get('#match-result-close')!.click();
  assert.deepEqual(match, snapshot);
  } finally { globalThis.document = original; }
});

test('online match result uses server-confirmed seats, points and seat-id tie order', () => {
  const { ui, nodes, original } = mount();
  try {
  const view = {
    status: 'match-ended',
    format: 'tonnan',
    result: { matchEnded: true },
    seats: [
      { seat: 0, name: 'ホスト', points: 28600 },
      { seat: 1, name: 'CPU1', points: 31500 },
      { seat: 2, name: '退出後CPU2', points: 31500 },
      { seat: 3, name: 'ゲストの長い名前の確認用テキスト', points: 8400 },
    ],
  } as unknown as PlayerGameView;
  const snapshot = structuredClone(view);
  ui.updateOnline(view);
  ui.open();
  assert.equal(nodes.get('#match-result-body')!.children[0].textContent, '半荘戦');
  const rows = nodes.get('#match-result-body')!.children[1].children.map(row => row.children.map(cell => cell.textContent));
  assert.deepEqual(rows, [
    ['1位', 'CPU1', '31,500点'],
    ['2位', '退出後CPU2', '31,500点'],
    ['3位', 'ホスト', '28,600点'],
    ['4位', 'ゲストの長い名前の確認用テキスト', '8,400点'],
  ]);
  const guestView = { ...view, viewerSeat: 1 } as unknown as PlayerGameView;
  ui.updateOnline(guestView);
  assert.deepEqual(nodes.get('#match-result-body')!.children[1].children.map(row => row.children.map(cell => cell.textContent)), rows,
    'the host and guest views use the same finalized seat data');
  nodes.get('#match-result-close')!.click();
  ui.updateOnline({ ...guestView, gameRevision: 7, roomCode: 'REJOIN' } as PlayerGameView);
  ui.open();
  assert.deepEqual(nodes.get('#match-result-body')!.children[1].children.map(row => row.children.map(cell => cell.textContent)), rows,
    'a restored finalized view keeps the confirmed standings available');
  nodes.get('#match-result-close')!.click();
  assert.deepEqual(view, snapshot);
  } finally { globalThis.document = original; }
});
