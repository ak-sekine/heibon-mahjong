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
  private readonly optionalRules: HTMLFieldSetElement | null;
  private readonly fixedRules: HTMLElement | null;
  private readonly preferences: RulePreferences;
  constructor(rootSelector: string, preferences: RulePreferences) {
    this.root = document.querySelector<HTMLElement>(rootSelector);
    this.preferences = preferences;
    if (!this.root) { this.formatOptions = null; this.optionalRules = null; this.fixedRules = null; return; }
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
        const rules = normalizeGameRules({ ...this.preferences.current, matchFormat: input.value });
        this.preferences.commit(rules);
        this.renderFixedRules(rules);
      });
      label.append(input, document.createTextNode(` ${text}`));
      this.formatOptions.append(label);
    }
    this.optionalRules = document.createElement('fieldset');
    this.optionalRules.className = 'optional-rule-options';
    const optionalLegend = document.createElement('legend');
    optionalLegend.textContent = 'ローカルルール';
    this.optionalRules.append(optionalLegend);
    const options = [
      ['redDora', '赤ドラ', '赤5牌を使用し、ドラとして数えます'],
      ['kuitan', '喰いタン', '副露した断么九を役として認めます'],
      ['uraDora', '裏ドラ', 'リーチ和了時に裏ドラを数えます'],
      ['ippatsu', '一発', '成立条件を満たす一発を役として数えます'],
      ['kanDora', 'カンドラ', '槓成立時に表ドラと槓裏ドラを追加します'],
      ['dealerTenpaiRenchan', '親テンパイ連荘', '通常流局で親がテンパイなら親を維持します'],
      ['kyuushuKyuuhai', '九種九牌', '第一ツモ時の宣言による途中流局を認めます'],
      ['fourWinds', '四風連打', '4人の第一打が同じ風牌なら途中流局します'],
      ['fourRiichi', '四家立直', '4人全員がリーチしたら途中流局します'],
      ['fourKans', '四開槓', '複数人の合計4回のカンで途中流局します'],
      ['agariYame', 'アガリやめ', '最終局で親が和了し、精算後に単独トップなら終了します'],
      ['tenpaiYame', 'テンパイやめ', '最終局で親テンパイ連荘となり、精算後に単独トップなら終了します'],
      ['doubleYakuman', '特殊形ダブル役満', '四暗刻単騎・国士無双十三面待ち・純正九蓮宝燈・大四喜を2倍役満にします'],
    ] as const;
    for (const [key, title, hint] of options) {
      const label = document.createElement('label');
      label.className = 'optional-rule-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.ruleKey = key;
      input.addEventListener('change', () => {
        this.preferences.commit({ ...this.preferences.current, [key]: input.checked });
        this.renderFixedRules(this.preferences.current);
      });
      const content = document.createElement('span');
      const name = document.createElement('strong'); name.textContent = title;
      const description = document.createElement('small'); description.textContent = hint;
      content.append(name, description); label.append(input, content); this.optionalRules.append(label);
    }
    const fixedSection = document.createElement('section');
    fixedSection.className = 'rule-settings-fixed';
    const heading = document.createElement('h3');
    heading.textContent = 'その他の固定ルール';
    this.fixedRules = document.createElement('div');
    this.fixedRules.className = 'rule-settings-fixed-list';
    fixedSection.append(heading, this.fixedRules);
    this.root.replaceChildren(this.formatOptions, this.optionalRules, fixedSection);
    this.update(preferences.current);
  }
  update(rules: unknown = this.preferences.current): void {
    if (!this.root || !this.formatOptions || !this.optionalRules) return;
    const normalized = normalizeGameRules(rules);
    this.formatOptions.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(input => {
      input.checked = input.value === normalized.matchFormat;
    });
    this.optionalRules.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
      const key = input.dataset.ruleKey as keyof GameRules | undefined;
      if (key && key !== 'schemaVersion' && key !== 'matchFormat') input.checked = Boolean(normalized[key]);
    });
    this.renderFixedRules(normalized);
  }
  setDisabled(disabled: boolean): void {
    if (this.formatOptions) this.formatOptions.disabled = disabled;
    if (this.optionalRules) this.optionalRules.disabled = disabled;
  }
  private renderFixedRules(rules: GameRules): void {
    if (!this.fixedRules) return;
    const rows = describeConfirmedRules(rules).filter(entry => !['対局形式', '赤ドラ', '喰いタン', '裏ドラ', '一発', 'カンドラ', '親テンパイ連荘', '九種九牌', '四風連打', '四家立直', '四開槓', 'アガリやめ', 'テンパイやめ', '特殊形ダブル役満'].includes(entry.label));
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
