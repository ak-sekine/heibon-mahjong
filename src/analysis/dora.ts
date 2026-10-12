import { HONORS, RANKS, SUITS, tileKindKey, type Tile, type TileKind, type Rank } from '../model/tile.ts';

/** Winds and dragons have separate cycles; red status never changes the kind. */
export function doraKindFromIndicator(indicator: Tile): TileKind {
  countRedDora([indicator]);
  if (indicator.category === 'suited') return {
    category: 'suited', suit: indicator.suit, rank: (indicator.rank % 9 + 1) as Rank,
  };
  const cycle = indicator.honor === 'white' || indicator.honor === 'green' || indicator.honor === 'red'
    ? HONORS.slice(4) : HONORS.slice(0, 4);
  return { category: 'honor', honor: cycle[(cycle.indexOf(indicator.honor) + 1) % cycle.length] };
}

/** Each array entry denotes a distinct exposed indicator, including equal faces.
 * Tile is a face-only API: physical indicator uniqueness belongs to the game layer.
 */
export function countDora(tiles: readonly Tile[], indicators: readonly Tile[]): number {
  countRedDora(tiles);
  countRedDora(indicators);
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    const key = tileKindKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return indicators.reduce((total, indicator) =>
    total + (counts.get(tileKindKey(doraKindFromIndicator(indicator))) ?? 0), 0);
}

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
