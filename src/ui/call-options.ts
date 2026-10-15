import type { CallOption } from '../game/calls.ts';
import { tileKindKey } from '../model/tile.ts';

/** Display equivalence only: retain a real option and its executable physical IDs.
 * Rules and CPU arbitration continue to enumerate every physical combination. */
export function uniqueCallOptions(options: readonly CallOption[]): readonly CallOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const faces = option.tiles.map(t => `${tileKindKey(t.tile)}:${t.tile.isRed}`).sort();
    const key = JSON.stringify([option.type, option.playerId, option.fromPlayerId, faces]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
