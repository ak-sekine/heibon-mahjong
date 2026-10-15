import { TILE_KINDS, SUITS, RANKS, HONORS, tileKindKey } from '../model/tile.ts';
import type { Tile, TileKind } from '../model/tile.ts';

export type WinningMeld =
  | Readonly<{ type: 'sequence'; tiles: readonly [TileKind, TileKind, TileKind] }>
  | Readonly<{ type: 'triplet'; tile: TileKind }>;
export interface StandardDecomposition {
  readonly pair: TileKind;
  readonly melds: readonly [WinningMeld, WinningMeld, WinningMeld, WinningMeld];
}
export type SevenPairsResult =
  | Readonly<{ isWinning: false; pairs: null }>
  | Readonly<{ isWinning: true; pairs: readonly [TileKind, TileKind, TileKind, TileKind, TileKind, TileKind, TileKind] }>;
export type ThirteenOrphansResult =
  | Readonly<{ isWinning: false; duplicate: null }>
  | Readonly<{ isWinning: true; duplicate: TileKind }>;
export interface WinningShapeAnalysis {
  readonly isWinning: boolean;
  readonly standard: Readonly<{ isWinning: boolean; decompositions: readonly StandardDecomposition[] }>;
  readonly sevenPairs: SevenPairsResult;
  readonly thirteenOrphans: ThirteenOrphansResult;
}

const kindIndices = new Map(TILE_KINDS.map((kind, index) => [tileKindKey(kind), index]));
const orphanIndices = TILE_KINDS.flatMap((kind, index) =>
  kind.category === 'honor' || kind.rank === 1 || kind.rank === 9 ? [index] : []);

/** Runtime validation also protects callers using JavaScript or unchecked casts. */
function countsOf(tiles: readonly Tile[], size = 14): number[] {
  if (!Array.isArray(tiles) || tiles.length !== size) {
    throw new RangeError('Winning shape analysis requires exactly 14 tiles');
  }
  const counts = Array<number>(TILE_KINDS.length).fill(0);
  for (const tile of tiles) {
    if (!tile || typeof tile !== 'object' ||
      (tile.category !== 'suited' && tile.category !== 'honor') ||
      (tile.isRed !== true && tile.isRed !== false)) {
      throw new RangeError('Invalid tile');
    }
    if (tile.category === 'suited') {
      if (!SUITS.includes(tile.suit) || !RANKS.includes(tile.rank) ||
        (tile.isRed && tile.rank !== 5)) throw new RangeError('Invalid suited tile');
    } else if (!HONORS.includes(tile.honor) || tile.isRed) {
      throw new RangeError('Invalid honor tile');
    }
    const index = kindIndices.get(tileKindKey(tile));
    if (index === undefined) throw new RangeError('Unknown tile kind');
    if (++counts[index] > 4) throw new RangeError('A tile kind cannot occur more than four times');
  }
  return counts;
}

function meldKey(meld: WinningMeld): string {
  const kind = meld.type === 'sequence' ? meld.tiles[0] : meld.tile;
  return `${String(kindIndices.get(tileKindKey(kind))).padStart(2, '0')}:${meld.type}`;
}

function standardDecompositions(counts: number[], fixed: readonly WinningMeld[] = []): StandardDecomposition[] {
  const results = new Map<string, StandardDecomposition>();
  const melds: WinningMeld[] = [...fixed];
  function search(pairIndex: number): void {
    const index = counts.findIndex(count => count > 0);
    if (index === -1) {
      if (melds.length !== 4) return;
      const ordered = [...fixed, ...melds.slice(fixed.length).sort((a, b) => meldKey(a).localeCompare(meldKey(b)))];
      const key = `${String(pairIndex).padStart(2, '0')}|${ordered.map(meldKey).join('|')}`;
      results.set(key, {
        pair: TILE_KINDS[pairIndex],
        melds: ordered as unknown as StandardDecomposition['melds'],
      });
      return;
    }
    if (melds.length >= 4) return;
    const kind = TILE_KINDS[index];
    // The smallest remaining kind must be in a triplet or start a sequence.
    if (counts[index] >= 3) {
      counts[index] -= 3;
      melds.push({ type: 'triplet', tile: kind });
      search(pairIndex);
      melds.pop();
      counts[index] += 3;
    }
    if (kind.category === 'suited' && kind.rank <= 7) {
      const second = kindIndices.get(tileKindKey({ ...kind, rank: (kind.rank + 1) as typeof kind.rank }))!;
      const third = kindIndices.get(tileKindKey({ ...kind, rank: (kind.rank + 2) as typeof kind.rank }))!;
      if (counts[second] > 0 && counts[third] > 0) {
        counts[index]--; counts[second]--; counts[third]--;
        melds.push({ type: 'sequence', tiles: [kind, TILE_KINDS[second], TILE_KINDS[third]] });
        search(pairIndex);
        melds.pop();
        counts[index]++; counts[second]++; counts[third]++;
      }
    }
  }
  for (let pair = 0; pair < counts.length; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    search(pair);
    counts[pair] += 2;
  }
  return [...results.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, result]) => result);
}

/** Shape validity only: no yaku, scoring, winning-tile provenance or game state. */
export function analyzeWinningShapes(tiles: readonly Tile[], fixed: readonly WinningMeld[] = []): WinningShapeAnalysis {
  if (fixed.length > 4) throw new RangeError('Too many melds');
  const counts = countsOf(tiles, 14 - fixed.length * 3);
  countsOf([...tiles, ...fixed.flatMap(m => m.type === 'triplet' ? [m.tile,m.tile,m.tile].map(k => ({...k,isRed:false} as Tile)) : m.tiles.map(k => ({...k,isRed:false} as Tile)))]);
  const decompositions = standardDecompositions(counts, fixed);
  const pairs = TILE_KINDS.filter((_, index) => counts[index] === 2);
  const sevenPairs: SevenPairsResult = fixed.length === 0 && pairs.length === 7
    ? { isWinning: true, pairs: pairs as unknown as Extract<SevenPairsResult, { isWinning: true }>['pairs'] }
    : { isWinning: false, pairs: null };
  const orphansWin = fixed.length === 0 && orphanIndices.every(index => counts[index] >= 1) &&
    counts.every((count, index) => count === 0 || orphanIndices.includes(index));
  const thirteenOrphans: ThirteenOrphansResult = orphansWin
    ? { isWinning: true, duplicate: TILE_KINDS[orphanIndices.find(index => counts[index] === 2)!] }
    : { isWinning: false, duplicate: null };
  return {
    isWinning: decompositions.length > 0 || sevenPairs.isWinning || thirteenOrphans.isWinning,
    standard: { isWinning: decompositions.length > 0, decompositions },
    sevenPairs,
    thirteenOrphans,
  };
}

export function isWinningShape(tiles: readonly Tile[], fixed: readonly WinningMeld[] = []): boolean {
  return analyzeWinningShapes(tiles, fixed).isWinning;
}
