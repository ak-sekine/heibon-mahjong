import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE_KINDS, ordinaryTile } from '../src/model/tile.ts';
import { tileSvgMarkup } from '../src/rendering/tile-svg.ts';
import {
  ACTION_PANEL_TEMPLATE_PARTS,
  ActionPanel,
  type ActionChoiceOption,
  type ActionPanelEvent,
  type ActionPanelState,
  type ActionPanelPart,
} from '../src/ui/action-panel.ts';

class FakeClassList {
  readonly values = new Set<string>();
  toggle(name: string, force?: boolean): void {
    if (force ?? !this.values.has(name)) this.values.add(name);
    else this.values.delete(name);
  }
  remove(...names: string[]): void { names.forEach(name => this.values.delete(name)); }
}

class FakeElement {
  hidden = false;
  disabled = false;
  focused = false;
  textContent = '';
  innerHTML = '';
  className = '';
  type = '';
  tabIndex = 0;
  parent: FakeElement | null = null;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: unknown[] = [];
  readonly content: { firstElementChild: FakeElement };
  readonly classList = new FakeClassList();
  readonly listeners = new Map<string, (event: Event) => void>();
  scrolled = false;

  private readonly documentLike: { activeElement: FakeElement | null };
  constructor(documentLike: { activeElement: FakeElement | null }) {
    this.documentLike = documentLike;
    this.content = { firstElementChild: this };
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== '[data-panel-part]') return [];
    return this.children.flatMap(child => child instanceof FakeElement
      ? [child, ...child.querySelectorAll(selector)] : []);
  }
  addEventListener(name: string, callback: (event: Event) => void): void { this.listeners.set(name, callback); }
  replaceChildren(...children: unknown[]): void {
    for (const child of this.children) if (child instanceof FakeElement) child.parent = null;
    this.children.splice(0, this.children.length, ...children);
    for (const child of children) if (child instanceof FakeElement) child.parent = this;
  }
  append(...children: unknown[]): void {
    this.children.push(...children);
    for (const child of children) if (child instanceof FakeElement) child.parent = this;
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(): void { this.focused = true; this.documentLike.activeElement = this; }
  blur(): void { this.focused = false; if (this.documentLike.activeElement === this) this.documentLike.activeElement = null; }
  scrollIntoView(): void { this.scrolled = true; }
  contains(candidate: unknown): boolean {
    for (let node = candidate instanceof FakeElement ? candidate : null; node; node = node.parent) if (node === this) return true;
    return false;
  }
  closest(selector: string): FakeElement | null {
    if (selector.includes('data-action-choice') && this.dataset.actionChoice) return this;
    if (selector.includes('data-panel-action') && this.dataset.panelAction) return this;
    return this.parent?.closest(selector) ?? null;
  }
}

function panelFixture(handler: (event: ActionPanelEvent) => void = () => {}) {
  const doc = {
    activeElement: null as FakeElement | null,
    createElement: (_tag: string) => new FakeElement(doc),
    createTextNode: (text: string) => text,
  };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalElement = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  const root = new FakeElement(doc);
  root.dataset.panelPart = 'root';
  const parts = new Map<string, FakeElement>();
  const parents: Record<string, string> = {
    'call-status': 'call-controls', 'call-options': 'call-controls', 'pass-call': 'call-controls',
    'kan-status': 'kan-controls', 'kan-options': 'kan-controls', 'cancel-kan': 'kan-controls',
    'ron-status': 'ron-controls', 'ron-target': 'ron-controls', ron: 'ron-controls', 'pass-ron': 'ron-controls',
    'show-result': 'round-actions', 'next-round': 'round-actions', 'return-local': 'round-actions',
  };
  for (const part of ACTION_PANEL_TEMPLATE_PARTS) {
    if (part === 'root') continue;
    const node = new FakeElement(doc);
    node.dataset.panelPart = part;
    if (['call-controls', 'kan-controls', 'ron-controls', 'round-actions'].includes(part)) node.hidden = true;
    parts.set(part, node);
  }
  for (const [part, node] of parts) {
    const parent = parts.get(parents[part] ?? '') ?? root;
    node.parent = parent;
    parent.children.push(node);
  }
  const panel = new ActionPanel(root as unknown as HTMLElement, handler);
  return {
    panel,
    root,
    parts,
    restore() {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (originalElement) Object.defineProperty(globalThis, 'Element', originalElement);
      else Reflect.deleteProperty(globalThis, 'Element');
    },
  };
}

