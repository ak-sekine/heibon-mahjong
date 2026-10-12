import type { GameState, PhysicalTile, PlayerId, SeatWind, WinDetails } from '../model/game.ts';
import { analyzeYaku, type YakuAnalysis, type YakuCandidate } from '../analysis/yaku.ts';
import { countDora, countRedDora } from '../analysis/dora.ts';
import { exposedDoraIndicators } from './dora.ts';

/** Step 8 has no round progression. Replace this context when rounds are added. */
export const ROUND_WIND: SeatWind = 'east';

/** Prefer yakuman, then supported han; ties use stable candidate IDs. No scoring. */
export function selectWinCandidate(analysis: YakuAnalysis): YakuCandidate | null {
  return [...analysis.candidates].filter(c => c.yaku.length > 0).sort((a, b) =>
    b.yakumanCount - a.yakumanCount || b.totalHan - a.totalHan ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

/** Both methods use the same supported yaku, candidate selection and bonuses. */
export function evaluateWin(game: GameState, playerId: PlayerId, winningTile: PhysicalTile, winMethod: 'tsumo' | 'ron'): WinDetails | null {
  const player = game.players[playerId];
  const tiles = [...player.hand, winningTile];
  if (player.hand.length !== 13 || new Set(tiles.map(t => t.id)).size !== 14) return null;
  try {
    const faces = tiles.map(t => t.tile);
    const analysis = analyzeYaku(faces, { winMethod, winningTile: winningTile.tile,
      seatWind: player.wind, roundWind: ROUND_WIND });
    const candidate = selectWinCandidate(analysis);
    if (!analysis.isWinningShape || !analysis.hasSupportedYaku || !candidate) return null;
    const doraCount = countDora(faces, exposedDoraIndicators(game).map(t => t.tile));
    const redDoraCount = countRedDora(faces);
    const doraHan = candidate.yakumanCount > 0 ? 0 : doraCount;
    const redDoraHan = candidate.yakumanCount > 0 ? 0 : redDoraCount;
    return { winnerId: playerId, winningTileId: winningTile.id, analysis, candidate,
      totalHan: candidate.totalHan, yakuHan: candidate.totalHan, yakumanCount: candidate.yakumanCount,
      doraCount, doraHan, redDoraCount, redDoraHan,
      totalHanIncludingDora: candidate.yakumanCount > 0 ? 0 : candidate.totalHan + doraHan + redDoraHan };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
