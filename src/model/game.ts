import type { FuResult } from '../analysis/fu.ts';
import type { ScoreResult } from '../analysis/score.ts';
import type { YakuAnalysis, YakuCandidate } from '../analysis/yaku.ts';
import type { Tile } from './tile.ts';

/** Identity is unique within one game; tile describes its face only. */
export type PhysicalTile = Readonly<{ id: string; tile: Tile }>;
export type PlayerId = 0 | 1 | 2 | 3;
export type SeatWind = 'east' | 'south' | 'west' | 'north';
export interface RiichiState {
  readonly declarationTileId: string;
  /** Omitted legacy states mean false; never cleared by drawing. */
  readonly passedRon?: boolean;
  readonly ippatsuEligible?: boolean;
  readonly doubleRiichi?: boolean;
}
export interface OpenMeld {
  readonly type: 'pon' | 'chi';
  /** Sequence order for chi; owned, called, owned for pon. */
  readonly tiles: readonly [PhysicalTile, PhysicalTile, PhysicalTile];
  readonly calledTileId: string;
  readonly fromPlayerId: PlayerId;
}
export interface PlayerState {
  readonly id: PlayerId;
  readonly control: 'human' | 'cpu';
  readonly wind: SeatWind;
  readonly hand: readonly PhysicalTile[];
  /** Missing on legacy serialized closed states means empty. */
  readonly melds?: readonly OpenMeld[];
  readonly discardHistory?: readonly PhysicalTile[];
  readonly callDiscard?: Readonly<{ forbiddenKinds: readonly string[] }> | null;
  readonly drawnTile: PhysicalTile | null;
  readonly drawnTileSource: 'deal' | 'live-wall' | null;
  readonly temporaryFuriten: boolean;
  readonly riichi: RiichiState | null;
  readonly river: readonly PhysicalTile[];
}
export interface WallState {
  readonly liveWall: readonly PhysicalTile[];
  readonly deadWall: readonly PhysicalTile[];
}
export interface WinDetails extends FuResult, ScoreResult {
  readonly winnerId: PlayerId;
  readonly winningTileId: string;
  readonly analysis: YakuAnalysis;
  readonly candidate: YakuCandidate;
  /** Supported yaku han only, preserved for Step 8 callers. */
  readonly totalHan: number;
  readonly yakuHan: number;
  readonly uraDoraCount: number;
  readonly uraDoraHan: number;
  readonly doraCount: number;
  /** Zero for yakuman. */
  readonly doraHan: number;
  readonly redDoraCount: number;
  /** Zero for yakuman; bonuses never increase a yakuman. */
  readonly redDoraHan: number;
  readonly totalHanIncludingDora: number;
  readonly yakumanCount: number;
}
export interface TsumoResult extends WinDetails {
  readonly winMethod: 'tsumo';
}
export interface RonCandidate extends WinDetails {
  readonly winMethod: 'ron';
  readonly discarderId: PlayerId;
}
export interface RonResult {
  readonly winMethod: 'ron';
  readonly discarderId: PlayerId;
  readonly winningTileId: string;
  readonly winners: readonly RonCandidate[];
}
/** Exists only for the current discard, never survives a draw or a reset. */
export interface RonWindow {
  readonly discarderId: PlayerId;
  readonly tileId: string;
}
export interface PendingRiichi {
  readonly doubleRiichi?: boolean;
  readonly playerId: PlayerId;
  readonly declarationTileId: string;
}
export interface GameState extends WallState {
  readonly callsMade?: boolean;
  readonly pendingRiichi: PendingRiichi | null;
  readonly ronWindow: RonWindow | null;
  readonly winResult: TsumoResult | RonResult | null;
  readonly dealerId: PlayerId;
  readonly turnPlayerId: PlayerId;
  readonly phase: 'awaiting-draw' | 'awaiting-call' | 'awaiting-ron' | 'awaiting-discard' | 'wall-exhausted' | 'won';
  readonly players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
}