function state(overrides: Partial<ActionPanelState> = {}): ActionPanelState {
  const labels: Record<ActionPanelPart, string> = {
    discard: '打牌する', riichi: 'リーチ', tsumo: 'ツモ和了', kyuushu: '九種九牌', 'kan-toggle': 'カン',
    ron: 'ロン和了', 'pass-ron': '見逃す', 'pass-call': '見送る', 'cancel-kan': 'キャンセル',
    'next-round': '次の局へ', 'show-result': '結果を見る', 'return-local': 'ローカル卓へ戻る',
  };
  const buttons = Object.fromEntries(Object.entries(labels).map(([part, label]) => [part, {
    visible: false, enabled: false, label,
  }])) as ActionPanelState['buttons'];
  return {
    buttons,
    actionStatus: '牌を選択してください。',
    callGroup: { visible: false, status: '', options: [] },
    kanGroup: { visible: false, status: '', options: [] },
    ronGroup: { visible: false, status: '', target: null },
    roundActionsVisible: false,
    ronPending: false,
    gameEnded: false,
    resultAvailable: false,
    ...overrides,
  };
}

test('ActionPanel applies visibility, availability, labels, groups, messages, and mode-independent classes', () => {
  const fixture = panelFixture();
  try {
    fixture.panel.update(state({
      buttons: {
        ...state().buttons,
        discard: { visible: true, enabled: false, label: '打牌する' },
        riichi: { visible: true, enabled: true, label: 'リーチ' },
        tsumo: { visible: false, enabled: false, label: 'ツモ和了' },
      },
      callGroup: { visible: true, status: '鳴き判断の残り 10 秒です。', options: [] },
      actionStatus: '操作を選択してください。',
      ronPending: true,
      resultAvailable: true,
    }));

    assert.equal(fixture.parts.get('discard')!.hidden, false);
    assert.equal(fixture.parts.get('discard')!.disabled, true);
    assert.equal(fixture.parts.get('discard')!.textContent, '打牌する');
    assert.equal(fixture.parts.get('riichi')!.hidden, false);
    assert.equal(fixture.parts.get('riichi')!.disabled, false);
    assert.equal(fixture.parts.get('tsumo')!.hidden, true);
    assert.equal(fixture.parts.get('call-controls')!.hidden, false);
    assert.equal(fixture.parts.get('call-status')!.textContent, '鳴き判断の残り 10 秒です。');
    assert.equal(fixture.parts.get('action-status')!.textContent, '操作を選択してください。');
    assert.equal(fixture.root.classList.values.has('ron-pending'), true);
    assert.equal(fixture.root.classList.values.has('result-available'), true);

    fixture.panel.update(state({ buttons: {
      ...state().buttons,
      discard: { visible: true, enabled: true, label: 'ツモ切り' },
    } }));
    assert.equal(fixture.parts.get('discard')!.disabled, false);
    assert.equal(fixture.parts.get('discard')!.textContent, 'ツモ切り');
    assert.equal(fixture.parts.get('call-controls')!.hidden, true);
  } finally { fixture.restore(); }
});

