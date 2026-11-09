import type { Tile } from '../model/tile.ts';
import { createTileElement, tileLabel } from '../rendering/tile-svg.ts';
import { diagnosticLog } from '../online/diagnostics.ts';
import { uniqueCallOptionsByDisplay } from './call-options.ts';
import { CandidateSelection, operationFor, type CandidateOperation, type CandidateOption } from './candidate-selection.ts';

export type ActionPanelMode = 'local' | 'online';
export type ActionPanelPart =
  | 'discard' | 'riichi' | 'tsumo' | 'kyuushu' | 'kan-toggle' | 'call-pon' | 'call-kan' | 'call-chi'
  | 'ron' | 'pass-ron' | 'pass-call'
  | 'next-round' | 'show-result' | 'show-match-result';

export type ActionButtonState = Readonly<{
  visible: boolean;
  enabled: boolean;
  label: string;
}>;

export type ActionTile = Readonly<{ id: string; tile: Tile }>;
export type ActionChoiceOption = CandidateOption;

export type ActionPanelState = Readonly<{
  buttons: Readonly<Record<ActionPanelPart, ActionButtonState>>;
  actionStatus: string;
  callGroup: Readonly<{
    visible: boolean;
    status: string;
    options: readonly ActionChoiceOption[];
    target?: Tile | null;
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
  | { type: 'show-match-result' };

export type ActionPanelTrace = Readonly<{
  operationId: number;
  panelId: number | null;
  actionType: string;
  candidateId?: string;
}>;
export type ActionPanelHandler = (event: ActionPanelEvent, trace: ActionPanelTrace) => void;
export type ActionPanelOptions = Readonly<{
  getContext?: () => { phase?: string | null; progressing?: boolean };
}>;

let nextOperationId = 0;
let nextPanelId = 0;
const LOCAL_IDS: Readonly<Record<string, string>> = {
  root: 'local-game-controls',
  'call-controls': 'call-controls',
  'call-status': 'call-status',
  'call-pon': 'call-pon',
  'call-kan': 'call-kan',
  'call-chi': 'call-chi',
  'candidate-controls': 'candidate-controls',
  'candidate-options': 'candidate-options',
  'candidate-back': 'candidate-back',
  'pass-call': 'pass-calls',
  'kan-toggle': 'kan',
  'normal-controls': 'normal-controls',
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
  'show-match-result': 'show-match-result',
  'next-round': 'next-round',
};

const ONLINE_IDS: Readonly<Record<string, string>> = {
  root: 'online-game-controls',
  'call-controls': 'online-call-controls',
  'call-status': 'online-call-status',
  'call-pon': 'online-call-pon',
  'call-kan': 'online-call-kan',
  'call-chi': 'online-call-chi',
  'candidate-controls': 'online-candidate-controls',
  'candidate-options': 'online-candidate-options',
  'candidate-back': 'online-candidate-back',
  'pass-call': 'online-pass-call',
  'kan-toggle': 'online-kan',
  'normal-controls': 'online-normal-controls',
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
  'show-match-result': 'online-show-match-result',
  'next-round': 'online-next-round',
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
  private handler: ActionPanelHandler;
  private readonly root: HTMLElement;
  private readonly options: ActionPanelOptions;
  private readonly visiblePanelIds = new Map<string, number>();
  private pendingPointerTrace: { target: HTMLButtonElement; trace: ActionPanelTrace } | null = null;
  private candidateClickTrace: ActionPanelTrace | null = null;
  private candidateAnchorDocumentBottom: number | null = null;
  private candidateAnchorRootHeight: number | null = null;
  private callType: 'pon' | 'daiminkan' | 'chi' | null = null;
  private activeCallOptions: readonly ActionChoiceOption[] = [];
  private callSelectionPending = false;
  private readonly candidates: CandidateSelection;

  constructor(root: HTMLElement, handler: ActionPanelHandler = () => {}, options: ActionPanelOptions = {}) {
    this.root = root;
    this.handler = handler;
    this.options = options;
    for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-panel-part]'))) {
      const part = node.dataset.panelPart;
      if (part) this.parts.set(part, node);
    }
    this.parts.set('root', root);
    this.part('action-status').tabIndex = -1;
    for (const part of [
      'discard', 'riichi', 'tsumo', 'kyuushu', 'kan-toggle', 'call-pon', 'call-kan', 'call-chi', 'ron', 'pass-ron', 'pass-call',
      'next-round', 'show-result', 'show-match-result',
    ] as const) {
      this.part(part).dataset.panelAction = part;
      this.part(part).dataset.diagnosticActionType = part;
    }
    this.part('call-pon').dataset.diagnosticActionType = 'pon';
    this.part('call-kan').dataset.diagnosticActionType = 'daiminkan';
    this.part('call-chi').dataset.diagnosticActionType = 'chi';
    const candidateBack = this.part('candidate-back') as HTMLButtonElement;
    candidateBack.textContent = '戻る';
    candidateBack.dataset.panelAction = 'candidate-back';
    candidateBack.dataset.diagnosticActionType = 'candidate-back';
    const candidateList = this.part('candidate-options');
    this.part('candidate-controls').tabIndex = -1;
    this.candidates = new CandidateSelection(this.part('candidate-controls'), candidateList, choice => {
      const actionButton = choice.button ?? this.part(callButtonPart(choice.operationType as 'pon' | 'daiminkan' | 'chi')) as HTMLButtonElement;
      const baseTrace = this.trace(actionButton, choice.operationType);
      const trace = this.candidateClickTrace ?? { ...baseTrace, candidateId: choice.candidateId };
      const candidateBack = this.part('candidate-back') as HTMLButtonElement;
      candidateBack.disabled = true;
      candidateBack.setAttribute('aria-busy', 'true');
      if (choice.operationType === 'pon' || choice.operationType === 'chi' || choice.operationType === 'daiminkan') {
        this.callType = null;
        this.lockCallButtons();
        this.handler({ type: 'select-call', optionId: choice.id }, trace);
      } else {
        this.handler({ type: 'select-kan', optionId: choice.id }, trace);
      }
      if (this.part('candidate-controls').hidden) this.part('action-status').focus({ preventScroll: true });
      else this.part('candidate-controls').focus({ preventScroll: true });
    });
    if (typeof window !== 'undefined') {
      const repositionCandidates = () => this.repositionCandidatePanel();
      window.addEventListener('resize', repositionCandidates, { passive: true });
      window.addEventListener('scroll', repositionCandidates, { passive: true });
      window.visualViewport?.addEventListener('resize', repositionCandidates, { passive: true });
      window.visualViewport?.addEventListener('scroll', repositionCandidates, { passive: true });
    }
    root.addEventListener('pointerdown', event => this.onPointerDown(event), true);
    root.addEventListener('click', event => this.onClick(event));
    root.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape' && !this.part('candidate-controls').hidden &&
        !(this.part('candidate-back') as HTMLButtonElement).disabled) {
        event.preventDefault();
        this.returnFromCandidates();
      }
    });
  }

  setHandler(handler: ActionPanelHandler): void {
    this.handler = handler;
  }

  clear(): void {
    this.activeCallOptions = [];
    this.callSelectionPending = false;
    this.callType = null;
    this.candidates.hide();
    this.clearCandidateAnchor();
    for (const part of ['discard', 'riichi', 'tsumo', 'kyuushu', 'kan-toggle', 'call-pon', 'call-kan', 'call-chi', 'candidate-back', 'ron', 'pass-ron', 'pass-call', 'next-round', 'show-result', 'show-match-result']) {
      const button = this.part(part) as HTMLButtonElement;
      button.hidden = true;
      button.disabled = true;
      button.textContent = part === 'candidate-back' ? '戻る' : '';
      button.removeAttribute('aria-busy');
    }
    for (const part of ['call-controls', 'candidate-controls', 'normal-controls', 'ron-controls', 'round-actions']) this.part(part).hidden = true;
    for (const part of ['ron-target']) this.part(part).replaceChildren();
    for (const part of ['call-status', 'ron-status', 'action-status']) this.part(part).textContent = '';
    this.root.classList.remove('ron-pending', 'game-ended', 'result-available');
  }

  update(state: ActionPanelState): void {
    const progressing = this.context().progressing === true || /送信しています|送信中|操作を確認しています/u.test(state.actionStatus);
    const wasHidden = {
      call: this.part('call-controls').hidden,
      candidate: this.part('candidate-controls').hidden,
      ron: this.part('ron-controls').hidden,
    };
    const candidateHadFocus = !wasHidden.candidate && this.part('candidate-controls').contains(document.activeElement);
    this.activeCallOptions = actionChoicesForDisplay('call', state.callGroup.options);
    if (!state.callGroup.visible || !progressing) this.callSelectionPending = false;
    const wasRonHidden = this.part('ron-controls').hidden;
    for (const [name, buttonState] of Object.entries(state.buttons) as [ActionPanelPart, ActionButtonState][]) {
      const button = this.part(name) as HTMLButtonElement;
      button.hidden = !buttonState.visible;
      button.disabled = !buttonState.enabled;
      button.textContent = buttonState.label;
      if (progressing && buttonState.visible && !buttonState.enabled) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    }

    const callControls = this.part('call-controls');
    callControls.hidden = !state.callGroup.visible || this.callType !== null || this.callSelectionPending;
    this.part('call-status').textContent = state.callGroup.status;
    for (const [type, part] of [['pon', 'call-pon'], ['daiminkan', 'call-kan'], ['chi', 'call-chi']] as const) {
      const button = this.part(part) as HTMLButtonElement;
      const candidates = this.activeCallOptions.filter(option => callTypeForLabel(option.label) === type);
      button.hidden = !state.callGroup.visible || candidates.length === 0 || this.callType !== null || this.callSelectionPending;
      button.disabled = candidates.length === 0 || this.callSelectionPending || !candidates.some(option => option.enabled);
      if (this.callSelectionPending || (progressing && candidates.length > 0 && !candidates.some(option => option.enabled))) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    }
    const passCall = this.part('pass-call') as HTMLButtonElement;
    passCall.hidden = !state.callGroup.visible || this.callType !== null;
    if (!state.callGroup.visible) this.callType = null;
    passCall.disabled = this.callSelectionPending || !state.buttons['pass-call'].enabled;

    const candidateMode = this.callType !== null || state.kanGroup.visible;
    const selectedOptions = this.callType ? this.optionsForSelection() : state.kanGroup.options;
    const selectedOperation = this.callType ?? operationFor(selectedOptions[0] ?? { id: '', label: '', tiles: [], enabled: false }) ?? 'ankan';
    const candidatePanel = this.part('candidate-controls');
    candidatePanel.hidden = !candidateMode || selectedOptions.length === 0;
    if (candidateMode) candidatePanel.dataset.mode = this.callType ? 'call' : 'kan';
    else delete candidatePanel.dataset.mode;
    const candidateBack = this.part('candidate-back') as HTMLButtonElement;
    candidateBack.hidden = !candidateMode || selectedOptions.length === 0;
    candidateBack.dataset.diagnosticActionType = this.callType ?? selectedOperation;
    candidateBack.setAttribute('aria-label', '戻る');
    if (candidateMode && selectedOptions.length > 0) {
      this.activateCandidateAnchor(this.callType ? 'call' : 'kan');
      this.candidates.show(selectedOptions, selectedOperation, progressing || this.callSelectionPending);
      if (progressing || this.callSelectionPending) candidatePanel.setAttribute('aria-busy', 'true');
      else candidatePanel.removeAttribute('aria-busy');
      if (wasHidden.candidate) this.candidates.focusFirst();
    }
    else {
      this.candidates.hide();
      this.clearCandidateAnchor();
      if (!candidateMode && candidateHadFocus) this.part('action-status').focus({ preventScroll: true });
    }
    candidateBack.disabled = progressing || this.callSelectionPending || this.candidates.pending;
    if (candidateBack.disabled) candidateBack.setAttribute('aria-busy', 'true');
    else candidateBack.removeAttribute('aria-busy');
    this.part('normal-controls').hidden = candidateMode;

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
    this.recordPanelDisplay('call', wasHidden.call, state.callGroup.visible && this.callType === null, actionChoicesForDisplay('call', state.callGroup.options).length,
      !state.callGroup.options.some(option => option.enabled) && (this.part('pass-call') as HTMLButtonElement).disabled);
    this.recordPanelDisplay('candidate', wasHidden.candidate, candidateMode && selectedOptions.length > 0, selectedOptions.length,
      !selectedOptions.some(option => option.enabled));
    this.recordPanelDisplay('ron', wasHidden.ron, state.ronGroup.visible, state.ronGroup.visible ? 1 : 0,
      state.ronGroup.visible && !state.buttons.ron.enabled);
  }

  private context(): { phase?: string | null; progressing?: boolean } {
    try { return this.options.getContext?.() ?? {}; } catch { return {}; }
  }

  private trace(button: HTMLButtonElement, actionType: string): ActionPanelTrace {
    const callType = button.dataset.panelAction === 'call-pon' ? 'pon'
      : button.dataset.panelAction === 'call-kan' ? 'daiminkan'
        : button.dataset.panelAction === 'call-chi' ? 'chi' : null;
    const candidates = callType ? this.activeCallOptions.filter(option => callTypeForLabel(option.label) === callType) : [];
    return {
      operationId: Date.now() * 1000 + (++nextOperationId % 1000),
      panelId: this.visiblePanelIds.get(button.closest('[data-panel-part="candidate-controls"]') ? 'candidate'
        : button.closest('[data-panel-part="call-controls"]') ? 'call'
          : button.closest('[data-panel-part="ron-controls"]') ? 'ron' : '') ?? null,
      actionType,
      ...(button.dataset.candidateId ? { candidateId: button.dataset.candidateId }
        : candidates.length === 1 ? { candidateId: 'call-1' } : {}),
    };
  }

  private recordInput(event: 'action_panel_pointer_received' | 'action_panel_click_received', button: HTMLButtonElement, trace: ActionPanelTrace): void {
    const context = this.context();
    const hidden = button.hidden || Boolean(button.closest('[hidden]'));
    diagnosticLog.record('INFO', event, {
      operationId: trace.operationId, panelId: trace.panelId ?? undefined, actionType: trace.actionType,
      candidateId: trace.candidateId, disabled: button.disabled, progressing: context.progressing,
      phase: context.phase, reason: hidden ? 'hidden' : button.disabled ? 'disabled' : undefined,
    });
  }

  private onPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button[data-action-choice],button[data-panel-action]');
    if (!button || !this.ownsButton(button)) return;
    const trace = this.trace(button, button.dataset.diagnosticActionType ?? 'unknown');
    this.pendingPointerTrace = { target: button, trace };
    this.recordInput('action_panel_pointer_received', button, trace);
  }

  private onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const choice = target.closest<HTMLButtonElement>('button[data-action-choice]');
    if (choice && this.ownsButton(choice)) {
      const trace = (event as MouseEvent).detail > 0 && this.pendingPointerTrace?.target === choice ? this.pendingPointerTrace.trace
        : this.trace(choice, choice.dataset.diagnosticActionType ?? 'unknown');
      this.pendingPointerTrace = null;
      this.recordInput('action_panel_click_received', choice, trace);
      this.candidateClickTrace = trace;
      this.candidates.select(choice);
      this.candidateClickTrace = null;
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-panel-action]');
    if (!button || !this.ownsButton(button)) return;
    const trace = (event as MouseEvent).detail > 0 && this.pendingPointerTrace?.target === button ? this.pendingPointerTrace.trace
      : this.trace(button, button.dataset.diagnosticActionType ?? 'unknown');
    this.pendingPointerTrace = null;
    this.recordInput('action_panel_click_received', button, trace);
    if (button.disabled || button.hidden || button.closest('[hidden]')) return;
    const action = button.dataset.panelAction as ActionPanelPart | 'candidate-back' | undefined;
    if (!action) return;
    if (action === 'candidate-back') {
      this.returnFromCandidates(trace);
      return;
    }
    if (action === 'call-pon' || action === 'call-kan' || action === 'call-chi') {
      const type = action === 'call-pon' ? 'pon' : action === 'call-kan' ? 'daiminkan' : 'chi';
      this.chooseCallType(type);
      return;
    }
    if (action === 'pass-call') {
      this.callType = null;
      this.lockCallButtons();
    }
    this.handler({ type: action }, trace);
  }

  private ownsButton(button: HTMLButtonElement): boolean {
    return this.root.contains(button);
  }

  private chooseCallType(type: 'pon' | 'daiminkan' | 'chi'): void {
    if (this.callSelectionPending) return;
    const candidates = this.activeCallOptions.filter(option => callTypeForLabel(option.label) === type && option.enabled);
    if (candidates.length > 0) {
      if (candidates.length === 1) {
        this.callType = null;
        this.candidates.show(candidates, type, this.callSelectionPending, 'select');
        this.part('action-status').focus({ preventScroll: true });
        return;
      }
      // Preserve the action panel's normal baseline before hiding the call
      // type controls and ordinary actions for the candidate view.
      this.captureCandidateAnchor();
      this.callType = type;
      this.part('call-controls').hidden = true;
      for (const part of ['call-pon', 'call-kan', 'call-chi']) (this.part(part) as HTMLButtonElement).hidden = true;
      (this.part('candidate-back') as HTMLButtonElement).hidden = false;
      (this.part('pass-call') as HTMLButtonElement).hidden = true;
      this.candidates.show(candidates, type, this.callSelectionPending);
      this.part('candidate-controls').hidden = false;
      this.activateCandidateAnchor('call');
      this.part('candidate-controls').dataset.mode = 'call';
      this.recordPanelDisplay('candidate', true, true, candidates.length, false, type);
      this.part('normal-controls').hidden = true;
      (this.part('candidate-back') as HTMLButtonElement).hidden = false;
      (this.part('candidate-back') as HTMLButtonElement).dataset.diagnosticActionType = type;
      this.candidates.focusFirst();
    }
  }

  private optionsForSelection(): readonly ActionChoiceOption[] {
    return this.callType ? this.activeCallOptions.filter(option => callTypeForLabel(option.label) === this.callType) : [];
  }

  private returnToCallTypes(focus = true): void {
    const previous = this.callType;
    this.callType = null;
    this.candidates.hide();
    this.part('candidate-controls').hidden = true;
    this.clearCandidateAnchor();
    delete this.part('candidate-controls').dataset.mode;
    this.part('call-controls').hidden = false;
    this.part('normal-controls').hidden = false;
    for (const [type, part] of [['pon', 'call-pon'], ['daiminkan', 'call-kan'], ['chi', 'call-chi']] as const) {
      const candidates = this.activeCallOptions.filter(option => callTypeForLabel(option.label) === type);
      (this.part(part) as HTMLButtonElement).hidden = candidates.length === 0;
    }
    (this.part('candidate-back') as HTMLButtonElement).hidden = true;
    (this.part('pass-call') as HTMLButtonElement).hidden = false;
    const button = previous ? this.part(callButtonPart(previous)) : this.part('call-pon');
    const typeButton = button as HTMLButtonElement;
    if (focus && !typeButton.hidden && !typeButton.disabled) typeButton.focus({ preventScroll: true });
  }

  private returnFromCandidates(trace?: ActionPanelTrace): void {
    if ((this.part('candidate-back') as HTMLButtonElement).disabled) return;
    if (this.callType) {
      this.returnToCallTypes();
      return;
    }
    const button = this.part('candidate-back') as HTMLButtonElement;
    const backTrace = trace ?? this.trace(button, button.dataset.diagnosticActionType ?? 'candidate-back');
    this.candidates.hide();
    this.part('candidate-controls').hidden = true;
    this.clearCandidateAnchor();
    delete this.part('candidate-controls').dataset.mode;
    this.part('normal-controls').hidden = false;
    this.handler({ type: 'cancel-kan' }, backTrace);
    (this.part('kan-toggle') as HTMLButtonElement).focus({ preventScroll: true });
  }

  private lockCallButtons(): void {
    this.callSelectionPending = true;
    this.part('call-controls').hidden = true;
    for (const part of ['call-pon', 'call-kan', 'call-chi', 'pass-call']) {
      const button = this.part(part) as HTMLButtonElement;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
  }

  private activateCandidateAnchor(mode: 'call' | 'kan'): void {
    const panel = this.part('candidate-controls');
    if (panel.hidden || this.candidateAnchorDocumentBottom === null) this.captureCandidateAnchor();
    panel.dataset.mode = mode;
    this.repositionCandidatePanel();
  }

  private captureCandidateAnchor(): void {
    const bounds = this.root.getBoundingClientRect();
    this.candidateAnchorDocumentBottom = bounds.bottom + (typeof window === 'undefined' ? 0 : window.scrollY);
    this.candidateAnchorRootHeight = Math.ceil(bounds.height);
    // The candidate list is fixed to the viewport. Retain the action panel's
    // prior flow height while its ordinary controls are hidden so a scrolled
    // document does not clamp scrollTop as the candidate screen opens.
    this.root.style.minHeight = `${this.candidateAnchorRootHeight}px`;
  }

  private repositionCandidatePanel(): void {
    const panel = this.part('candidate-controls');
    if (panel.hidden || this.candidateAnchorDocumentBottom === null || typeof window === 'undefined') return;
    const visual = window.visualViewport;
    const visualBottom = Math.min(window.innerHeight, (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight));
    const rootBottom = this.candidateAnchorDocumentBottom - window.scrollY;
    const visibleBottom = Math.min(rootBottom, visualBottom - 8);
    panel.style.setProperty('--candidate-panel-bottom', `${Math.max(8, window.innerHeight - visibleBottom)}px`);
  }

  private clearCandidateAnchor(): void {
    const panel = this.part('candidate-controls');
    delete panel.dataset.mode;
    panel.style.removeProperty('--candidate-panel-bottom');
    this.candidateAnchorDocumentBottom = null;
    this.candidateAnchorRootHeight = null;
    this.root.style.removeProperty('min-height');
  }

  private recordPanelDisplay(panelType: 'call' | 'candidate' | 'ron', wasHidden: boolean, visible: boolean, candidateCount: number, disabled: boolean, actionType?: string): void {
    if (!visible) {
      this.visiblePanelIds.delete(panelType);
      return;
    }
    if (!wasHidden) return;
    const panelId = Date.now() * 1000 + (++nextPanelId % 1000);
    this.visiblePanelIds.set(panelType, panelId);
    const context = this.context();
    diagnosticLog.record('INFO', 'action_panel_displayed', {
      panelId, panelType, actionType, candidateCount, disabled, progressing: context.progressing, phase: context.phase,
    });
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
  return uniqueCallOptionsByDisplay(options, option => option.label);
}

export function choiceAccessibleLabel(label: string, tiles: readonly ActionTile[], suffix = ''): string {
  return `${label}：${tiles.map(tile => tileLabel(tile.tile)).join('・')}${suffix ? `（${suffix}）` : ''}`;
}

function callTypeForLabel(label: string): 'pon' | 'daiminkan' | 'chi' | null {
  return label === 'ポン' ? 'pon' : label === 'チー' ? 'chi' : label === '大明カン' ? 'daiminkan' : null;
}

function callButtonPart(type: 'pon' | 'daiminkan' | 'chi'): 'call-pon' | 'call-kan' | 'call-chi' {
  return type === 'pon' ? 'call-pon' : type === 'chi' ? 'call-chi' : 'call-kan';
}
