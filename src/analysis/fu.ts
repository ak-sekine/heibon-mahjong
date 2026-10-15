import type { TileKind } from '../model/tile.ts';
import type { WinningContext, YakuCandidate, WaitType } from './yaku.ts';

export type FuMode = 'standard' | 'pinfu-tsumo' | 'seven-pairs' | 'yakuman';
export type FuEntry =
  | Readonly<{ type: 'base' | 'menzen-ron' | 'tsumo' | 'pinfu-tsumo' | 'seven-pairs' | 'open-ron-minimum'; fu: number }>
  | Readonly<{ type: 'triplet' | 'kan'; fu: number; tile: TileKind; meldIndex: number; concealed: boolean; terminalOrHonor: boolean }>
  | Readonly<{ type: 'pair'; fu: number; tile: TileKind; dragon: boolean; seatWind: boolean; roundWind: boolean }>
  | Readonly<{ type: 'wait'; fu: number; wait: WaitType }>;
export interface FuResult {
  readonly rawFu: number | null;
  readonly fu: number | null;
  readonly fuBreakdown: readonly FuEntry[];
  readonly fuMode: FuMode;
}
/** Public meld indices stay fixed; only concealed melds can receive the win tile. */
export function calculateFu(candidate: YakuCandidate, context: Pick<WinningContext, 'winMethod' | 'seatWind' | 'roundWind' | 'isClosed' | 'openMelds'>): FuResult {
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
    ...(context.winMethod === 'ron' ? (context.isClosed === false ? [] : [{ type: 'menzen-ron' as const, fu: 10 }]) : [{ type: 'tsumo' as const, fu: 2 }])];
  candidate.decomposition.melds.forEach((meld, meldIndex) => {
    if (meld.type !== 'triplet') return;
    const terminalOrHonor = meld.tile.category === 'honor' || meld.tile.rank === 1 || meld.tile.rank === 9;
    const concealed = Boolean(meld.concealed) || meldIndex >= (context.openMelds?.length ?? 0) && !(context.winMethod === 'ron' && candidate.wait === 'shanpon' &&
      candidate.assignment.type === 'meld' && candidate.assignment.meldIndex === meldIndex);
    fuBreakdown.push({ type: meld.kan ? 'kan' : 'triplet', tile: meld.tile, meldIndex, concealed, terminalOrHonor,
      fu: (meld.kan ? 4 : 1) * (concealed ? 4 : 2) * (terminalOrHonor ? 2 : 1) });
  });
  const tile = candidate.decomposition.pair;
  const dragon = tile.category === 'honor' && ['white', 'green', 'red'].includes(tile.honor);
  const seatWind = tile.category === 'honor' && tile.honor === context.seatWind;
  const roundWind = tile.category === 'honor' && tile.honor === context.roundWind;
  fuBreakdown.push({ type: 'pair', tile, dragon, seatWind, roundWind, fu: 2 * (Number(dragon) + Number(seatWind) + Number(roundWind)) });
  fuBreakdown.push({ type: 'wait', wait: candidate.wait, fu: ['kanchan', 'penchan', 'tanki'].includes(candidate.wait) ? 2 : 0 });
  if (context.isClosed === false && context.winMethod === 'ron' && fuBreakdown.reduce((n,e) => n+e.fu,0) === 20) fuBreakdown.push({type:'open-ron-minimum',fu:10});
  const rawFu = fuBreakdown.reduce((sum, entry) => sum + entry.fu, 0);
  return { rawFu, fu: Math.ceil(rawFu / 10) * 10, fuBreakdown, fuMode: 'standard' };
}
