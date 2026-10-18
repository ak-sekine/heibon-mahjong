import { TILE_KINDS, tileKindKey } from '../model/tile.ts';
import type { Tile, TileKind } from '../model/tile.ts';
import type { SeatWind } from '../model/game.ts';
import { analyzeWinningShapes } from './winning-shape.ts';
import type { StandardDecomposition, WinningMeld } from './winning-shape.ts';

export interface WinningContext {
  readonly rinshan?: boolean;
  readonly chankan?: boolean;
  readonly winMethod: 'tsumo' | 'ron';
  readonly winningTile: TileKind;
  readonly seatWind: SeatWind;
  readonly roundWind: SeatWind;
  /** An open hand requires explicit fixed melds. */
  readonly isClosed?: boolean;
  readonly openMelds?: readonly WinningMeld[];
  readonly riichi?: boolean;
  readonly ippatsuEligible?: boolean;
  readonly doubleRiichi?: boolean;
}
export type YakuId = 'rinshan' | 'chankan' | 'sankantsu' | 'suukantsu' | 'ippatsu' | 'double-riichi' | 'riichi' | 'menzen-tsumo' | 'tanyao' | 'yakuhai-white' | 'yakuhai-green' |
  'yakuhai-red' | 'yakuhai-seat-wind' | 'yakuhai-round-wind' | 'pinfu' |
  'iipeikou' | 'ryanpeikou' | 'sanankou' | 'chiitoitsu' | 'toitoi' | 'shousangen' | 'honroutou' |
  'chanta' | 'junchan' | 'sanshoku-doukou' | 'sanshoku-doujun' | 'ittsu' | 'honitsu' | 'chinitsu' | 'kokushi-musou';
type NormalYakuId = Exclude<YakuId, 'kokushi-musou' | 'suukantsu'>;
type NormalYakuHan = 1 | 2 | 3 | 5 | 6;
export type RecognizedYaku =
  | Readonly<{ id: NormalYakuId; han: NormalYakuHan; yakuman: 0 }>
  | Readonly<{ id: 'kokushi-musou' | 'suukantsu'; han: 0; yakuman: 1 }>;
export type WaitType = 'ryanmen' | 'kanchan' | 'penchan' | 'tanki' | 'shanpon';
export type WinningTileAssignment =
  | Readonly<{ type: 'pair' }>
  | Readonly<{ type: 'meld'; meldIndex: number; tileIndex: 0 | 1 | 2 }>;
