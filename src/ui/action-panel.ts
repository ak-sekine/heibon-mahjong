import { createTileElement, tileLabel } from '../rendering/tile-svg.ts';
import { tileKindKey, type Tile } from '../model/tile.ts';

export type ActionPanelMode = 'local' | 'online';
export type ActionPanelPart =
  | 'discard' | 'riichi' | 'tsumo' | 'kyuushu' | 'kan-toggle'
  | 'ron' | 'pass-ron' | 'pass-call' | 'cancel-kan'
  | 'next-round' | 'show-result' | 'return-local';

export type ActionButtonState = Readonly<{
  visible: boolean;
  enabled: boolean;
  label: string;
}>;

export type ActionTile = Readonly<{ id: string; tile: Tile }>;
export type ActionChoiceOption = Readonly<{
  id: string;
  label: string;
  tiles: readonly ActionTile[];
  accessibleLabel?: string;
  enabled: boolean;
}>;

export type ActionPanelState = Readonly<{
  buttons: Readonly<Record<ActionPanelPart, ActionButtonState>>;
  actionStatus: string;
  callGroup: Readonly<{
    visible: boolean;
    status: string;
    options: readonly ActionChoiceOption[];
  }>;
  kanGroup: Readonly<{
    visible: boolean;
    status: string;
    options: readonly ActionChoiceOption[];
  }>;
  ronGroup: Readonly<{
    visible: boolean;
    status: string;
    target: Readonly<{ tile: Tile; description: string }> | null;
  }>;
  roundActionsVisible: boolean;
  ronPending: boolean;
  gameEnded: boolean;
  resultAvailable: boolean;
}>;

export type ActionPanelEvent =
  | { type: 'discard' }
  | { type: 'riichi' }
  | { type: 'tsumo' }
  | { type: 'kyuushu' }
  | { type: 'ron' }
  | { type: 'pass-ron' }
  | { type: 'pass-call' }
  | { type: 'kan-toggle' }
  | { type: 'cancel-kan' }
  | { type: 'select-kan'; optionId: string }
  | { type: 'select-call'; optionId: string }
  | { type: 'next-round' }
  | { type: 'show-result' }
  | { type: 'return-local' };

export type ActionPanelHandler = (event: ActionPanelEvent) => void;

const LOCAL_IDS: Readonly<Record<string, string>> = {
  root: 'local-game-controls',
  'call-controls': 'call-controls',
  'call-status': 'call-status',
  'call-options': 'call-options',
  'pass-call': 'pass-calls',
  'kan-controls': 'kan-controls',
  'kan-status': 'kan-status',
  'kan-toggle': 'kan',
  'kan-options': 'kan-options',
  'cancel-kan': 'cancel-kan',
  'ron-controls': 'ron-controls',
  'ron-status': 'ron-status',
  'ron-target': 'ron-target',
  ron: 'ron',
  'pass-ron': 'pass-ron',
  'action-status': 'selection-status',
  discard: 'discard',
  riichi: 'riichi',
  tsumo: 'tsumo',
  kyuushu: 'kyuushu-kyuuhai',
  'round-actions': 'round-result-actions',
  'show-result': 'show-result',
  'next-round': 'next-round',
  'return-local': 'local-return-local',
};

const ONLINE_IDS: Readonly<Record<string, string>> = {
  root: 'online-game-controls',
  'call-controls': 'online-call-controls',
  'call-status': 'online-call-status',
  'call-options': 'online-call-options',
  'pass-call': 'online-pass-call',
  'kan-controls': 'online-kan-controls',
  'kan-status': 'online-kan-status',
  'kan-toggle': 'online-kan',
  'kan-options': 'online-kan-options',
  'cancel-kan': 'online-cancel-kan',
  'ron-controls': 'online-ron-controls',
  'ron-status': 'online-ron-status',
  'ron-target': 'online-ron-target',
  ron: 'online-ron',
  'pass-ron': 'online-pass-ron',
  'action-status': 'online-game-action-status',
  discard: 'online-discard',
  riichi: 'online-riichi',
  tsumo: 'online-tsumo',
  kyuushu: 'online-kyuushu',
  'round-actions': 'online-round-result-actions',
  'show-result': 'online-show-result',
  'next-round': 'online-next-round',
  'return-local': 'online-return-local',
};

/** Required data parts in the shared HTML template, used by its contract test. */
export const ACTION_PANEL_TEMPLATE_PARTS = Object.freeze(
  [...new Set([...Object.keys(LOCAL_IDS), ...Object.keys(ONLINE_IDS)])],
);

/** Clone the shared controls component. Mode-specific IDs are only for page/CSS compatibility. */
export function mountActionPanel(host: HTMLElement, mode: ActionPanelMode): HTMLElement {
  const template = document.querySelector<HTMLTemplateElement>('#game-controls-template');
  if (!template?.content.firstElementChild) throw new Error('Game controls template is missing');
  const root = template.content.firstElementChild.cloneNode(true) as HTMLElement;
  const ids = mode === 'online' ? ONLINE_IDS : LOCAL_IDS;
  for (const [part, id] of Object.entries(ids)) {
    const node = part === 'root'
      ? root
      : root.querySelector<HTMLElement>(`[data-panel-part="${part}"]`);
    if (!node) throw new Error(`Game controls part is missing: ${part}`);
    node.id = id;
  }
  root.setAttribute('aria-label', mode === 'online' ? 'オンライン対局の操作' : '打牌操作');
  host.replaceWith(root);
  return root;
}

