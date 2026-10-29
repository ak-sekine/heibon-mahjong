import type { GameState, PlayerId } from './game.ts';
import type { GameRules } from './rules.ts';
export type MatchFormat = 'tonpu' | 'tonnan';
export const MATCH_FORMATS = { TONPU: 'tonpu', TONNAN: 'tonnan' } as const;
export function matchFormatLabel(format: MatchFormat): string { return format === 'tonnan' ? '半荘戦' : '東風戦'; }
export type RoundWind = 'east' | 'south';
export type Points = readonly [number, number, number, number];
export interface RoundInfo {
  readonly roundWind: RoundWind;
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
  readonly format: MatchFormat;
  readonly reason: 'tsumo' | 'ron' | 'draw' | 'nagashi-mangan' | 'four-kans' | 'kyuushu-kyuuhai' | 'four-winds' | 'four-riichi';
  readonly before: Points;
  readonly payments: readonly SettlementPayment[];
  readonly deposits: Readonly<{ recipientId: PlayerId; points: number }> | null;
  readonly nagashiManganWinners?: readonly PlayerId[];
  readonly tenpai: readonly boolean[] | null;
  readonly deltas: Points;
  readonly after: Points;
  readonly next: RoundInfo | null;
  readonly matchEnded: boolean;
}
export interface MatchState extends RoundInfo {
  /** Confirmed at match creation; absent only in legacy states. Never read from preferences. */
  readonly rules?: GameRules;
  /** Missing in persisted legacy data; callers treat it as tonpu. */
  readonly format?: MatchFormat;
  readonly points: Points;
  readonly depositSticks: number;
  readonly game: GameState;
  readonly lastSettlement: RoundSettlement | null;
  readonly status: 'playing' | 'round-ended' | 'match-ended';
}
