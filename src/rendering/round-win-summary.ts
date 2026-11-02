import type { YakuId } from '../analysis/yaku.ts';
import type { ScoreTier } from '../analysis/score.ts';
import { yakuDisplayName } from './yaku-names.ts';
import { scoreTierDisplayName, yakumanMultiplierName } from './yakuman-display-name.ts';

export type RoundWinSummary = Readonly<{
  winnerName: string;
  method: 'ron' | 'tsumo';
  han: number;
  fu: number | null;
  scoreTier: ScoreTier;
  yakumanCount: number;
  points: number;
  yaku: readonly (YakuId | Readonly<{ id: YakuId; yakuman: number }>)[];
  doraCounts: Readonly<{ normal: number; ura: number; red: number }>;
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

    const tierName = scoreTierDisplayName(winner.scoreTier, winner.yakumanCount);
    const scoreLabel = winner.yakumanCount > 0 || winner.scoreTier === 'kazoe-yakuman'
      ? tierName
      : winner.scoreTier === 'normal'
        ? `${winner.han}翻${winner.fu === null ? '' : ` ${winner.fu}符`}`
        : `${winner.han}翻 ${tierName}`;
    const resultLine = text('p', '', 'round-summary-winner');
    resultLine.append(
      text('span', `${winner.winnerName} ${winner.method === 'tsumo' ? 'ツモ' : 'ロン'}・`),
      text('span', scoreLabel, 'round-summary-value'),
      text('span', '・'),
      text('span', `${winner.points.toLocaleString('ja-JP')}点`, 'round-summary-points'),
    );
    section.append(resultLine);
    const yaku = winner.yaku.map(entry => {
      if (typeof entry === 'string') return yakuDisplayName(entry);
      const name = yakuDisplayName(entry.id);
      return entry.yakuman > 0 ? `${name} ${yakumanMultiplierName(entry.yakuman)}` : name;
    }).join('・');
    const doraCount = winner.doraCounts.normal + winner.doraCounts.ura + winner.doraCounts.red;
    const yakuAndDora = doraCount > 0 ? `${yaku}${yaku ? '・' : ''}ドラ${doraCount}` : yaku;
    section.append(text('p', yakuAndDora, 'round-summary-yaku'));
    container.append(section);
  }
}
