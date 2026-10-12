import type { GameState, PlayerId, PlayerState } from '../model/game.ts';

export function nextPlayerId(id: PlayerId): PlayerId {
  if (![0, 1, 2, 3].includes(id)) throw new RangeError('Invalid player');
  return ((id + 1) % 4) as PlayerId;
}

export function requireDrawTurn(game: GameState, id: PlayerId): PlayerState {
  const player = game.players[id];
  if (game.phase !== 'awaiting-draw' || game.winResult !== null || game.ronWindow !== null || game.turnPlayerId !== id || player?.id !== id
    || player.hand.length !== 13 || player.drawnTile !== null) {
    throw new RangeError('Draw is not allowed now');
  }
  return player;
}

/** Exhaustion is recorded only when the next valid draw is needed. */
export function stopAtEmptyWall(game: GameState): GameState {
  requireDrawTurn(game, game.turnPlayerId);
  if (game.liveWall.length !== 0) throw new RangeError('Live wall is not empty');
  return { ...game, phase: 'wall-exhausted' };
}
