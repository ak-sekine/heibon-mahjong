import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import { nextPlayerId } from './turn.ts';

/** Shared tile movement; no human/CPU policy or turn progression here. */
export function discardFromPlayer(player: PlayerState, tileId: string): PlayerState {
  if (player.hand.length !== 13 || !player.drawnTile) {
    throw new RangeError('Discard requires thirteen tiles and a drawn tile');
  }
  const tile = player.drawnTile.id === tileId
    ? player.drawnTile : player.hand.find(tile => tile.id === tileId);
  if (!tile) throw new RangeError('Tile is not owned by this player');
  const hand = tile === player.drawnTile ? player.hand
    : [...player.hand.filter(candidate => candidate.id !== tileId), player.drawnTile];
  return { ...player, hand, drawnTile: null, river: [...player.river, tile] };
}

/** The same rules apply to every seat, on every turn. */
export function canDiscard(game: GameState, playerId: PlayerId): boolean {
  const player = game.players[playerId];
  return game.phase === 'awaiting-discard' && game.turnPlayerId === playerId
    && player?.id === playerId && player.hand.length === 13 && player.drawnTile !== null;
}

/** Invalid operations throw, leaving the input state untouched. */
export function discardTile(game: GameState, playerId: PlayerId, tileId: string): GameState {
  if (!canDiscard(game, playerId)) throw new RangeError('Discard is not allowed now');
  const player = discardFromPlayer(game.players[playerId], tileId);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = player;
  return { ...game, players, turnPlayerId: nextPlayerId(playerId), phase: 'awaiting-draw' };
}
