import type { MatchState } from '../model/match.ts';

/** Visibility belongs to the UI; opening never advances or settles the game. */
export class ResultDialog {
  private result: MatchState['lastSettlement'] = null;
  private readonly dialog = document.querySelector<HTMLDialogElement>('#result-dialog')!;
  private readonly reopen = document.querySelector<HTMLButtonElement>('#show-result')!;
  constructor() {
    document.querySelector('#view-table')!.addEventListener('click', () => this.close());
    this.reopen.addEventListener('click', () => this.open());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('result-open');
      if (this.result) this.reopen.focus({ preventScroll: true });
    });
  }
  update(match: MatchState): void {
    const result = match.lastSettlement;
    this.reopen.hidden = !result;
    document.querySelector('.discard-controls')!.classList.toggle('result-available', !!result);
    document.querySelector<HTMLButtonElement>('#result-new-game')!.hidden = match.status !== 'match-ended';
    if (result === this.result) return;
    this.result = result;
    if (!result) { this.close(); return; }
    document.querySelector('#result-title')!.textContent = match.status === 'match-ended'
      ? '東風戦終了' : result.reason === 'draw' ? '流局' : match.game.winResult?.winMethod === 'ron' ? 'ロン和了' : 'ツモ和了';
    document.querySelector('#result-body')!.scrollTop = 0;
    this.open();
  }
  open(): void {
    if (!this.result || this.dialog.open) return;
    this.dialog.showModal();
    document.documentElement.classList.add('result-open');
    document.querySelector<HTMLButtonElement>('#view-table')!.focus({ preventScroll: true });
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
    document.documentElement.classList.remove('result-open');
    if (this.result) this.reopen.focus({ preventScroll: true });
  }
}
