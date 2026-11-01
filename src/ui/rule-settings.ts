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

/** The same inline editor is mounted in the offline and online creation dialogs. */
export class RuleEditor {
  private readonly root: HTMLElement | null;
  private readonly formatOptions: HTMLFieldSetElement | null;
  private readonly fixedRules: HTMLElement | null;
  private readonly preferences: RulePreferences;
  constructor(rootSelector: string, preferences: RulePreferences) {
    this.root = document.querySelector<HTMLElement>(rootSelector);
    this.preferences = preferences;
    if (!this.root) { this.formatOptions = null; this.fixedRules = null; return; }
    this.formatOptions = document.createElement('fieldset');
    this.formatOptions.className = 'match-format-options';
    const legend = document.createElement('legend');
    legend.textContent = '対局形式';
    this.formatOptions.append(legend);
    for (const [value, text] of [
      ['tonpu', '東風戦（東1局〜東4局）'],
      ['tonnan', '半荘戦（東場・南場）'],
    ]) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${this.root.id}-match-format`;
      input.value = value;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        const rules = normalizeGameRules({ schemaVersion: 1, matchFormat: input.value });
        this.preferences.commit(rules);
        this.renderFixedRules(rules);
      });
      label.append(input, document.createTextNode(` ${text}`));
      this.formatOptions.append(label);
    }
    const fixedSection = document.createElement('section');
    fixedSection.className = 'rule-settings-fixed';
    const heading = document.createElement('h3');
    heading.textContent = '変更できないルール';
    this.fixedRules = document.createElement('div');
    this.fixedRules.className = 'rule-settings-fixed-list';
    fixedSection.append(heading, this.fixedRules);
    this.root.replaceChildren(this.formatOptions, fixedSection);
    this.update(preferences.current);
  }
  update(rules: unknown = this.preferences.current): void {
    if (!this.root || !this.formatOptions) return;
    const normalized = normalizeGameRules(rules);
    this.formatOptions.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(input => {
      input.checked = input.value === normalized.matchFormat;
    });
    this.renderFixedRules(normalized);
  }
  setDisabled(disabled: boolean): void { if (this.formatOptions) this.formatOptions.disabled = disabled; }
  private renderFixedRules(rules: GameRules): void {
    if (!this.fixedRules) return;
    const rows = describeConfirmedRules(rules).filter(entry => entry.label !== '対局形式');
    const list = document.createElement('dl');
    list.className = 'confirmed-rules-list';
    for (const entry of rows) {
      const row = document.createElement('div');
      row.className = 'confirmed-rule-row';
      const term = document.createElement('dt'); term.textContent = entry.label;
      const description = document.createElement('dd'); description.textContent = entry.value;
      row.append(term, description); list.append(row);
    }
    this.fixedRules.replaceChildren(list);
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
