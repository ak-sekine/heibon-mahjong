import type { GameState, PlayerId, WinDetails } from '../model/game.ts';
import { evaluateWin } from './win.ts';
export { ROUND_WIND, selectWinCandidate as selectTsumoCandidate } from './win.ts';

function analyzeTsumo(game: GameState, playerId: PlayerId): WinDetails | null {
  const player = game.players[playerId];
  if (player?.id !== playerId || game.turnPlayerId !== playerId ||
      game.phase !== 'awaiting-discard' || game.winResult !== null || game.ronWindow !== null ||
      !player.drawnTile || player.drawnTileSource !== 'live-wall') return null;
  return evaluateWin(game, playerId, player.drawnTile, 'tsumo');
}
export function canDeclareTsumo(game: GameState, playerId: PlayerId): boolean {
  return analyzeTsumo(game, playerId) !== null;
}
/** Keep the actual winning draw in its existing physical location. */
export function declareTsumo(game: GameState, playerId: PlayerId): GameState {
  const result = analyzeTsumo(game, playerId);
  if (!result) throw new RangeError('Tsumo is not allowed now');
  return { ...game, phase: 'won', ronWindow: null, winResult: { ...result, winMethod: 'tsumo' } };
}
