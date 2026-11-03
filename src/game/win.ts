import { tileKindKey } from '../model/tile.ts';
import { concealedSize, winningMelds, isClosedHand, kanMeldCount } from './melds.ts';
import { calculateFu } from '../analysis/fu.ts';
import { calculateFixedManganRonScore, calculateScore } from '../analysis/score.ts';
import type { GameState, PhysicalTile, PlayerId, SeatWind, WinDetails, YakumanPaymentBreakdown } from '../model/game.ts';
import { analyzeYaku, type YakuAnalysis, type YakuCandidate, type YakumanYakuId } from '../analysis/yaku.ts';
import { countDora, countRedDora } from '../analysis/dora.ts';
import { exposedDoraIndicators, uraDoraIndicators } from './dora.ts';
import { isChiihouState, isRenhouState, isTenhouState } from './first-turn-wins.ts';
import { rulesForGame } from '../model/rules.ts';
import { paoResponsiblePlayer } from './pao.ts';

const paoYaku = new Set<YakumanYakuId>(['daisangen', 'daisuushii', 'suukantsu']);

function allocateYakumanPao(game: GameState, candidate: YakuCandidate, winnerId: PlayerId, dealerId: PlayerId,
  winMethod: 'tsumo' | 'ron', discarderId?: PlayerId): Pick<WinDetails, 'payments' | 'totalPoints' | 'yakumanBreakdown'> | null {
  const components = candidate.yaku.filter(yaku => yaku.yakuman > 0);
  const responsibilities = components.map(yaku => ({ yaku, responsiblePlayerId:
    paoYaku.has(yaku.id as YakumanYakuId) ? paoResponsiblePlayer(game, yaku.id as 'daisangen' | 'daisuushii' | 'suukantsu') : undefined }));
  if (!responsibilities.some(item => item.responsiblePlayerId !== undefined)) return null;
  const byPayer = new Map<PlayerId, number>();
  const breakdown: YakumanPaymentBreakdown[] = [];
  for (const { yaku, responsiblePlayerId } of responsibilities) {
    const component = calculateScore({ totalHanIncludingDora: 0, fu: null, yakumanCount: yaku.yakuman,
      winnerId, dealerId, winMethod, ...(discarderId === undefined ? {} : { discarderId }) });
    const shares = new Map<PlayerId, { points: number; pao: boolean }>();
    if (responsiblePlayerId === undefined) {
      for (const payment of component.payments) shares.set(payment.playerId, { points: payment.points, pao: false });
    } else if (winMethod === 'tsumo') {
      shares.set(responsiblePlayerId, { points: component.totalPoints, pao: true });
    } else if (discarderId === responsiblePlayerId) {
      shares.set(responsiblePlayerId, { points: component.totalPoints, pao: true });
    } else {
      const half = Math.floor(component.totalPoints / 200) * 100;
      shares.set(responsiblePlayerId, { points: half, pao: true });
      shares.set(discarderId!, { points: component.totalPoints - half, pao: true });
    }
    for (const [playerId, share] of shares) byPayer.set(playerId, (byPayer.get(playerId) ?? 0) + share.points);
    breakdown.push({ yakuId: yaku.id as YakumanYakuId, yakuman: yaku.yakuman, responsiblePlayerId,
      payerShares: [...shares].map(([playerId, share]) => ({ playerId, ...share })) });
  }
  const payments = [...byPayer].sort(([a], [b]) => a - b).map(([playerId, points]) => ({ playerId, points }));
  return { payments, totalPoints: payments.reduce((sum, payment) => sum + payment.points, 0), yakumanBreakdown: breakdown };
}

/** Default round wind for legacy game states without an explicit wind. */
export const ROUND_WIND: SeatWind = 'east';

