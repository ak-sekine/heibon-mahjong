import type { TileKind } from '../model/tile.ts';
import type { WinningContext, YakuCandidate, WaitType } from './yaku.ts';

export type FuMode = 'standard' | 'pinfu-tsumo' | 'seven-pairs' | 'yakuman';
export type FuEntry =
  | Readonly<{ type: 'base' | 'menzen-ron' | 'tsumo' | 'pinfu-tsumo' | 'seven-pairs'; fu: number }>
  | Readonly<{ type: 'triplet'; fu: number; tile: TileKind; meldIndex: number; concealed: boolean; terminalOrHonor: boolean }>
  | Readonly<{ type: 'pair'; fu: number; tile: TileKind; dragon: boolean; seatWind: boolean; roundWind: boolean }>
  | Readonly<{ type: 'wait'; fu: number; wait: WaitType }>;
export interface FuResult {
  readonly rawFu: number | null;
  readonly fu: number | null;
  readonly fuBreakdown: readonly FuEntry[];
  readonly fuMode: FuMode;
}
/** Closed-hand fu, using the existing decomposition and winning-tile assignment. */
export function calculateFu(candidate: YakuCandidate, context: Pick<WinningContext, 'winMethod' | 'seatWind' | 'roundWind'>): FuResult {
  if (candidate.yakumanCount > 0 || candidate.shape === 'thirteen-orphans') {
    return { rawFu: null, fu: null, fuBreakdown: [], fuMode: 'yakuman' };
  }
  if (candidate.shape === 'seven-pairs') {
    return { rawFu: 25, fu: 25, fuBreakdown: [{ type: 'seven-pairs', fu: 25 }], fuMode: 'seven-pairs' };
  }
  if (context.winMethod === 'tsumo' && candidate.yaku.some(y => y.id === 'pinfu')) {
    return { rawFu: 20, fu: 20, fuBreakdown: [{ type: 'pinfu-tsumo', fu: 20 }], fuMode: 'pinfu-tsumo' };
  }
  const fuBreakdown: FuEntry[] = [{ type: 'base', fu: 20 },
    context.winMethod === 'ron' ? { type: 'menzen-ron', fu: 10 } : { type: 'tsumo', fu: 2 }];
  candidate.decomposition.melds.forEach((meld, meldIndex) => {
    if (meld.type !== 'triplet') return;
    const terminalOrHonor = meld.tile.category === 'honor' || meld.tile.rank === 1 || meld.tile.rank === 9;
    const concealed = !(context.winMethod === 'ron' && candidate.wait === 'shanpon' &&
      candidate.assignment.type === 'meld' && candidate.assignment.meldIndex === meldIndex);
    fuBreakdown.push({ type: 'triplet', tile: meld.tile, meldIndex, concealed, terminalOrHonor,
      fu: (concealed ? 4 : 2) * (terminalOrHonor ? 2 : 1) });
  });
  const tile = candidate.decomposition.pair;
  const dragon = tile.category === 'honor' && ['white', 'green', 'red'].includes(tile.honor);
  const seatWind = tile.category === 'honor' && tile.honor === context.seatWind;
  const roundWind = tile.category === 'honor' && tile.honor === context.roundWind;
  fuBreakdown.push({ type: 'pair', tile, dragon, seatWind, roundWind, fu: 2 * (Number(dragon) + Number(seatWind) + Number(roundWind)) });
  fuBreakdown.push({ type: 'wait', wait: candidate.wait, fu: ['kanchan', 'penchan', 'tanki'].includes(candidate.wait) ? 2 : 0 });
  const rawFu = fuBreakdown.reduce((sum, entry) => sum + entry.fu, 0);
  return { rawFu, fu: Math.ceil(rawFu / 10) * 10, fuBreakdown, fuMode: 'standard' };
}
