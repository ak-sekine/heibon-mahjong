import type { GameState, PlayerId, SeatWind } from '../model/game.ts';
import { analyzeYaku } from '../analysis/yaku.ts';
import type { YakuAnalysis, YakuCandidate } from '../analysis/yaku.ts';

/** Step 8 has no round progression. Replace this context when rounds are added. */
export const ROUND_WIND: SeatWind = 'east';

/** Prefer yakuman, then supported han; ties use stable candidate IDs. No scoring. */
export function selectTsumoCandidate(analysis: YakuAnalysis): YakuCandidate | null {
  return [...analysis.candidates].filter(c => c.yaku.length > 0).sort((a, b) =>
    b.yakumanCount - a.yakumanCount || b.totalHan - a.totalHan ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

function analyzeTsumo(game: GameState, playerId: PlayerId): YakuAnalysis | null {
  const player = game.players[playerId];
  if (playerId !== 0 || player?.id !== playerId || player.control !== 'human' ||
      game.turnPlayerId !== playerId || game.phase !== 'awaiting-discard' || game.winResult !== null ||
      player.hand.length !== 13 || !player.drawnTile || player.drawnTileSource !== 'live-wall') return null;
  const tiles = [...player.hand, player.drawnTile];
  if (new Set(tiles.map(t => t.id)).size !== 14) return null;
  try {
    const analysis = analyzeYaku(tiles.map(t => t.tile), {
      winMethod: 'tsumo', winningTile: player.drawnTile.tile,
      seatWind: player.wind, roundWind: ROUND_WIND,
    });
    return analysis.isWinningShape && analysis.hasSupportedYaku ? analysis : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function canDeclareTsumo(game: GameState, playerId: PlayerId): boolean {
  const analysis = analyzeTsumo(game, playerId);
  return analysis !== null && selectTsumoCandidate(analysis) !== null;
}

/** Keep all physical tiles in place, including the actual winning draw. */
export function declareTsumo(game: GameState, playerId: PlayerId): GameState {
  const analysis = analyzeTsumo(game, playerId);
  const candidate = analysis && selectTsumoCandidate(analysis);
  if (!analysis || !candidate) throw new RangeError('Tsumo is not allowed now');
  return { ...game, phase: 'won', winResult: {
    winnerId: playerId, winMethod: 'tsumo', winningTileId: game.players[playerId].drawnTile!.id,
    analysis, candidate, totalHan: candidate.totalHan, yakumanCount: candidate.yakumanCount,
  } };
}
