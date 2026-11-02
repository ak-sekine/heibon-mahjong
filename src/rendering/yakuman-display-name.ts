import type { ScoreTier } from '../analysis/score.ts';

/** Return the user-facing label for a yakuman multiplier. */
export function yakumanMultiplierName(multiplier: number): string {
  switch (multiplier) {
    case 1: return '役満';
    case 2: return 'ダブル役満';
    case 3: return 'トリプル役満';
    case 4: return '4倍役満';
    default: return `${multiplier}倍役満`;
  }
}

/** Return the user-facing name for a calculated score tier. */
export function scoreTierDisplayName(scoreTier: ScoreTier, yakumanCount: number): string {
  if (yakumanCount > 0) return yakumanMultiplierName(yakumanCount);
  switch (scoreTier) {
    case 'normal': return '';
    case 'mangan': return '満貫';
    case 'haneman': return '跳満';
    case 'baiman': return '倍満';
    case 'sanbaiman': return '三倍満';
    case 'kazoe-yakuman': return '数え役満';
    case 'yakuman': return '役満';
  }
}

/** Return the final total line shared by offline, CPU, and online result details. */
export function winTotalLabel(yakumanCount: number, totalHanIncludingDora: number, fixedMangan = false): string {
  return fixedMangan ? '合計：満貫' : yakumanCount > 0
    ? `合計：${yakumanMultiplierName(yakumanCount)}`
    : `合計：${totalHanIncludingDora}翻`;
}
