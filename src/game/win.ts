import { tileKindKey } from '../model/tile.ts';
import { concealedSize, winningMelds, isClosedHand, kanMeldCount } from './melds.ts';
import { calculateFu } from '../analysis/fu.ts';
import { calculateScore } from '../analysis/score.ts';
import type { GameState, PhysicalTile, PlayerId, SeatWind, WinDetails } from '../model/game.ts';
import { analyzeYaku, type YakuAnalysis, type YakuCandidate } from '../analysis/yaku.ts';
import { countDora, countRedDora } from '../analysis/dora.ts';
import { exposedDoraIndicators, uraDoraIndicators } from './dora.ts';

/** East-only match: the round wind stays east throughout all four rounds. */
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
  const allPhysical = [...tiles, ...(player.melds ?? []).flatMap(m=>m.tiles)];
  if((player.melds ?? []).some(m=>m.tiles.length!==(m.type==='chi'||m.type==='pon'?3:4) || (m.type!=='chi' && m.tiles.some(t=>tileKindKey(t.tile)!==tileKindKey(m.tiles[0].tile))))) return null;
  if(allPhysical.length!==14+kanMeldCount(player)) return null;
  if (new Set(allPhysical.map(t=>t.id)).size !== 14 + kanMeldCount(player) || player.hand.length !== concealedSize(player) || new Set(tiles.map(t => t.id)).size !== 14 - (player.melds?.length ?? 0)*3) return null;
  try {
    const faces = tiles.map(t => t.tile);
    const openMelds = winningMelds(player.melds);
    const isClosed = isClosedHand(player);
    const allFaces = [...faces, ...(player.melds ?? []).flatMap(m=>m.tiles.map(t=>t.tile))];
    const ronWindow = game.ronWindow;
    const houtei = winMethod === 'ron' && Boolean(ronWindow && !ronWindow.kan &&
      (ronWindow.kind === undefined || ronWindow.kind === 'discard') && ronWindow.lastLiveWallDiscard === true);
    const analysis = analyzeYaku(faces, { isClosed, openMelds, winMethod, winningTile: winningTile.tile,
      rinshan: winMethod==='tsumo' && player.drawnTileSource==='rinshan',
      chankan: winMethod==='ron' && Boolean(ronWindow?.kan),
      haitei: winMethod==='tsumo' && player.drawnTileSource==='live-wall' && game.liveWall.length===0,
      houtei,
      seatWind: player.wind, roundWind: ROUND_WIND, riichi: player.riichi !== null,
      ippatsuEligible: player.riichi?.ippatsuEligible, doubleRiichi: player.riichi?.doubleRiichi });
    if (!analysis.isWinningShape || !analysis.hasSupportedYaku) return null;
    const doraCount = countDora(allFaces, exposedDoraIndicators(game).map(t => t.tile));
    const uraDoraCount = player.riichi ? countDora(allFaces, uraDoraIndicators(game).map(t => t.tile)) : 0;
    const redDoraCount = countRedDora(allFaces);
    const evaluated = analysis.candidates.filter(c => c.yaku.length > 0).map(candidate => {
      const doraHan = candidate.yakumanCount > 0 ? 0 : doraCount;
      const uraDoraHan = candidate.yakumanCount > 0 ? 0 : uraDoraCount;
      const redDoraHan = candidate.yakumanCount > 0 ? 0 : redDoraCount;
      const totalHanIncludingDora = candidate.yakumanCount > 0 ? 0 : candidate.totalHan + doraHan + uraDoraHan + redDoraHan;
      const fu = calculateFu(candidate, { isClosed, openMelds, winMethod, seatWind: player.wind, roundWind: ROUND_WIND });
      const score = calculateScore({ totalHanIncludingDora, fu: fu.fu, yakumanCount: candidate.yakumanCount,
        winnerId: playerId, dealerId: game.dealerId, winMethod,
        discarderId: winMethod === 'ron' ? game.ronWindow?.discarderId : undefined });
      return { winnerId: playerId, winningTileId: winningTile.id, analysis, candidate,
        totalHan: candidate.totalHan, yakuHan: candidate.totalHan, yakumanCount: candidate.yakumanCount,
        doraCount, doraHan, uraDoraCount, uraDoraHan, redDoraCount, redDoraHan, totalHanIncludingDora, ...fu, ...score };
    });
    return selectScoredWinCandidate(evaluated);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Maximum received points; stable ties preserve candidate-local yaku and fu. */
export function selectScoredWinCandidate<T extends WinDetails>(candidates: readonly T[]): T | null {
  return [...candidates].sort((a, b) => b.totalPoints - a.totalPoints ||
    b.yakumanCount - a.yakumanCount || b.yakuHan - a.yakuHan || (b.fu ?? 0) - (a.fu ?? 0) ||
    (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0))[0] ?? null;
}
