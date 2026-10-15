import { winningMelds } from './melds.ts';
import type { GameState, PlayerId } from '../model/game.ts';
import type { MatchState, Points, RoundSettlement, SettlementPayment } from '../model/match.ts';
import { getWaitingTileKinds } from './ron.ts';
import { resolvePendingRiichi } from './riichi.ts';
import { startGame } from './start.ts';
const ids = [0, 1, 2, 3] as const;
export function startMatch(game: GameState = startGame()): MatchState {
  return settleRound({ roundWind: 'east', roundNumber: 1, dealerId: game.dealerId, honba: 0,
    points: [25000,25000,25000,25000], depositSticks: 0, game, lastSettlement: null, status: 'playing' });
}
export function assertPointConservation(match: MatchState): void {
  if (!Number.isSafeInteger(match.depositSticks) || match.depositSticks < 0 ||
    !match.points.every(Number.isSafeInteger) || match.points.reduce((a,b) => a+b,0) + match.depositSticks*1000 !== 100000) {
    throw new RangeError('Invalid point balance');
  }
}
/** Pure, idempotent settlement; scoring remains exclusively in ScoreResult. */
export function settleRound(match: MatchState): MatchState {
  if (match.status !== 'playing' || !['won','wall-exhausted'].includes(match.game.phase)) return match;
  assertPointConservation(match);
  if (!Number.isSafeInteger(match.honba) || match.honba < 0 || match.game.dealerId !== match.dealerId) throw new RangeError('Invalid round');
  const win = match.game.winResult;
  if (match.game.phase === 'won' && !win) throw new RangeError('Missing win result');
  const tenpai = win ? null : match.game.players.map(p => getWaitingTileKinds(p.hand.map(t => t.tile), winningMelds(p.melds)).length > 0);
  const payments: SettlementPayment[] = [];
  const after = [...match.points] as [number,number,number,number];
  const transfer = (payerId: PlayerId, recipientId: PlayerId, basePoints: number, honbaPoints: number, notenPoints = 0) => {
    const points = basePoints + honbaPoints + notenPoints;
    if (payerId === recipientId || !ids.includes(payerId) || !ids.includes(recipientId) ||
      ![basePoints,honbaPoints,notenPoints].every(p => Number.isSafeInteger(p) && p >= 0) || points <= 0) throw new RangeError('Invalid payment');
    payments.push({payerId,recipientId,basePoints,honbaPoints,notenPoints,points});
    after[payerId] -= points; after[recipientId] += points;
  };
  const winners = win ? win.winMethod === 'ron' ? win.winners : [win] : [];
  if (win) {
    if (!winners.length || new Set(winners.map(w=>w.winnerId)).size !== winners.length) throw new RangeError('Invalid winners');
    for (const winner of winners) {
      const payers = new Set<PlayerId>();
      for (const payment of winner.payments) {
        if (payers.has(payment.playerId) || (win.winMethod === 'ron' && payment.playerId !== win.discarderId)) throw new RangeError('Duplicate or invalid payer');
        payers.add(payment.playerId);
        transfer(payment.playerId,winner.winnerId,payment.points,match.honba*(win.winMethod === 'ron' ? 300 : 100));
      }
      if (payers.size !== (win.winMethod === 'ron' ? 1 : 3) || winner.payments.reduce((sum,p)=>sum+p.points,0) !== winner.totalPoints) throw new RangeError('Incomplete payments');
    }
  } else {
    const ready = ids.filter(id=>tenpai![id]), notReady = ids.filter(id=>!tenpai![id]);
    if (ready.length && notReady.length) for (const payer of notReady) for (const recipient of ready) transfer(payer,recipient,0,0,3000/(ready.length*notReady.length));
  }
  let deposits: RoundSettlement['deposits'] = null;
  if (win && match.depositSticks) {
    const recipientId = win.winMethod === 'tsumo' ? win.winnerId : [...winners].sort((a,b)=>
      (a.winnerId-win.discarderId+4)%4-(b.winnerId-win.discarderId+4)%4)[0].winnerId;
    deposits = {recipientId,points:match.depositSticks*1000}; after[recipientId] += deposits.points;
  }
  const repeat = win ? winners.some(w=>w.winnerId===match.dealerId) : tenpai![match.dealerId];
  const matchEnded = !repeat && match.roundNumber === 4;
  const next = matchEnded ? null : { roundNumber: match.roundNumber + Number(!repeat),
    dealerId: repeat ? match.dealerId : ((match.dealerId+1)%4) as PlayerId,
    honba: !win || repeat ? match.honba+1 : 0 };
  const freeze = <T extends object>(value: T): T => Object.freeze(value);
  const settlement: RoundSettlement = freeze({reason: win?.winMethod ?? 'draw', roundNumber:match.roundNumber,
    dealerId:match.dealerId,honba:match.honba,before:freeze([...match.points]) as Points,
    payments:freeze(payments.map(freeze)),deposits:deposits && freeze(deposits),tenpai:tenpai && freeze(tenpai),
    deltas:freeze(after.map((p,id)=>p-match.points[id])) as unknown as Points,after:freeze(after),next:next && freeze(next),matchEnded});
  const settled: MatchState = {...match,points:settlement.after,depositSticks:win ? 0 : match.depositSticks,
    lastSettlement:settlement,status:matchEnded ? 'match-ended' : 'round-ended'};
  assertPointConservation(settled);
  return settled;
}
export function updateMatchGame(match: MatchState, game: GameState): MatchState {
  if (match.status !== 'playing') return match;
  // A declaration resolution belongs to the current window, never an old event.
  if (game.pendingRiichi && game.pendingRiichi !== match.game.pendingRiichi) return match;
  return settleRound(resolvePendingRiichi({...match,game}));
}
export function nextRound(match: MatchState, create: (dealerId: PlayerId)=>GameState = id=>startGame(Math.random,id)): MatchState {
  if (match.status !== 'round-ended' || !match.lastSettlement?.next) return match;
  const next = match.lastSettlement.next;
  const game = create(next.dealerId);
  if (game.dealerId !== next.dealerId) throw new RangeError('Wrong dealer for next round');
  return {...match,...next,game,status:'playing',lastSettlement:null};
}
export function rankPlayers(match: MatchState) {
  return ids.map(playerId=>({playerId,points:match.points[playerId]})).sort((a,b)=>b.points-a.points || a.playerId-b.playerId)
    .map((player,index)=>({...player,rank:index+1}));
}
