import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { MatchState, Points } from '../model/match.ts';
import type { TileKind } from '../model/tile.ts';
import { canDiscard, discardTile } from './discard.ts';
import { getWaitingTileKinds } from './ron.ts';
import { assertPointConservation, settleRound } from './match.ts';

export interface RiichiDiscardOption {
  readonly tileId: string;
  readonly waitingTileKinds: readonly TileKind[];
  readonly waitKindCount: number;
}

/** All current hands are closed. Replace this policy when exposed melds exist. */
export function isClosedForRiichi(_player: PlayerState): boolean { return true; }

/** Pure, deterministic physical-ID options; shape waits do not require a yaku. */
export function getRiichiDiscardOptions(game: GameState, playerId: PlayerId, points: number): readonly RiichiDiscardOption[] {
  if (game.pendingRiichi || !canDiscard(game, playerId) || !Number.isSafeInteger(points) || points < 1000 || game.liveWall.length < 4) return [];
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

/** Resolve only after the discard's ron window has closed. Idempotent. */
export function resolvePendingRiichi(match: MatchState): MatchState {
  const pending = match.game.pendingRiichi;
  if (!pending || match.status !== 'playing' || match.game.phase === 'awaiting-ron') return match;
  const game = match.game;
  if (game.phase === 'won' || game.phase === 'wall-exhausted') {
    return { ...match, game: { ...game, pendingRiichi: null } };
  }
  const { playerId, declarationTileId } = pending;
  const player = game.players[playerId];
  if (game.phase !== 'awaiting-draw' || game.ronWindow || game.winResult ||
      game.turnPlayerId !== (playerId + 1) % 4 || player.riichi ||
      player.river.at(-1)?.id !== declarationTileId || match.points[playerId] < 1000) {
    throw new RangeError('Invalid pending riichi resolution');
  }
  assertPointConservation(match);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = { ...player, riichi: { declarationTileId, passedRon: false, ippatsuEligible: true, doubleRiichi: pending.doubleRiichi ?? false } };
  const points = match.points.map((value,id) => value - (id === playerId ? 1000 : 0)) as unknown as Points;
  const established = { ...match, game: { ...game, players, pendingRiichi: null }, points, depositSticks: match.depositSticks + 1 };
  assertPointConservation(established);
  return established;
}

/** Shared declaration for all seats; points are committed only after ron resolution. */
export function declareRiichi(match: MatchState, playerId: PlayerId, tileId: string): MatchState {
  if (match.status !== 'playing' || match.game.pendingRiichi ||
      !canDeclareRiichi(match.game, playerId, tileId, match.points[playerId])) {
    throw new RangeError('Riichi is not allowed now');
  }
  assertPointConservation(match);
  const doubleRiichi = match.game.players[playerId].river.length === 0 && isClosedForRiichi(match.game.players[playerId]);
  const discarded = discardTile(match.game, playerId, tileId);
  const game = { ...discarded, pendingRiichi: discarded.phase === 'won' ? null : { playerId, declarationTileId: tileId, doubleRiichi } };
  return settleRound(resolvePendingRiichi({ ...match, game }));
}
