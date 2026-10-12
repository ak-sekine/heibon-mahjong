import type { Tile } from './tile.ts';

/** Identity is unique within one game; tile describes its face only. */
export type PhysicalTile = Readonly<{ id: string; tile: Tile }>;
export type PlayerId = 0 | 1 | 2 | 3;
export type SeatWind = 'east' | 'south' | 'west' | 'north';
export interface PlayerState {
  readonly id: PlayerId;
  readonly control: 'human' | 'cpu';
  readonly wind: SeatWind;
  readonly hand: readonly PhysicalTile[];
  readonly drawnTile: PhysicalTile | null;
  readonly river: readonly PhysicalTile[];
}
export interface WallState {
  readonly liveWall: readonly PhysicalTile[];
  readonly deadWall: readonly PhysicalTile[];
}
export interface GameState extends WallState {
  readonly dealerId: PlayerId;
  readonly turnPlayerId: PlayerId;
  readonly phase: 'awaiting-discard' | 'stopped';
  readonly players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
}
