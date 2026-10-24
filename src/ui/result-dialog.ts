import type { MatchState } from '../model/match.ts';
import type { PlayerGameView } from '../online/game-view.ts';
import { onlineResultTitle, renderOnlineResultContent } from '../online/result-content.ts';

/** Visibility belongs to the UI; opening never advances or settles the game. */
export class ResultDialog {
  private result: MatchState['lastSettlement'] = null;
  private resultAvailable = false;
  private mode: 'local' | 'online' = 'local';
  private onlineKey: string | null = null;
  private readonly dialog = document.querySelector<HTMLDialogElement>('#result-dialog')!;
  private readonly localReopen = document.querySelector<HTMLButtonElement>('#show-result')!;
  private readonly onlineContent = document.querySelector<HTMLElement>('#online-result-content')!;
  private readonly title = document.querySelector<HTMLElement>('#result-title')!;
  private readonly body = document.querySelector<HTMLElement>('#result-body')!;
  private readonly newGame = document.querySelector<HTMLButtonElement>('#result-new-game')!;
  private reopen = this.localReopen;
  constructor() {
    document.querySelector('#view-table')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('result-open');
      if (this.resultAvailable) this.reopen.focus({ preventScroll: true });
    });
  }
  update(match: MatchState): void {
    const result = match.lastSettlement;
    const sourceChanged = this.mode !== 'local';
    this.mode = 'local';
    if (sourceChanged) {
      this.onlineKey = null;
      this.onlineContent.replaceChildren();
    }
    this.onlineContent.hidden = true;
    this.newGame.hidden = match.status !== 'match-ended';
    if (!sourceChanged && result === this.result) return;
    this.result = result;
    this.resultAvailable = result !== null;
    if (!result) { this.close(); return; }
    const abortiveNames = {
      'four-kans': '四開槓',
      'kyuushu-kyuuhai': '九種九牌',
      'four-winds': '四風連打',
      'four-riichi': '四家立直',
    } as const;
    this.title.textContent = match.status === 'match-ended' ? `${match.format === 'tonnan' ? '半荘戦' : '東風戦'}終了`
      : result.reason === 'nagashi-mangan' ? '流し満貫'
        : result.reason in abortiveNames ? `途中流局（${abortiveNames[result.reason as keyof typeof abortiveNames]}）`
          : result.reason === 'draw' ? '荒牌流局'
            : match.game.winResult?.winMethod === 'ron' ? 'ロン和了' : 'ツモ和了';
    this.body.scrollTop = 0;
  }
  updateOnline(view: PlayerGameView | null): void {
    const sourceChanged = this.mode !== 'online';
    this.mode = 'online';
    if (sourceChanged) this.onlineKey = null;
    this.newGame.hidden = true;
    if (!view?.result) {
      this.onlineKey = null;
      this.resultAvailable = false;
      this.onlineContent.hidden = true;
      this.onlineContent.replaceChildren();
      if (this.dialog.open) this.close();
      return;
    }
    const key = `${view.roomCode}:${view.status}:${JSON.stringify(view.result)}`;
    if (key === this.onlineKey) return;
    this.onlineKey = key;
    this.resultAvailable = true;
    this.title.textContent = onlineResultTitle(view);
    renderOnlineResultContent(this.onlineContent, view);
    this.body.scrollTop = 0;
  }
  open(reopenButton?: HTMLButtonElement | null): void {
    if (!this.resultAvailable || this.dialog.open) return;
    if (document.querySelector<HTMLDialogElement>('#new-game-dialog')?.open) return;
    this.reopen = reopenButton ?? this.localReopen;
    this.dialog.showModal();
    document.documentElement.classList.add('result-open');
    document.querySelector<HTMLButtonElement>('#view-table')!.focus({ preventScroll: true });
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
    document.documentElement.classList.remove('result-open');
    if (this.resultAvailable) this.reopen.focus({ preventScroll: true });
  }
}
