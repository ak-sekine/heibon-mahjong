/** Only explicit confirmation may reset the match; dismissal only restores focus. */
export class NewGameDialog {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#new-game-dialog')!;
  private trigger: HTMLButtonElement | null = null;
  constructor(start: (format: 'tonpu' | 'tonnan') => void, hasActiveGame: () => boolean = () => true) {
    for (const id of ['#new-game', '#result-new-game']) {
      const button = document.querySelector<HTMLButtonElement>(id)!;
      button.addEventListener('click', () => {
        if (this.dialog.open) return;
        const defaultFormat = document.querySelector<HTMLInputElement>('input[name="offline-match-format"][value="tonpu"]');
        if (defaultFormat) defaultFormat.checked = true;
        // The header action now lives in a menu that becomes hidden as soon as
        // it is selected, so restore focus to the menu button after dismissal.
        this.trigger = id === '#new-game'
          ? document.querySelector<HTMLButtonElement>('#main-menu-toggle') ?? button
          : button;
        const question = document.querySelector<HTMLElement>('#new-game-question');
        if (question) question.textContent = hasActiveGame()
          ? '現在の対局を終了して、最初から始めますか？'
          : '対局形式を選んで、オフライン対局を開始します。';
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
      const format = document.querySelector<HTMLInputElement>('input[name="offline-match-format"]:checked')?.value === 'tonnan' ? 'tonnan' : 'tonpu';
      start(format);
      focusTarget?.focus({ preventScroll: true });
    });
  }
  private cancel(): void {
    this.dialog.close();
    this.trigger?.focus({ preventScroll: true });
  }
}