test('ActionPanel delegates static and choice clicks through one mode callback and keeps choices disabled while pending', () => {
  const events: ActionPanelEvent[] = [];
  const fixture = panelFixture(event => events.push(event));
  try {
    const option: ActionChoiceOption = { id: 'call-1', label: 'ポン', tiles: [], enabled: false };
    fixture.panel.update(state({
      buttons: {
        ...state().buttons,
        discard: { visible: true, enabled: false, label: '打牌する' },
        'pass-call': { visible: true, enabled: false, label: '見送る' },
      },
      callGroup: { visible: true, status: '回答を待っています。', options: [option] },
    }));
    const click = (target: FakeElement) => fixture.root.listeners.get('click')!({ target } as unknown as Event);
    click(fixture.parts.get('discard')!);
    click(fixture.parts.get('pass-call')!);
    const deniedChoice = fixture.parts.get('call-options')!.children[0] as FakeElement;
    click(deniedChoice);
    assert.deepEqual(events, []);

    fixture.panel.update(state({
      buttons: { ...state().buttons, discard: { visible: true, enabled: true, label: '打牌する' } },
      callGroup: { visible: true, status: '', options: [{ ...option, enabled: true }] },
    }));
    const callButton = fixture.parts.get('call-options')!.children[0] as FakeElement;
    assert.equal(callButton.dataset.callId, 'call-1');
    assert.equal(callButton.dataset.onlineCall, 'call-1');
    click(fixture.parts.get('discard')!);
    click(callButton);
    assert.deepEqual(events, [{ type: 'discard' }, { type: 'select-call', optionId: 'call-1' }]);
    assert.equal(fixture.parts.get('action-status')!.focused, true);
  } finally { fixture.restore(); }
});

test('ActionPanel manages ron focus and result actions centrally', () => {
  const fixture = panelFixture();
  try {
    const tile = ordinaryTile(TILE_KINDS.find(kind => kind.category === 'suited' && kind.suit === 'sou' && kind.rank === 5)!);
    fixture.panel.update(state({
      buttons: { ...state().buttons, ron: { visible: true, enabled: true, label: 'ロン和了' } },
      ronGroup: { visible: true, status: 'ロン判断です。', target: { tile, description: 'この牌でロンできます' } },
      roundActionsVisible: true,
    }));
    assert.equal(fixture.parts.get('ron')!.focused, true);
    assert.equal(fixture.parts.get('ron-controls')!.hidden, false);
    const target = fixture.parts.get('ron-target')!;
    assert.equal(target.children[0] instanceof FakeElement, true);
    assert.equal((target.children[0] as FakeElement).innerHTML, tileSvgMarkup(tile));
    assert.equal((target.children[0] as FakeElement).attributes.get('aria-hidden'), 'true');
    assert.equal((target.children[0] as FakeElement).dataset.tileId, undefined);
    assert.equal(fixture.parts.get('round-actions')!.hidden, false);

    fixture.panel.update(state());
    assert.equal(fixture.parts.get('ron-controls')!.hidden, true);
    assert.equal(fixture.parts.get('ron')!.focused, false);
  } finally { fixture.restore(); }
});

test('ActionPanel clears stale operation state and can render the same choices again', () => {
  const fixture = panelFixture();
  try {
    const options: ActionChoiceOption[] = [{ id: 'call-1', label: 'ポン', tiles: [], enabled: true }];
    fixture.panel.update(state({
      buttons: { ...state().buttons, discard: { visible: true, enabled: true, label: '打牌する' } },
      callGroup: { visible: true, status: '鳴き判断です。', options },
    }));
    assert.equal(fixture.parts.get('call-options')!.children.length, 1);
    fixture.panel.clear();
    assert.equal(fixture.parts.get('discard')!.hidden, true);
    assert.equal(fixture.parts.get('call-controls')!.hidden, true);
    assert.equal(fixture.parts.get('call-options')!.children.length, 0);
    fixture.panel.update(state({ callGroup: { visible: true, status: '', options } }));
    assert.equal(fixture.parts.get('call-options')!.children.length, 1);
  } finally { fixture.restore(); }
});
