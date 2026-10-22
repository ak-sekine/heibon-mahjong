import type { YakuId } from '../analysis/yaku.ts';
import { yakuDisplayName } from './yaku-names.ts';

export type RoundWinSummary = Readonly<{
  winnerName: string;
  method: 'ron' | 'tsumo';
  han: number;
  fu: number | null;
  yakumanCount: number;
  points: number;
  yaku: readonly YakuId[];
}>;

function text(tag: string, content: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

/** Render the compact, shared local and online winning-result summary. */
export function renderRoundWinSummary(container: HTMLElement, winners: readonly RoundWinSummary[]): void {
  for (const winner of winners) {
    const section = document.createElement('section');
    section.className = 'round-win-summary';

    const scoreLabel = winner.yakumanCount > 0
      ? `${winner.yakumanCount}役満`
      : `${winner.han}翻${winner.fu === null ? '' : ` ${winner.fu}符`}`;
    const resultLine = text('p', '', 'round-summary-winner');
    resultLine.append(
      text('span', `${winner.winnerName} ${winner.method === 'tsumo' ? 'ツモ' : 'ロン'}・`),
      text('span', scoreLabel, 'round-summary-value'),
      text('span', '・'),
      text('span', `${winner.points.toLocaleString('ja-JP')}点`, 'round-summary-points'),
    );
    section.append(resultLine);
    section.append(text('p', winner.yaku.map(yakuDisplayName).join('・'), 'round-summary-yaku'));
    container.append(section);
  }
}
