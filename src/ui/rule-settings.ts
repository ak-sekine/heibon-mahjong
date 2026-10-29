import {
  describeConfirmedRules, loadLastGameRules, normalizeGameRules, saveLastGameRules,
  type GameRules, type RulesStorage,
} from '../model/rules.ts';

export class RulePreferences {
  private value: GameRules;
  private readonly storage?: RulesStorage | null;
  constructor(storage?: RulesStorage | null) { this.storage = storage; this.value = loadLastGameRules(storage); }
  get current(): GameRules { return this.value; }
  resetToLastStarted(): GameRules { this.value = loadLastGameRules(this.storage); return this.value; }
  commit(value: unknown): GameRules { this.value = normalizeGameRules(value); return this.value; }
  acceptedStart(value: unknown): GameRules {
    this.value = normalizeGameRules(value);
    saveLastGameRules(this.value, this.storage);
    return this.value;
  }
}

export function renderRulesList(root: HTMLElement, rules: unknown, label = '現在のルール'): void {
  root.replaceChildren();
  const list = document.createElement('dl');
  list.className = 'confirmed-rules-list';
  for (const entry of describeConfirmedRules(rules)) {
    const row = document.createElement('div');
    row.className = 'confirmed-rule-row';
    const term = document.createElement('dt');
    term.textContent = entry.label;
    const description = document.createElement('dd');
    description.textContent = entry.value;
    row.append(term, description);
    list.append(row);
  }
  root.append(list);
  root.setAttribute('aria-label', label);
}

/** One editor is shared by offline new matches and online room creation. */
export class RuleSettingsDialog {
  private readonly dialog: HTMLDialogElement | null;
  private trigger: HTMLButtonElement | null = null;
  private accepted: ((rules: GameRules) => void) | null = null;
  private draft: GameRules;
  private readonly preferences: RulePreferences;
  constructor(preferences: RulePreferences) {
    this.preferences = preferences;
    this.draft = preferences.current;
    const dialog = document.querySelector<HTMLDialogElement>('#rule-settings-dialog');
    this.dialog = dialog;
    // Verification pages reuse main.ts without the production settings dialog.
    if (!dialog) return;
    document.querySelectorAll<HTMLInputElement>('input[name="rules-match-format"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.draft = normalizeGameRules({ schemaVersion: 1, matchFormat: input.value });
        const display = document.querySelector<HTMLElement>('#rule-settings-summary');
        if (display) display.textContent = this.draft.matchFormat === 'tonnan' ? '現在：半荘戦' : '現在：東風戦';
        const details = document.querySelector<HTMLElement>('#rule-settings-details');
        if (details) renderRulesList(details, this.draft);
      });
    });
    for (const id of ['#new-game-rules', '#online-create-rules']) {
      document.querySelector<HTMLButtonElement>(id)?.addEventListener('click', event => {
        const button = event.currentTarget as HTMLButtonElement;
        this.open(button);
      });
    }
    document.querySelector<HTMLButtonElement>('#cancel-rule-settings')?.addEventListener('click', () => this.cancel());
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.cancel(); });
    dialog.addEventListener('close', () => {
      this.trigger?.focus({ preventScroll: true });
      this.trigger = null;
      this.accepted = null;
    });
    document.querySelector<HTMLButtonElement>('#confirm-rule-settings')?.addEventListener('click', () => {
      if (!dialog.open) return;
      const format = document.querySelector<HTMLInputElement>('input[name="rules-match-format"]:checked')?.value;
      this.draft = normalizeGameRules({ schemaVersion: 1, matchFormat: format });
      const done = this.accepted;
      this.preferences.commit(this.draft);
      this.updateSummaries();
      this.accepted = null;
      dialog.close();
      done?.(this.draft);
    });
  }
  open(trigger: HTMLButtonElement, accepted?: (rules: GameRules) => void): void {
    if (!this.dialog || this.dialog.open) return;
    this.trigger = trigger;
    this.accepted = accepted ?? null;
    this.draft = this.preferences.current;
    const selected = document.querySelector<HTMLInputElement>(`input[name="rules-match-format"][value="${this.draft.matchFormat}"]`);
    if (selected) selected.checked = true;
    const display = document.querySelector<HTMLElement>('#rule-settings-summary');
    if (display) display.textContent = this.draft.matchFormat === 'tonnan' ? '現在：半荘戦' : '現在：東風戦';
    const details = document.querySelector<HTMLElement>('#rule-settings-details');
    if (details) renderRulesList(details, this.draft);
    this.dialog.showModal();
    document.querySelector<HTMLButtonElement>('#cancel-rule-settings')?.focus({ preventScroll: true });
  }
  private cancel(): void {
    if (!this.dialog) return;
    this.draft = this.preferences.current;
    this.accepted = null;
    this.dialog.close();
  }
  private updateSummaries(): void {
    const label = this.preferences.current.matchFormat === 'tonnan' ? '半荘戦' : '東風戦';
    const offline = document.querySelector<HTMLElement>('#new-game-rules-summary');
    const online = document.querySelector<HTMLElement>('#online-create-rules-summary');
    if (offline) offline.textContent = `現在：${label}`;
    if (online) online.textContent = `設定：${label}`;
  }
}

/** Shared offline/online viewer. The legacy online IDs are kept for existing callers. */
export function openReadOnlyRules(trigger: HTMLButtonElement, rules: unknown, source: 'online' | 'offline' = 'online'): void {
  const dialog = document.querySelector<HTMLDialogElement>('#online-rules-dialog')!;
  if (dialog.open) return;
  const title = document.querySelector<HTMLElement>('#online-rules-readonly-label')!;
  title.textContent = source === 'offline'
    ? '読み取り専用：現在の対局開始時に確定したルール'
    : '読み取り専用：ホストがルーム作成時に確定したルール';
  const list = document.querySelector<HTMLElement>('#online-rules-list')!;
  renderRulesList(list, rules, source === 'offline' ? '現在の対局で確定したルール' : 'サーバーで確定したルール');
  const close = document.querySelector<HTMLButtonElement>('#online-rules-close')!;
  close.onclick = () => dialog.close();
  const focusTarget = source === 'offline'
    ? document.querySelector<HTMLButtonElement>('#main-menu-toggle') ?? trigger
    : trigger;
  dialog.onclose = () => focusTarget.focus({ preventScroll: true });
  dialog.showModal();
  list.scrollTop = 0;
  close.focus({ preventScroll: true });
}
