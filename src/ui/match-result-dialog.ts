import { rankPlayers } from '../game/match.ts';
import type { MatchState, MatchFormat } from '../model/match.ts';
import type { PlayerGameView } from '../online/game-view.ts';

type Standing = Readonly<{ rank: number; name: string; points: number }>;
type MatchResult = Readonly<{ format: MatchFormat; standings: readonly Standing[] }>;

/** Renders the finalized standings without changing or advancing either game mode. */
export class MatchResultDialog {
  private result: MatchResult | null = null;
  private key: string | null = null;
  private reopen: HTMLButtonElement | null = null;
  private mode: 'local' | 'online' = 'local';
  private onlineRematch: (() => void) | null = null;
  private readonly dialog = document.querySelector<HTMLDialogElement>('#match-result-dialog')!;
  private readonly body = document.querySelector<HTMLElement>('#match-result-body')!;
  private readonly closeButton = document.querySelector<HTMLButtonElement>('#match-result-close')!;
  private readonly newGameButton = document.querySelector<HTMLButtonElement>('#match-result-new-game')!;

  constructor() {
    this.closeButton.addEventListener('click', () => this.close());
    this.newGameButton.addEventListener('click', () => {
      if (!this.result) return;
      this.close();
      if (this.mode === 'local') document.querySelector<HTMLButtonElement>('#new-game')!.click();
      else this.onlineRematch?.();
    });
    this.dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('result-open');
      this.reopen?.focus({ preventScroll: true });
    });
  }

  updateLocal(match: MatchState, names: readonly string[]): void {
    this.mode = 'local';
    if (match.status !== 'match-ended' || !match.lastSettlement?.matchEnded) {
      this.newGameButton.hidden = true;
      this.setResult(null);
      return;
    }
    this.newGameButton.hidden = false;
    this.newGameButton.textContent = '次の対局を始める';
    const standings = rankPlayers(match).map(player => ({
      rank: player.rank,
      name: names[player.playerId] ?? `プレイヤー${player.playerId + 1}`,
      points: player.points,
    }));
    this.setResult({ format: match.format ?? 'tonpu', standings });
  }

  clear(): void {
    this.setResult(null);
  }

  updateOnline(view: PlayerGameView | null): void {
    this.mode = 'online';
    if (!view || view.status !== 'match-ended' || !view.result?.matchEnded) {
      this.newGameButton.hidden = true;
      this.setResult(null);
      return;
    }
    this.newGameButton.hidden = this.onlineRematch === null;
    this.newGameButton.textContent = '新しい対局を始める';
    const standings = [...view.seats]
      .sort((a, b) => b.points - a.points || a.seat - b.seat)
      .map((seat, index) => ({ rank: index + 1, name: seat.name, points: seat.points }));
    this.setResult({ format: view.format, standings });
  }

  setOnlineRematchHandler(handler: (() => void) | null): void { this.onlineRematch = handler; }

  open(button?: HTMLButtonElement | null): void {
    if (!this.result || this.dialog.open || document.querySelector<HTMLDialogElement>('#new-game-dialog')?.open) return;
    this.reopen = button ?? document.querySelector<HTMLButtonElement>('#show-match-result');
    this.dialog.showModal();
    this.body.scrollTop = 0;
    document.documentElement.classList.add('result-open');
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
    document.documentElement.classList.remove('result-open');
  }

  private setResult(result: MatchResult | null): void {
    const key = result ? JSON.stringify(result) : null;
    if (key === this.key) return;
    this.key = key;
    this.result = result;
    if (!result) {
      this.body.replaceChildren();
      if (this.dialog.open) this.close();
      return;
    }

    const format = document.createElement('p');
    format.className = 'match-result-format';
    format.textContent = result.format === 'tonnan' ? '半荘戦' : '東風戦';
    const list = document.createElement('ol');
    list.className = 'match-result-standings';
    list.setAttribute('aria-label', '最終順位');
    for (const standing of result.standings) {
      const row = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'match-result-rank';
      rank.textContent = `${standing.rank}位`;
      const name = document.createElement('span');
      name.className = 'match-result-name';
      name.textContent = standing.name;
      const points = document.createElement('span');
      points.className = 'match-result-points';
      points.textContent = `${standing.points.toLocaleString('ja-JP')}点`;
      row.append(rank, name, points);
      list.append(row);
    }
    this.body.replaceChildren(format, list);
  }
}