/** Owns all action-panel DOM state and delegates button actions to the active game mode. */
export class ActionPanel {
  private readonly parts = new Map<string, HTMLElement>();
  private readonly choiceSignatures = new Map<string, string>();
  private handler: ActionPanelHandler;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement, handler: ActionPanelHandler = () => {}) {
    this.root = root;
    this.handler = handler;
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-panel-part]'))) {
      const part = node.dataset.panelPart;
      if (part) this.parts.set(part, node);
    }
    this.parts.set('root', root);
    this.part('action-status').tabIndex = -1;
    for (const part of [
      'discard', 'riichi', 'tsumo', 'kyuushu', 'kan-toggle', 'ron', 'pass-ron', 'pass-call',
      'cancel-kan', 'next-round', 'show-result', 'return-local',
    ] as const) this.part(part).dataset.panelAction = part;
    root.addEventListener('click', event => this.onClick(event));
  }

  setHandler(handler: ActionPanelHandler): void {
    this.handler = handler;
  }

  update(state: ActionPanelState): void {
    const wasRonHidden = this.part('ron-controls').hidden;
    for (const [name, buttonState] of Object.entries(state.buttons) as [ActionPanelPart, ActionButtonState][]) {
      const button = this.part(name) as HTMLButtonElement;
      button.hidden = !buttonState.visible;
      button.disabled = !buttonState.enabled;
      button.textContent = buttonState.label;
    }

    const callControls = this.part('call-controls');
    callControls.hidden = !state.callGroup.visible;
    this.part('call-status').textContent = state.callGroup.status;
    this.renderOptions('call-options', 'call', state.callGroup.options);

    const kanControls = this.part('kan-controls');
    kanControls.hidden = !state.kanGroup.visible;
    this.part('kan-status').textContent = state.kanGroup.status;
    this.renderOptions('kan-options', 'kan', state.kanGroup.options);

    const ronControls = this.part('ron-controls');
    ronControls.hidden = !state.ronGroup.visible;
    this.part('ron-status').textContent = state.ronGroup.status;
    const target = this.part('ron-target');
    target.replaceChildren();
    if (state.ronGroup.target) {
      const face = createTileElement(state.ronGroup.target.tile);
      face.setAttribute('aria-hidden', 'true');
      const description = document.createElement('p');
      description.textContent = state.ronGroup.target.description;
      target.append(face, description);
    }

    this.part('round-actions').hidden = !state.roundActionsVisible;
    this.part('action-status').textContent = state.actionStatus;
    this.root.classList.toggle('ron-pending', state.ronPending);
    this.root.classList.toggle('game-ended', state.gameEnded);
    this.root.classList.toggle('result-available', state.resultAvailable);

    if (state.ronGroup.visible && state.buttons.ron.enabled && wasRonHidden) {
      this.part('ron').focus({ preventScroll: true });
    }
    if (!state.ronGroup.visible && this.part('ron-controls').contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const choice = target.closest<HTMLButtonElement>('button[data-action-choice]');
    if (choice && this.root.contains(choice)) {
      if (choice.disabled) return;
      const optionId = choice.dataset.optionId;
      if (!optionId) return;
      this.handler({ type: choice.dataset.actionChoice === 'call' ? 'select-call' : 'select-kan', optionId });
      this.part('action-status').focus({ preventScroll: true });
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-panel-action]');
    if (!button || !this.root.contains(button) || button.disabled || button.hidden) return;
    const action = button.dataset.panelAction as ActionPanelPart | undefined;
    if (!action) return;
    this.handler({ type: action });
    if (action === 'kan-toggle' && !this.part('kan-controls').hidden) {
      this.part('kan-controls').scrollIntoView({ block: 'nearest' });
    } else if (action === 'cancel-kan') {
      this.part('kan-toggle').focus({ preventScroll: true });
    }
  }

  private renderOptions(part: string, action: 'call' | 'kan', options: readonly ActionChoiceOption[]): void {
    const list = this.part(part);
    const displayOptions = actionChoicesForDisplay(action, options);
    const signature = JSON.stringify(displayOptions.map(option => [
      option.id,
      option.label,
      option.accessibleLabel ?? '',
      option.enabled,
      option.tiles.map(tile => [tile.id, tileKindKey(tile.tile), tile.tile.isRed]),
    ]));
    if (this.choiceSignatures.get(part) === signature) return;
    this.choiceSignatures.set(part, signature);
    list.replaceChildren(...displayOptions.map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-option-button';
      button.dataset.actionChoice = action;
      button.dataset.optionId = option.id;
      if (action === 'call') {
        button.dataset.callId = option.id;
        button.dataset.onlineCall = option.id;
      } else {
        button.dataset.kanId = option.id;
      }
      button.disabled = !option.enabled;
      if (option.accessibleLabel) button.setAttribute('aria-label', option.accessibleLabel);
      button.append(document.createTextNode(option.label));
      for (const tile of option.tiles) button.append(createTileElement(tile.tile));
      return button;
    }));
  }

  private part(name: string): HTMLElement {
    const node = this.parts.get(name);
    if (!node) throw new Error(`Action panel part is missing: ${name}`);
    return node;
  }
}

/** Collapse visually identical physical call combinations while retaining an executable server/local option. */
export function actionChoicesForDisplay(action: 'call' | 'kan', options: readonly ActionChoiceOption[]): readonly ActionChoiceOption[] {
  if (action !== 'call') return options;
  const seen = new Set<string>();
  return options.filter(option => {
    const faces = option.tiles.map(tile => `${tileKindKey(tile.tile)}:${tile.tile.isRed}`).sort();
    const key = JSON.stringify([option.label, faces]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function choiceAccessibleLabel(label: string, tiles: readonly ActionTile[], suffix = ''): string {
  return `${label}：${tiles.map(tile => tileLabel(tile.tile)).join('・')}${suffix ? `（${suffix}）` : ''}`;
}
