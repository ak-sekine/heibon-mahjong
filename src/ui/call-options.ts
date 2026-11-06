import type { CallOption } from '../game/calls.ts';
import { tileKindKey } from '../model/tile.ts';

/** Display equivalence only: retain a real option and its executable physical IDs.
 * Rules and CPU arbitration continue to enumerate every physical combination. */
export function uniqueCallOptions(options: readonly CallOption[]): readonly CallOption[] {
  return uniqueCallOptionsByDisplay(options, option => JSON.stringify([option.type, option.playerId, option.fromPlayerId]));
}

/** Keep the first executable option for each visible label and tile-face combination. */
export function uniqueCallOptionsByDisplay<T extends Readonly<{
  tiles: readonly Readonly<{ tile: CallOption['tiles'][number]['tile'] }>[];
}>>(
  options: readonly T[],
  displayLabel: (option: T) => string,
): readonly T[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const faces = option.tiles.map(t => `${tileKindKey(t.tile)}:${t.tile.isRed}`).sort();
    const key = JSON.stringify([displayLabel(option), faces]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
