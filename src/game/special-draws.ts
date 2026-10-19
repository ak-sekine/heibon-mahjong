import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';

const playerIds: readonly PlayerId[] = [0, 1, 2, 3];

export function isTerminalOrHonor(tile: { readonly category: string; readonly rank?: number }): boolean {
  return tile.category === 'honor' || tile.category === 'suited' && (tile.rank === 1 || tile.rank === 9);
}

/** Missing history cannot prove that a player's earlier discards stayed uncalled. */
export function isNagashiManganCandidate(player: PlayerState): boolean {
  const history = player.discardHistory;
  if (!history?.length || history.some(tile => !isTerminalOrHonor(tile.tile))) return false;
  const historyIds = new Set(history.map(tile => tile.id));
  const riverIds = new Set(player.river.map(tile => tile.id));
  if (historyIds.size !== history.length || riverIds.size !== player.river.length || historyIds.size !== riverIds.size) return false;
  return [...historyIds].every(id => riverIds.has(id)) && [...riverIds].every(id => historyIds.has(id));
}

export function getNagashiManganWinners(game: GameState): readonly PlayerId[] {
  if (game.phase !== 'wall-exhausted' || game.abortiveDraw || game.winResult) return [];
  return playerIds.filter(id => isNagashiManganCandidate(game.players[id]));
}

/** A four-winds draw is checked after the fourth discard's full ron window. */
export function isFourWindsDraw(game: GameState): boolean {
  if (!['awaiting-call', 'awaiting-draw'].includes(game.phase) || game.winResult || game.callsMade ||
      (game.kanCount ?? 0) !== 0 || game.players.some(player => player.melds?.length)) return false;
  if (game.phase === 'awaiting-call' && (!game.ronWindow || game.ronWindow.kan)) return false;
  if (game.phase === 'awaiting-draw' && game.ronWindow) return false;
  const histories = game.players.map(player => player.discardHistory);
  if (histories.some(history => !history || history.length !== 1)) return false;
  const first = histories.map(history => history![0]);
  if (new Set(first.map(tile => tile.id)).size !== 4 || game.players.reduce((sum, player) => sum + (player.discardHistory?.length ?? 0), 0) !== 4) return false;
  const firstWind = first[0].tile;
  if (firstWind.category !== 'honor' || !['east', 'south', 'west', 'north'].includes(firstWind.honor)) return false;
  if (game.phase === 'awaiting-call') {
    const latestDiscard = game.players[game.ronWindow!.discarderId].river.at(-1);
    if (latestDiscard?.id !== game.ronWindow!.tileId) return false;
  }
  return first.every((tile, id) => tile.tile.category === 'honor' && tile.tile.honor === firstWind.honor &&
    game.players[id].river.some(riverTile => riverTile.id === tile.id));
}

export function canDeclareKyuushuKyuuhai(game: GameState, playerId: PlayerId): boolean {
  const player = game.players[playerId];
  const hand = player ? [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])] : [];
  if (!player || player.id !== playerId ||
      game.phase !== 'awaiting-discard' || game.turnPlayerId !== playerId || game.winResult || game.ronWindow || game.pendingRiichi ||
      player.drawnTile === null || !['deal', 'live-wall'].includes(player.drawnTileSource ?? '') || hand.length !== 14 ||
      new Set(hand.map(tile => tile.id)).size !== 14 || (player.discardHistory ?? player.river).length > 0 ||
      player.melds?.length || player.callDiscard || game.callsMade || (game.kanCount ?? 0) !== 0 ||
      game.players.some(other => other.melds?.length)) return false;
  return new Set(hand.filter(tile => isTerminalOrHonor(tile.tile)).map(tile => tileKindKey(tile.tile))).size >= 9;
}

export function declareKyuushuKyuuhai(game: GameState, playerId: PlayerId): GameState {
  if (!canDeclareKyuushuKyuuhai(game, playerId)) throw new RangeError('九種九牌 is not allowed now');
  return { ...game, phase: 'wall-exhausted', abortiveDraw: 'kyuushu-kyuuhai', ronWindow: null, pendingRiichi: null };
}