/** Prefer yakuman, then supported han; ties use stable candidate IDs. No scoring. */
export function selectWinCandidate(analysis: YakuAnalysis): YakuCandidate | null {
  return [...analysis.candidates].filter(c => c.yaku.length > 0).sort((a, b) =>
    b.yakumanCount - a.yakumanCount || b.totalHan - a.totalHan ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

/** Both methods use the same supported yaku, candidate selection and bonuses. */
export function evaluateWin(
  game: GameState,
  playerId: PlayerId,
  winningTile: PhysicalTile,
  winMethod: 'tsumo' | 'ron',
  options: Readonly<{ includeUraDora?: boolean }> = {},
): WinDetails | null {
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
    const rules = rulesForGame(game);
    const allFaces = [...faces, ...(player.melds ?? []).flatMap(m=>m.tiles.map(t=>t.tile))];
    const ronWindow = game.ronWindow;
    const houtei = winMethod === 'ron' && Boolean(ronWindow && !ronWindow.kan &&
      (ronWindow.kind === undefined || ronWindow.kind === 'discard') && ronWindow.lastLiveWallDiscard === true);
    const analysis = analyzeYaku(faces, { isClosed, openMelds, winMethod, winningTile: winningTile.tile,
      rinshan: winMethod==='tsumo' && player.drawnTileSource==='rinshan',
      tenhou: winMethod==='tsumo' && isTenhouState(game, playerId),
      chiihou: winMethod==='tsumo' && isChiihouState(game, playerId),
      chankan: winMethod==='ron' && Boolean(ronWindow?.kan),
      haitei: winMethod==='tsumo' && player.drawnTileSource==='live-wall' && game.liveWall.length===0,
      houtei,
      seatWind: player.wind, roundWind: game.roundWind ?? ROUND_WIND, riichi: player.riichi !== null,
      ippatsuEligible: rules.ippatsu && player.riichi?.ippatsuEligible, doubleRiichi: player.riichi?.doubleRiichi,
      kuitan: rules.kuitan, doubleYakuman: rules.doubleYakuman });
    if (!analysis.isWinningShape) return null;
    const renhouEligible = winMethod === 'ron' && rules.renhou === 'mangan' && isRenhouState(game, playerId, winningTile.id);
    if (!analysis.hasSupportedYaku && !renhouEligible) return null;
    const doraCount = countDora(allFaces, exposedDoraIndicators(game, rules).map(t => t.tile));
    const uraDoraCount = options.includeUraDora !== false && rules.uraDora && player.riichi
      ? countDora(allFaces, uraDoraIndicators(game, rules).map(t => t.tile)) : 0;
    const redDoraCount = rules.redDora ? countRedDora(allFaces) : 0;
    const evaluated = analysis.candidates.filter(c => c.yaku.length > 0).map(candidate => {
      const doraHan = candidate.yakumanCount > 0 ? 0 : doraCount;
      const uraDoraHan = candidate.yakumanCount > 0 ? 0 : uraDoraCount;
      const redDoraHan = candidate.yakumanCount > 0 ? 0 : redDoraCount;
      const totalHanIncludingDora = candidate.yakumanCount > 0 ? 0 : candidate.totalHan + doraHan + uraDoraHan + redDoraHan;
      const fu = calculateFu(candidate, { isClosed, openMelds, winMethod, seatWind: player.wind, roundWind: game.roundWind ?? ROUND_WIND });
      const score = calculateScore({ totalHanIncludingDora, fu: fu.fu, yakumanCount: candidate.yakumanCount,
        winnerId: playerId, dealerId: game.dealerId, winMethod,
        discarderId: winMethod === 'ron' ? game.ronWindow?.discarderId : undefined });
      const paoAllocation = candidate.yakumanCount > 0
        ? allocateYakumanPao(game, candidate, playerId, game.dealerId, winMethod,
          winMethod === 'ron' ? game.ronWindow?.discarderId : undefined) : null;
      return { winnerId: playerId, winningTileId: winningTile.id, analysis, candidate,
        totalHan: candidate.totalHan, yakuHan: candidate.totalHan, yakumanCount: candidate.yakumanCount,
        doraCount, doraHan, uraDoraCount, uraDoraHan, redDoraCount, redDoraHan, totalHanIncludingDora, ...fu, ...score,
        ...(paoAllocation ? { payments: paoAllocation.payments, totalPoints: paoAllocation.totalPoints,
          yakumanBreakdown: paoAllocation.yakumanBreakdown } : {}) };
    });
    const ordinary = selectScoredWinCandidate(evaluated);
    if (!renhouEligible) return ordinary;
    const shape = [...analysis.candidates].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!shape) return ordinary;
    const renhouYaku = { id: 'renhou' as const, han: 0 as const, yakuman: 0 as const };
    const renhouCandidate: YakuCandidate = { ...shape, yaku: [renhouYaku], totalHan: 0, yakumanCount: 0 };
    const renhouAnalysis: YakuAnalysis = { ...analysis, hasSupportedYaku: true, candidates: [renhouCandidate] };
    const score = calculateFixedManganRonScore({ winnerId: playerId, dealerId: game.dealerId,
      discarderId: game.ronWindow?.discarderId });
    const renhou: WinDetails = { winnerId: playerId, winningTileId: winningTile.id,
      analysis: renhouAnalysis, candidate: renhouCandidate, totalHan: 0, yakuHan: 0,
      uraDoraCount, uraDoraHan: 0, doraCount, doraHan: 0,
      redDoraCount, redDoraHan: 0, totalHanIncludingDora: 0, yakumanCount: 0,
      rawFu: null, fu: null, fuBreakdown: [], fuMode: 'fixed-mangan', ...score };
    return !ordinary || ordinary.totalPoints <= renhou.totalPoints ? renhou : ordinary;
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
