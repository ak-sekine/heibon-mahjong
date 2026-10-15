import { concealedSize, isForbiddenDiscard } from './melds.ts';
import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import { endIppatsu } from './ippatsu.ts';
import { resolveDiscardRon } from './ron.ts';

/** Shared tile movement; no human/CPU policy or turn progression here. */
export function discardFromPlayer(player: PlayerState, tileId: string): PlayerState {
  if (player.callDiscard ? (player.hand.length !== concealedSize(player)+1 || player.drawnTile !== null || player.drawnTileSource !== null || Boolean(player.riichi)) : (player.hand.length !== concealedSize(player) || !player.drawnTile)) {
    throw new RangeError('Discard requires thirteen tiles and a drawn tile');
  }
  if (isForbiddenDiscard(player, tileId)) throw new RangeError('Kuikae is forbidden');
  if (player.riichi && tileId !== player.drawnTile?.id) {
    throw new RangeError('Riichi requires discarding the drawn physical tile');
  }
  const tile = player.drawnTile?.id === tileId
    ? player.drawnTile : player.hand.find(tile => tile.id === tileId);
  if (!tile) throw new RangeError('Tile is not owned by this player');
  const hand = tile === player.drawnTile ? player.hand
    : [...player.hand.filter(candidate => candidate.id !== tileId), ...(player.drawnTile ? [player.drawnTile] : [])];
  return { ...endIppatsu(player), hand, callDiscard: null, discardHistory: [...(player.discardHistory ?? player.river), tile], drawnTile: null, drawnTileSource: null, river: [...player.river, tile] };
}

/** The same rules apply to every seat, on every turn. */
export function canDiscard(game: GameState, playerId: PlayerId): boolean {
  const player = game.players[playerId];
  return !game.pendingRiichi && game.phase === 'awaiting-discard' && game.winResult === null && game.ronWindow === null && game.turnPlayerId === playerId
    && player?.id === playerId && (player.callDiscard ? player.hand.length === concealedSize(player)+1 && player.drawnTile === null && player.drawnTileSource === null && !player.riichi : player.hand.length === concealedSize(player) && player.drawnTile !== null);
}

/** Invalid operations throw, leaving the input state untouched. */
export function discardTile(game: GameState, playerId: PlayerId, tileId: string): GameState {
  if (!canDiscard(game, playerId)) throw new RangeError('Discard is not allowed now');
  const player = discardFromPlayer(game.players[playerId], tileId);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = player;
  return resolveDiscardRon({ ...game, players, phase: 'awaiting-ron',
    ronWindow: { discarderId: playerId, tileId: player.river.at(-1)!.id } });
}
