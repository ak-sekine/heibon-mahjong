import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { MatchState, Points } from '../model/match.ts';
import type { TileKind } from '../model/tile.ts';
import { canDiscard, discardTile } from './discard.ts';
import { getWaitingTileKinds } from './ron.ts';
import { assertPointConservation, updateMatchGame } from './match.ts';

export interface RiichiDiscardOption {
  readonly tileId: string;
  readonly waitingTileKinds: readonly TileKind[];
  readonly waitKindCount: number;
}

/** All current hands are closed. Replace this policy when exposed melds exist. */
export function isClosedForRiichi(_player: PlayerState): boolean { return true; }

/** Pure, deterministic physical-ID options; shape waits do not require a yaku. */
export function getRiichiDiscardOptions(game: GameState, playerId: PlayerId, points: number): readonly RiichiDiscardOption[] {
  if (!canDiscard(game, playerId) || !Number.isSafeInteger(points) || points < 1000 || game.liveWall.length < 4) return [];
  const player = game.players[playerId];
  if (player.riichi || !isClosedForRiichi(player)) return [];
  const tiles = [...player.hand, player.drawnTile!];
  if (new Set(tiles.map(t => t.id)).size !== 14) return [];
  return [...tiles].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).flatMap(tile => {
    const waitingTileKinds = getWaitingTileKinds(tiles.filter(t => t.id !== tile.id).map(t => t.tile));
    return waitingTileKinds.length ? [{ tileId: tile.id, waitingTileKinds, waitKindCount: waitingTileKinds.length }] : [];
  });
}

export function canDeclareRiichi(game: GameState, playerId: PlayerId, tileId: string, points: number): boolean {
  return getRiichiDiscardOptions(game, playerId, points).some(option => option.tileId === tileId);
}

/** Step 13.1 declaration policy is human seat 0 only; CPU policy is deferred.
 * Discard/CPU ron precedes establishment. No intermediate state is published.
 * A future human ron window must be resolved before establishing a CPU riichi.
 */
export function declareRiichi(match: MatchState, playerId: PlayerId, tileId: string): MatchState {
  if (match.status !== 'playing' || playerId !== 0 || match.game.players[playerId].control !== 'human' ||
      !canDeclareRiichi(match.game, playerId, tileId, match.points[playerId])) {
    throw new RangeError('Riichi is not allowed now');
  }
  assertPointConservation(match);
  const game = discardTile(match.game, playerId, tileId);
  if (game.phase === 'won') return updateMatchGame(match, game);
  // Never charge while a ron decision is pending. This cannot occur for seat 0
  // in the current one-human game, and is rejected atomically if policy changes.
  if (game.phase === 'awaiting-ron') throw new RangeError('Riichi awaits a ron decision');
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = { ...players[playerId], riichi: { declarationTileId: tileId } };
  const points = match.points.map((value,id) => value - (id === playerId ? 1000 : 0)) as unknown as Points;
  const established = { ...match, game: { ...game, players }, points, depositSticks: match.depositSticks + 1 };
  assertPointConservation(established);
  return established;
}