interface CandidateBase {
  readonly id: string;
  readonly yaku: readonly RecognizedYaku[];
  readonly totalHan: number;
  readonly yakumanCount: number;
}
export type YakuCandidate = CandidateBase & (
  | Readonly<{ shape: 'standard'; decompositionId: string; decomposition: StandardDecomposition;
      assignment: WinningTileAssignment; wait: WaitType }>
  | Readonly<{ shape: 'seven-pairs'; pairs: readonly TileKind[]; assignment: Readonly<{ type: 'pair'; pairIndex: number }>; wait: 'tanki' }>
  | Readonly<{ shape: 'thirteen-orphans'; duplicate: TileKind; assignment: null; wait: null }>
);
export interface YakuAnalysis {
  readonly isWinningShape: boolean;
  /** Supported subset only; this does not establish legal win eligibility. */
  readonly hasSupportedYaku: boolean;
  readonly candidates: readonly YakuCandidate[];
}
const winds: readonly SeatWind[] = ['east', 'south', 'west', 'north'];
const same = (a: TileKind, b: TileKind) => tileKindKey(a) === tileKindKey(b);
function validateContext(context: WinningContext, tiles: readonly Tile[]): void {
  if (!context || typeof context !== 'object' ||
      !['tsumo', 'ron'].includes(context.winMethod) ||
      !winds.includes(context.seatWind) || !winds.includes(context.roundWind) ||
      (['ippatsuEligible', 'doubleRiichi'] as const).some(key => context[key] !== undefined && typeof context[key] !== 'boolean') ||
      (context.riichi !== undefined && typeof context.riichi !== 'boolean') ||
      (context.isClosed !== undefined && context.isClosed !== true && !(context.isClosed === false && context.openMelds?.length))) {
    throw new RangeError('Invalid winning context; only closed hands are supported');
  }
  const kind = context.winningTile;
  if (!kind || typeof kind !== 'object' || !TILE_KINDS.some(k =>
    k.category === kind.category && (k.category === 'honor'
      ? kind.category === 'honor' && k.honor === kind.honor
      : kind.category === 'suited' && k.suit === kind.suit && k.rank === kind.rank))) {
    throw new RangeError('Invalid winning tile kind');
  }
  if (!tiles.some(t => same(t, kind))) throw new RangeError('Winning tile is not in the hand');
}
function valuePair(kind: TileKind, context: WinningContext): boolean {
  return kind.category === 'honor' &&
    (['white', 'green', 'red'].includes(kind.honor) ||
      kind.honor === context.seatWind || kind.honor === context.roundWind);
}
function meldKey(meld: WinningMeld): string {
  return meld.type === 'triplet' ? `triplet:${tileKindKey(meld.tile)}`
    : `sequence:${tileKindKey(meld.tiles[0])}`;
}
function sequenceWait(meld: Extract<WinningMeld, { type: 'sequence' }>, index: number): WaitType {
  if (index === 1) return 'kanchan';
  const first = meld.tiles[0];
  if (first.category === 'suited' && ((first.rank === 1 && index === 2) ||
      (first.rank === 7 && index === 0))) return 'penchan';
  return 'ryanmen';
}
function totals(yaku: readonly RecognizedYaku[]) {
  return { yaku, totalHan: yaku.reduce((n, y) => n + y.han, 0),
    yakumanCount: yaku.reduce((n, y) => n + y.yakuman, 0) };
}
/** Keep concealed-triplet yaku and fu aligned for each winning-tile assignment. */
export function isConcealedTriplet(meld: WinningMeld, meldIndex: number,
  assignment: WinningTileAssignment, wait: WaitType,
  context: Pick<WinningContext, 'winMethod' | 'openMelds'>): boolean {
  if (meld.type !== 'triplet') return false;
  return Boolean(meld.concealed) || meldIndex >= (context.openMelds?.length ?? 0) &&
    !(context.winMethod === 'ron' && wait === 'shanpon' &&
      assignment.type === 'meld' && assignment.meldIndex === meldIndex);
}
/** Fixed public melds precede concealed melds in every decomposition. */
export function analyzeYaku(tiles: readonly Tile[], context: WinningContext): YakuAnalysis {
  if (!context) throw new RangeError('Invalid winning context');
  const fixed = context.openMelds ?? [];
  const closed = context.isClosed !== false && fixed.every(m=>m.type==='triplet' && m.concealed);
  const shapes = analyzeWinningShapes(tiles, fixed);
  const allTiles = [...tiles, ...fixed.flatMap(m => m.type === 'triplet' ? [m.tile,m.tile,m.tile] : m.tiles)];
  validateContext(context, tiles);
  const common: RecognizedYaku[] = [];
  const add = (list: RecognizedYaku[], id: NormalYakuId, han: NormalYakuHan = 1) =>
    list.push({ id, han, yakuman: 0 });
  if (context.rinshan && context.winMethod==='tsumo') add(common,'rinshan');
  if (context.chankan && context.winMethod==='ron') add(common,'chankan');
  const kans=fixed.filter(m=>m.type==='triplet' && m.kan).length;
  if(kans===3) add(common,'sankantsu',2);
  if (closed && context.riichi) {
    add(common, context.doubleRiichi ? 'double-riichi' : 'riichi', context.doubleRiichi ? 2 : 1);
    if (context.ippatsuEligible) add(common, 'ippatsu');
  }
  if (closed && context.winMethod === 'tsumo') add(common, 'menzen-tsumo');
  if (allTiles.every(t => t.category === 'suited' && t.rank >= 2 && t.rank <= 8)) add(common, 'tanyao');
  if (allTiles.every(t => t.category === 'honor' || t.rank === 1 || t.rank === 9)) add(common, 'honroutou', 2);
  const suits = new Set(allTiles.flatMap(tile => tile.category === 'suited' ? [tile.suit] : []));
  const hasHonors = allTiles.some(tile => tile.category === 'honor');
  if (suits.size === 1 && hasHonors) add(common, 'honitsu', closed ? 3 : 2);
  else if (suits.size === 1) add(common, 'chinitsu', closed ? 6 : 5);
  const candidates: YakuCandidate[] = [];
  for (const decomposition of shapes.standard.decompositions) {
    const { pair, melds } = decomposition;
    const decompositionId = `${tileKindKey(pair)}|${melds.map(meldKey).join('|')}`;
    const base = [...common];
    for (const meld of melds) {
      if (meld.type !== 'triplet' || meld.tile.category !== 'honor') continue;
      const honor = meld.tile.honor;
      if (honor === 'white') add(base, 'yakuhai-white');
      if (honor === 'green') add(base, 'yakuhai-green');
      if (honor === 'red') add(base, 'yakuhai-red');
      if (honor === context.seatWind) add(base, 'yakuhai-seat-wind');
      if (honor === context.roundWind) add(base, 'yakuhai-round-wind');
    }
    const sequenceMelds = melds.filter((m): m is Extract<WinningMeld, { type: 'sequence' }> => m.type === 'sequence');
    const sequenceStarts = new Set(sequenceMelds.flatMap(m => {
      const start = m.tiles[0];
      return start.category === 'suited' ? [`${start.suit}:${start.rank}`] : [];
    }));
    const sanshoku = Array.from({ length: 7 }, (_, index) => index + 1).some(rank =>
      (['man', 'pin', 'sou'] as const).every(suit => sequenceStarts.has(`${suit}:${rank}`)));
    const ittsu = (['man', 'pin', 'sou'] as const).some(suit => [1, 4, 7].every(rank => sequenceStarts.has(`${suit}:${rank}`)));
    if (sanshoku) add(base, 'sanshoku-doujun', closed ? 2 : 1);
    if (ittsu) add(base, 'ittsu', closed ? 2 : 1);
    const sequenceCounts = new Map<string, number>();
    for (const meld of sequenceMelds) {
      const key = meldKey(meld);
      sequenceCounts.set(key, (sequenceCounts.get(key) ?? 0) + 1);
    }
    const iipeikou = [...sequenceCounts.values()].some(count => count >= 2);
    const ryanpeikou = closed && sequenceMelds.length === 4 &&
      [...sequenceCounts.values()].reduce((pairs, count) => pairs + Math.floor(count / 2), 0) >= 2;
    const toitoi = melds.every(m => m.type === 'triplet');
    const dragonNames = new Set<string>(['white', 'green', 'red']);
    const dragonTriplets = new Set(melds.flatMap(m => m.type === 'triplet' && m.tile.category === 'honor' &&
      dragonNames.has(m.tile.honor) ? [m.tile.honor] : []));
    const shousangen = dragonTriplets.size === 2 && pair.category === 'honor' &&
      dragonNames.has(pair.honor) && !dragonTriplets.has(pair.honor);
    if (shousangen) add(base, 'shousangen', 2);

    const hasSequence = sequenceMelds.length > 0;
    const pairHasTerminalOrHonor = pair.category === 'honor' || pair.rank === 1 || pair.rank === 9;
    const meldsHaveTerminals = melds.every(m => m.type === 'sequence'
      ? m.tiles[0].category === 'suited' && [1, 7].includes(m.tiles[0].rank)
      : m.tile.category === 'honor' || m.tile.rank === 1 || m.tile.rank === 9);
    if (hasSequence && pairHasTerminalOrHonor && meldsHaveTerminals) {
      if (allTiles.every(t => t.category === 'suited')) add(base, 'junchan', closed ? 3 : 2);
      else if (allTiles.some(t => t.category === 'honor')) add(base, 'chanta', closed ? 2 : 1);
    }

    const tripletRanks = new Map<string, Set<number>>();
    for (const meld of melds) {
      if (meld.type !== 'triplet' || meld.tile.category !== 'suited') continue;
      const ranks = tripletRanks.get(meld.tile.suit) ?? new Set<number>();
      ranks.add(meld.tile.rank);
      tripletRanks.set(meld.tile.suit, ranks);
    }
    const sanshokuDoukou = [...(tripletRanks.get('man') ?? [])].some(rank =>
      tripletRanks.get('pin')?.has(rank) && tripletRanks.get('sou')?.has(rank));
    if (sanshokuDoukou) add(base, 'sanshoku-doukou', 2);

    const emit = (assignment: WinningTileAssignment, wait: WaitType, position: string) => {
      const yaku: RecognizedYaku[] = kans===4 ? [{id:'suukantsu',han:0,yakuman:1}] : [...base];
      if (closed && melds.every(m => m.type === 'sequence') && !valuePair(pair, context) && wait === 'ryanmen') add(yaku, 'pinfu');
      if (kans!==4 && ryanpeikou) add(yaku, 'ryanpeikou', 3);
      else if (kans!==4 && closed && iipeikou) add(yaku, 'iipeikou');
      if (kans !== 4 && melds.filter((meld, meldIndex) => meld.type === 'triplet' &&
        isConcealedTriplet(meld, meldIndex, assignment, wait, context)).length >= 3) add(yaku, 'sanankou', 2);
      if (kans!==4 && toitoi) add(yaku, 'toitoi', 2);
      candidates.push({ shape: 'standard', id: `standard:${decompositionId}:${position}`,
        decompositionId, decomposition, assignment, wait, ...totals(yaku) });
    };
    if (same(pair, context.winningTile)) emit({ type: 'pair' }, 'tanki', 'pair');
    // Equal melds are symmetric. Keep the first canonical index, without duplicate candidates.
    const seen = new Set<string>();
    melds.forEach((meld, meldIndex) => {
      const key = meldKey(meld);
      if (meldIndex < fixed.length) return;
      if (seen.has(key)) return;
      seen.add(key);
      if (meld.type === 'triplet') {
        if (same(meld.tile, context.winningTile)) emit({ type: 'meld', meldIndex, tileIndex: 0 }, 'shanpon', `meld:${meldIndex}:0`);
      } else {
        const index = meld.tiles.findIndex(k => same(k, context.winningTile));
        if (index !== -1) emit({ type: 'meld', meldIndex, tileIndex: index as 0 | 1 | 2 }, sequenceWait(meld, index), `meld:${meldIndex}:${index}`);
      }
    });
  }
  if (shapes.sevenPairs.isWinning) {
    const yaku = [...common];
    add(yaku, 'chiitoitsu', 2);
    candidates.push({ shape: 'seven-pairs', id: 'seven-pairs', pairs: shapes.sevenPairs.pairs,
      assignment: { type: 'pair', pairIndex: shapes.sevenPairs.pairs.findIndex(k => same(k, context.winningTile)) },
      wait: 'tanki', ...totals(yaku) });
  }
  if (shapes.thirteenOrphans.isWinning) candidates.push({ shape: 'thirteen-orphans', id: 'thirteen-orphans',
    duplicate: shapes.thirteenOrphans.duplicate, assignment: null, wait: null,
    ...totals([{ id: 'kokushi-musou', han: 0, yakuman: 1 }]) });
  return { isWinningShape: shapes.isWinning, hasSupportedYaku: candidates.some(c => c.yaku.length > 0), candidates };
}
