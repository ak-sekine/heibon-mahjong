import { HONORS, RANKS, SUITS, type Tile } from '../model/tile.ts';

/** Count face-only bonuses without changing tiles or evaluating winning shapes/yaku.
 * Any length is accepted; invalid faces and multiple red fives of one suit throw.
 * Physical identity must be validated by the caller before discarding IDs.
 */
export function countRedDora(tiles: readonly Tile[]): number {
  if (!Array.isArray(tiles)) throw new RangeError('Expected a tile array');
  const redSuits = new Set<string>();
  for (const tile of tiles) {
    if (!tile || typeof tile !== 'object' || typeof tile.isRed !== 'boolean') {
      throw new RangeError('Invalid tile');
    }
    if (tile.category === 'suited') {
      if (!SUITS.includes(tile.suit) || !RANKS.includes(tile.rank) || (tile.isRed && tile.rank !== 5)) {
        throw new RangeError('Invalid suited tile');
      }
      if (tile.isRed) {
        if (redSuits.has(tile.suit)) throw new RangeError('Only one red five per suit is allowed');
        redSuits.add(tile.suit);
      }
    } else if (tile.category !== 'honor' || !HONORS.includes(tile.honor) || tile.isRed) {
      throw new RangeError('Invalid honor tile');
    }
  }
  return redSuits.size;
}
