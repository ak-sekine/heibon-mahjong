/** Only explicit confirmation may reset the match; dismissal only restores focus. */
export class NewGameDialog {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#new-game-dialog')!;
  private trigger: HTMLButtonElement | null = null;
  constructor(start: () => void) {
    for (const id of ['#new-game', '#result-new-game']) {
      const button = document.querySelector<HTMLButtonElement>(id)!;
      button.addEventListener('click', () => {
        if (this.dialog.open) return;
        this.trigger = button;
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
      this.trigger = null;
      this.dialog.close();
      start();
      document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
    });
  }
  private cancel(): void {
    this.dialog.close();
    this.trigger?.focus({ preventScroll: true });
  }
}
