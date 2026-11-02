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
