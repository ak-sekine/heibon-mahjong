import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import { requireDrawTurn, stopAtEmptyWall } from './turn.ts';

/** Moves one physical tile, preserving the thirteen-tile hand and dead wall. */
export function drawTile(game: GameState, playerId: PlayerId): GameState {
  const player = requireDrawTurn(game, playerId);
  const tile = game.liveWall[0];
  if (!tile) throw new RangeError('Live wall is empty');
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = { ...player, drawnTile: tile, drawnTileSource: 'live-wall' };
  return { ...game, players, liveWall: game.liveWall.slice(1), phase: 'awaiting-discard' };
}

/** Turn progression may stop; a direct empty-wall draw remains invalid. */
export function drawOrStop(game: GameState): GameState {
  return game.liveWall.length === 0 ? stopAtEmptyWall(game) : drawTile(game, game.turnPlayerId);
}
