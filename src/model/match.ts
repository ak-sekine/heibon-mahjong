import type { GameState, PlayerId } from './game.ts';
export type Points = readonly [number, number, number, number];
export interface RoundInfo {
  readonly roundNumber: number;
  readonly dealerId: PlayerId;
  readonly honba: number;
}
export interface SettlementPayment {
  readonly payerId: PlayerId;
  readonly recipientId: PlayerId;
  readonly basePoints: number;
  readonly honbaPoints: number;
  readonly notenPoints: number;
  readonly points: number;
}
export interface RoundSettlement extends RoundInfo {
  readonly reason: 'tsumo' | 'ron' | 'draw' | 'nagashi-mangan' | 'four-kans' | 'kyuushu-kyuuhai' | 'four-winds' | 'four-riichi';
  readonly before: Points;
  readonly payments: readonly SettlementPayment[];
  readonly deposits: Readonly<{ recipientId: PlayerId; points: number }> | null;
  /** Present only for nagashi mangan; no conventional win hand is created. */
  readonly nagashiManganWinners?: readonly PlayerId[];
  readonly tenpai: readonly boolean[] | null;
  readonly deltas: Points;
  readonly after: Points;
  readonly next: RoundInfo | null;
  readonly matchEnded: boolean;
}
export interface MatchState extends RoundInfo {
  readonly roundWind: 'east';
  readonly points: Points;
  readonly depositSticks: number;
  readonly game: GameState;
  readonly lastSettlement: RoundSettlement | null;
  readonly status: 'playing' | 'round-ended' | 'match-ended';
}
