import { TILE_KINDS, SUITS, RANKS, HONORS, tileKindKey } from '../model/tile.ts';
import type { Tile } from '../model/tile.ts';

export interface ShantenResult {
  readonly standard: number;
  readonly sevenPairs: number;
  readonly thirteenOrphans: number;
  readonly minimum: number;
}
const indices = new Map(TILE_KINDS.map((kind, i) => [tileKindKey(kind), i]));
const orphans = TILE_KINDS.flatMap((kind, i) => kind.category === 'honor' || kind.rank === 1 || kind.rank === 9 ? [i] : []);

export function tileCounts(tiles: readonly Tile[], size: number): number[] {
  if (!Array.isArray(tiles) || tiles.length !== size) throw new RangeError(`Expected ${size} tiles`);
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    if (!tile || (tile.isRed !== true && tile.isRed !== false) ||
      (tile.category === 'suited' ? !SUITS.includes(tile.suit) || !RANKS.includes(tile.rank) || (tile.isRed && tile.rank !== 5)
        : tile.category !== 'honor' || !HONORS.includes(tile.honor) || tile.isRed)) throw new RangeError('Invalid tile');
    const i = indices.get(tileKindKey(tile));
    if (i === undefined || ++counts[i] > 4) throw new RangeError('Invalid tile count');
  }
  return counts;
}

// Every disjoint decomposition is represented by (melds, incomplete melds, head).
// Splitting suits makes overlapping sequence/triplet alternatives inexpensive.
type Profile = readonly [number, number, number];
export class ShantenCalculator {
  private readonly hands = new Map<string, ShantenResult>();
  private readonly groups = new Map<string, readonly Profile[]>();
  get cacheSize(): number { return this.hands.size + this.groups.size; }
  private profiles(counts: number[], suited: boolean): readonly Profile[] {
    const key = `${suited ? 's' : 'h'}${counts.join('')}`;
    const cached = this.groups.get(key);
    if (cached) return cached;
    const i = counts.findIndex(n => n > 0);
    if (i < 0) return [[0, 0, 0]];
    const results = new Map<number, Profile>();
    const branch = (positions: number[], m: number, t: number, p: number) => {
      for (const j of positions) counts[j]--;
      for (const [a,b,c] of this.profiles(counts, suited)) {
        const melds = a+m, taatsu = b+t, head = c+p;
        if (melds <= 4 && taatsu <= 4 && head <= 1) results.set(melds*25+taatsu*5+head, [melds,taatsu,head]);
      }
      for (const j of positions) counts[j]++;
    };
    branch([i], 0, 0, 0);
    if (counts[i] >= 3) branch([i,i,i], 1, 0, 0);
    if (counts[i] >= 2) {
      branch([i,i], 0, 1, 0);
      branch([i,i], 0, 0, 1);
    }
    if (suited) {
      if (i <= 6 && counts[i+1] && counts[i+2]) branch([i,i+1,i+2],1,0,0);
      if (i <= 7 && counts[i+1]) branch([i,i+1],0,1,0);
      if (i <= 6 && counts[i+2]) branch([i,i+2],0,1,0);
    }
    const value = [...results.values()];
    this.groups.set(key, value);
    return value;
  }
  /** Internal count API: callers supply a valid 13-tile composition. Never mutated. */
  calculate(counts: readonly number[], openMeldCount = 0): ShantenResult {
    const key = `${openMeldCount}:${counts.join('')}`;
    const cached = this.hands.get(key);
    if (cached) return cached;
    let combined: readonly Profile[] = [[openMeldCount,0,0]];
    for (let group = 0; group < 4; group++) {
      const profiles = this.profiles(counts.slice(group*9, group === 3 ? 34 : group*9+9), group < 3);
      const next = new Map<number, Profile>();
      for (const [a,b,c] of combined) for (const [d,e,f] of profiles) {
        const m=a+d, p=c+f, t=Math.min(b+e,4-m);
        if (m<=4 && p<=1) next.set(m*25+t*5+p,[m,t,p]);
      }
      combined = [...next.values()];
    }
    const standard = Math.min(...combined.map(([m,t,p]) => 8-2*m-t-p));
    const distinct = counts.filter(n => n>0).length;
    const pairs = counts.filter(n => n>=2).length;
    const sevenPairs = openMeldCount ? Infinity : 6-pairs+Math.max(0,7-distinct);
    const thirteenOrphans = openMeldCount ? Infinity : 13-orphans.filter(i => counts[i]>0).length-(orphans.some(i=>counts[i]>=2)?1:0);
    const value = Object.freeze({standard,sevenPairs,thirteenOrphans,minimum:Math.min(standard,sevenPairs,thirteenOrphans)});
    this.hands.set(key,value);
    return value;
  }
}

export function calculateShanten(tiles: readonly Tile[], openMeldCount = 0): ShantenResult {
  if (!Number.isInteger(openMeldCount) || openMeldCount<0 || openMeldCount>4) throw new RangeError('Invalid meld count');
  return new ShantenCalculator().calculate(tileCounts(tiles,13-3*openMeldCount),openMeldCount);
}
