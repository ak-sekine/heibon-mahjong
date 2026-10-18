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
export type OpenMeld = Readonly<{
  type: 'pon' | 'chi';
  tiles: readonly [PhysicalTile, PhysicalTile, PhysicalTile];
  calledTileId: string;
  fromPlayerId: PlayerId;
}> | Readonly<{
  type: 'ankan' | 'daiminkan' | 'kakan';
  tiles: readonly [PhysicalTile, PhysicalTile, PhysicalTile, PhysicalTile];
  /** Ankan uses its owner's seat and an empty called ID. */
  calledTileId: string;
  fromPlayerId: PlayerId;
  addedTileId?: string;
}>;
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
  readonly drawnTileSource: 'deal' | 'live-wall' | 'rinshan' | null;
  readonly temporaryFuriten: boolean;
  readonly riichi: RiichiState | null;
  readonly river: readonly PhysicalTile[];
}
export interface WallState {
  readonly kanCount?: number;
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
  readonly winningTile?: PhysicalTile;
  readonly winMethod: 'ron';
  readonly discarderId: PlayerId;
  readonly winningTileId: string;
  readonly winners: readonly RonCandidate[];
}
/** Exists only for the current discard, never survives a draw or a reset. */
export interface RonWindow {
  readonly kind?: 'discard' | 'ankan' | 'kakan';
  readonly kan?: Readonly<{ playerId: PlayerId; meld: OpenMeld; handTileIds: readonly string[]; meldIndex: number | null; tile: PhysicalTile }>;
  readonly discarderId: PlayerId;
  readonly tileId: string;
  /** Set at discard time only when it follows the final live-wall draw. */
  readonly lastLiveWallDiscard?: boolean;
}
export interface PendingRiichi {
  readonly doubleRiichi?: boolean;
  readonly playerId: PlayerId;
  readonly declarationTileId: string;
}
export interface GameState extends WallState {
  readonly abortiveDraw?: 'four-kans' | 'kyuushu-kyuuhai' | 'four-winds' | 'four-riichi';
  readonly callsMade?: boolean;
  readonly pendingRiichi: PendingRiichi | null;
  readonly ronWindow: RonWindow | null;
  readonly winResult: TsumoResult | RonResult | null;
  readonly dealerId: PlayerId;
  readonly turnPlayerId: PlayerId;
  readonly phase: 'awaiting-draw' | 'awaiting-call' | 'awaiting-ron' | 'awaiting-discard' | 'wall-exhausted' | 'won';
  readonly players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
}
