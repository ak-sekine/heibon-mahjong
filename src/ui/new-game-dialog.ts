import type { GameRules } from '../model/rules.ts';
import { DEFAULT_GAME_RULES } from '../model/rules.ts';
import { RulePreferences } from './rule-settings.ts';

/** Only explicit confirmation may reset the match; dismissal only restores focus. */
export class NewGameDialog {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#new-game-dialog')!;
  private trigger: HTMLButtonElement | null = null;
  private readonly preferences?: RulePreferences;
  constructor(start: (rules: GameRules) => void, hasActiveGame: () => boolean = () => true,
    preferences?: RulePreferences) {
    this.preferences = preferences;
    for (const id of ['#new-game', '#result-new-game']) {
      const button = document.querySelector<HTMLButtonElement>(id)!;
      button.addEventListener('click', () => {
        if (this.dialog.open) return;
        this.preferences?.resetToLastStarted();
        this.updateSummary();
        // The header action now lives in a menu that becomes hidden as soon as
        // it is selected, so restore focus to the menu button after dismissal.
        this.trigger = id === '#new-game'
          ? document.querySelector<HTMLButtonElement>('#main-menu-toggle') ?? button
          : button;
        const activeGame = hasActiveGame();
        const question = document.querySelector<HTMLElement>('#new-game-question');
        const confirm = document.querySelector<HTMLButtonElement>('#confirm-new-game')!;
        confirm.classList.toggle('ui-button--d2', activeGame);
        confirm.classList.toggle('ui-button--a', !activeGame);
        confirm.textContent = activeGame ? '現在の対局を終了して開始' : '新しい対局を開始';
        if (question) question.textContent = activeGame
          ? '進行中の対局を終了し、現在の局面と点数を破棄して最初から始めます。この対局は復元できません。続行しますか？'
          : '新しい対局を開始しますか？';
        this.dialog.showModal();
        document.querySelector<HTMLButtonElement>('#cancel-new-game')!.focus({ preventScroll: true });
      });
    }
    document.querySelector('#cancel-new-game')!.addEventListener('click', () => this.cancel());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.cancel(); });
    this.dialog.addEventListener('close', () => {
      this.trigger?.focus({ preventScroll: true });
      this.trigger = null;
    });
    document.querySelector('#confirm-new-game')!.addEventListener('click', () => {
      if (!this.dialog.open) return;
      const focusTarget = document.querySelector<HTMLButtonElement>('#main-menu-toggle') ?? this.trigger;
      this.trigger = null;
      this.dialog.close();
      start(this.preferences?.current ?? DEFAULT_GAME_RULES);
      focusTarget?.focus({ preventScroll: true });
    });
  }
  private cancel(): void {
    this.dialog.close();
    this.trigger?.focus({ preventScroll: true });
  }
  private updateSummary(): void {
    const summary = document.querySelector<HTMLElement>('#new-game-rules-summary');
    if (summary) summary.textContent = this.preferences?.current.matchFormat === 'tonnan' ? '現在：半荘戦' : '現在：東風戦';
  }
}
