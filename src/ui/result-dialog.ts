import type { MatchState } from '../model/match.ts';

/** Visibility belongs to the UI; opening never advances or settles the game. */
export class ResultDialog {
  private result: MatchState['lastSettlement'] = null;
  private readonly dialog = document.querySelector<HTMLDialogElement>('#result-dialog')!;
  private readonly reopen = document.querySelector<HTMLButtonElement>('#show-result')!;
  constructor() {
    document.querySelector('#view-table')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('result-open');
      if (this.result) this.reopen.focus({ preventScroll: true });
    });
  }
  update(match: MatchState): void {
    const result = match.lastSettlement;
    document.querySelector<HTMLButtonElement>('#result-new-game')!.hidden = match.status !== 'match-ended';
    if (result === this.result) return;
    this.result = result;
    if (!result) { this.close(); return; }
    const abortiveNames = {
      'four-kans': '四開槓',
      'kyuushu-kyuuhai': '九種九牌',
      'four-winds': '四風連打',
      'four-riichi': '四家立直',
    } as const;
    document.querySelector('#result-title')!.textContent = match.status === 'match-ended' ? '東風戦終了'
      : result.reason === 'nagashi-mangan' ? '流し満貫'
        : result.reason in abortiveNames ? `途中流局（${abortiveNames[result.reason as keyof typeof abortiveNames]}）`
          : result.reason === 'draw' ? '荒牌流局'
            : match.game.winResult?.winMethod === 'ron' ? 'ロン和了' : 'ツモ和了';
    document.querySelector('#result-body')!.scrollTop = 0;
  }
  open(): void {
    if (!this.result || this.dialog.open) return;
    if (document.querySelector<HTMLDialogElement>('#new-game-dialog')?.open) return;
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
