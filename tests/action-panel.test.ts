import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE_KINDS, ordinaryTile } from '../src/model/tile.ts';
import { tileSvgMarkup } from '../src/rendering/tile-svg.ts';
import { diagnosticLog } from '../src/online/diagnostics.ts';
import {
  ACTION_PANEL_TEMPLATE_PARTS,
  ActionPanel,
  type ActionPanelHandler,
  type ActionPanelOptions,
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
  removeAttribute(name: string): void { this.attributes.delete(name); }
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

function panelFixture(handler: ActionPanelHandler = () => {}, options: ActionPanelOptions = {}) {
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
  const panel = new ActionPanel(root as unknown as HTMLElement, handler, options);
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
    assert.equal(callButton.className, 'control-option-button ui-button ui-button--a');
    click(fixture.parts.get('discard')!);
    click(callButton);
    assert.deepEqual(events, [{ type: 'discard' }, { type: 'select-call', optionId: 'call-1' }]);
    assert.equal(fixture.parts.get('action-status')!.focused, true);
  } finally { fixture.restore(); }
});

test('ActionPanel marks pending static and dynamic actions busy, then clears the state on recovery', () => {
  let progressing = true;
  const fixture = panelFixture(() => {}, { getContext: () => ({ progressing }) });
  const option: ActionChoiceOption = { id: 'call-1', label: 'ポン', tiles: [], enabled: false };
  try {
    fixture.panel.update(state({
      buttons: { ...state().buttons, discard: { visible: true, enabled: false, label: '打牌する' } },
      callGroup: { visible: true, status: '送信しています…', options: [option] },
    }));
    const discard = fixture.parts.get('discard')!;
    const call = fixture.parts.get('call-options')!.children[0] as FakeElement;
    assert.equal(discard.disabled, true);
    assert.equal(discard.attributes.get('aria-busy'), 'true');
    assert.equal(call.disabled, true);
    assert.equal(call.attributes.get('aria-busy'), 'true');
    assert.match(call.className, /ui-button--a/u);

    progressing = false;
    fixture.panel.update(state({
      buttons: { ...state().buttons, discard: { visible: true, enabled: true, label: '打牌する' } },
      callGroup: { visible: true, status: '', options: [{ ...option, enabled: true }] },
    }));
    assert.equal(discard.attributes.has('aria-busy'), false);
    const recoveredCall = fixture.parts.get('call-options')!.children[0] as FakeElement;
    assert.equal(recoveredCall.disabled, false);
    assert.equal(recoveredCall.attributes.has('aria-busy'), false);
  } finally { fixture.restore(); }
});

test('every legal call and kan candidate receives the same primary role', () => {
  const fixture = panelFixture();
  const choices = (prefix: string, labels: string[]): ActionChoiceOption[] => labels.map((label, index) => ({
    id: `${prefix}-${index}`, label, tiles: [], enabled: true,
  }));
  try {
    fixture.panel.update(state({
      callGroup: { visible: true, status: '', options: choices('call', ['ポン', 'チー', '大明カン']) },
      kanGroup: { visible: true, status: '', options: choices('kan', ['暗カン', '加カン']) },
    }));
    for (const part of ['call-options', 'kan-options']) {
      const options = fixture.parts.get(part)!.children as FakeElement[];
      assert.equal(options.length, part === 'call-options' ? 3 : 2);
      assert.ok(options.every(button => button.className === 'control-option-button ui-button ui-button--a'), part);
    }
  } finally { fixture.restore(); }
});

test('call panel diagnostics correlate displayed choices and clicks without retaining internal tile IDs', () => {
  const events: ActionPanelEvent[] = [];
  const traces: Array<{ operationId: number; candidateId?: string; actionType: string }> = [];
  const fixture = panelFixture((event, trace) => { events.push(event); traces.push(trace); }, {
    getContext: () => ({ phase: 'awaiting-call', progressing: false }),
  });
  diagnosticLog.clear();
  try {
    const options: ActionChoiceOption[] = [
      { id: 'chi:man-5:private-tile-a', label: 'チー', tiles: [], enabled: true },
      { id: 'pon:man-5:private-tile-b', label: 'ポン', tiles: [], enabled: true },
    ];
    fixture.panel.update(state({
      buttons: { ...state().buttons, 'pass-call': { visible: true, enabled: true, label: '見送る' } },
      callGroup: { visible: true, status: '', options },
    }));
    const button = fixture.parts.get('call-options')!.children[0] as FakeElement;
    fixture.root.listeners.get('pointerdown')!({ target: button } as unknown as Event);
    fixture.root.listeners.get('click')!({ target: button, detail: 1 } as unknown as Event);

    assert.deepEqual(events, [{ type: 'select-call', optionId: options[0]!.id }]);
    assert.equal(typeof traces[0]?.operationId, 'number');
    assert.equal(traces[0]?.candidateId, 'call-1');
    assert.equal(traces[0]?.actionType, 'chi');
    const entries = diagnosticLog.all();
    const displayed = entries.find(entry => entry.event === 'action_panel_displayed');
    const pointer = entries.find(entry => entry.event === 'action_panel_pointer_received');
    const click = entries.find(entry => entry.event === 'action_panel_click_received');
    assert.equal(displayed?.details.panelType, 'call');
    assert.equal(displayed?.details.candidateCount, 2);
    assert.equal(pointer?.details.operationId, click?.details.operationId);
    assert.equal(click?.details.candidateId, 'call-1');
    assert.equal(click?.details.phase, 'awaiting-call');
    assert.equal(JSON.stringify(entries).includes('private-tile'), false);
  } finally {
    diagnosticLog.clear();
    fixture.restore();
  }
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
