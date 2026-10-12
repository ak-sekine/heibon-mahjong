import type { GameState, PlayerId, PlayerState } from '../model/game.ts';

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

/** Step 4 supports only the human dealer's first discard. */
export function canDiscard(game: GameState, playerId: PlayerId): boolean {
  const player = game.players.find(player => player.id === playerId);
  return game.phase === 'awaiting-discard' && game.turnPlayerId === playerId
    && game.dealerId === playerId && playerId === 0 && player?.control === 'human'
    && player.hand.length === 13 && player.drawnTile !== null && player.river.length === 0;
}

/** Invalid operations throw, leaving the input state untouched. */
export function discardTile(game: GameState, playerId: PlayerId, tileId: string): GameState {
  if (!canDiscard(game, playerId)) throw new RangeError('Discard is not allowed now');
  const player = discardFromPlayer(game.players[playerId], tileId);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = player;
  return { ...game, players, phase: 'stopped' };
}
