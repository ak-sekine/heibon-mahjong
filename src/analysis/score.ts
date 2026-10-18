import type { PlayerId } from '../model/game.ts';

export type ScoreTier = 'normal' | 'mangan' | 'haneman' | 'baiman' | 'sanbaiman' | 'kazoe-yakuman' | 'yakuman';
export interface Payment { readonly playerId: PlayerId; readonly points: number }
export interface ScoreResult {
  readonly scoreTier: ScoreTier;
  readonly basePoints: number;
  readonly payments: readonly Payment[];
  /** Sum after rounding each individual payment; excludes honba and deposits. */
  readonly totalPoints: number;
}
export interface ScoreContext {
  readonly totalHanIncludingDora: number;
  readonly fu: number | null;
  readonly yakumanCount: number;
  readonly winnerId: PlayerId;
  readonly dealerId: PlayerId;
  readonly winMethod: 'ron' | 'tsumo';
  readonly discarderId?: PlayerId;
}
/** Standard tsumo payments for a fixed base point value, shared by ordinary
 * scoring and special tsumo-equivalent settlements such as nagashi mangan. */
export function calculateTsumoPayments(basePoints: number, winnerId: PlayerId, dealerId: PlayerId): readonly Payment[] {
  const ids: readonly PlayerId[] = [0, 1, 2, 3];
  if (!Number.isSafeInteger(basePoints) || basePoints < 0 || !ids.includes(winnerId) || !ids.includes(dealerId)) throw new RangeError('Invalid tsumo payment context');
  const round = (multiplier: number) => Math.ceil(basePoints * multiplier / 100) * 100;
  return ids.filter(id => id !== winnerId).map(playerId => ({ playerId,
    points: round(winnerId === dealerId || playerId === dealerId ? 2 : 1) }));
}
export function calculateBasePoints(han: number, fu: number | null, yakumanCount = 0): Pick<ScoreResult, 'scoreTier' | 'basePoints'> {
  if (!Number.isInteger(yakumanCount) || yakumanCount < 0 || !Number.isInteger(han) || han < 0) throw new RangeError('Invalid han or yakuman count');
  if (yakumanCount > 0) return { scoreTier: 'yakuman', basePoints: 8000 * yakumanCount };
  if (han < 1) throw new RangeError('Scoring requires yaku han');
  if (han >= 13) return { scoreTier: 'kazoe-yakuman', basePoints: 8000 };
  if (han >= 11) return { scoreTier: 'sanbaiman', basePoints: 6000 };
  if (han >= 8) return { scoreTier: 'baiman', basePoints: 4000 };
  if (han >= 6) return { scoreTier: 'haneman', basePoints: 3000 };
  if (han === 5) return { scoreTier: 'mangan', basePoints: 2000 };
  if (fu === null || !Number.isInteger(fu) || (fu !== 25 && (fu < 20 || fu % 10 !== 0))) throw new RangeError('Invalid fu');
  const basePoints = fu * 2 ** (han + 2);
  return basePoints >= 2000 ? { scoreTier: 'mangan', basePoints: 2000 } : { scoreTier: 'normal', basePoints };
}
/** Four-player payments; balances are never mutated. */
export function calculateScore(context: ScoreContext): ScoreResult {
  const { winnerId, dealerId, winMethod, discarderId } = context;
  const ids: readonly PlayerId[] = [0, 1, 2, 3];
  if (!ids.includes(winnerId) || !ids.includes(dealerId) || !['ron', 'tsumo'].includes(winMethod)) throw new RangeError('Invalid scoring context');
  const base = calculateBasePoints(context.totalHanIncludingDora, context.fu, context.yakumanCount);
  const round = (multiplier: number) => Math.ceil(base.basePoints * multiplier / 100) * 100;
  let payments: Payment[];
  if (winMethod === 'ron') {
    if (discarderId === undefined || !ids.includes(discarderId) || discarderId === winnerId) throw new RangeError('Ron requires a different discarder');
    payments = [{ playerId: discarderId, points: round(winnerId === dealerId ? 6 : 4) }];
  } else {
    payments = [...calculateTsumoPayments(base.basePoints, winnerId, dealerId)];
  }
  return { ...base, payments, totalPoints: payments.reduce((sum, p) => sum + p.points, 0) };
}
