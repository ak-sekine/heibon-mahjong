import type { MatchState } from '../model/match.ts';
import { rankPlayers } from '../game/match.ts';
import { createTileElement } from './tile-svg.ts';
import { renderDepositSticks } from './deposit-sticks.ts';
const names = ['自分','CPU1','CPU2','CPU3'];
const renderedSettlements = new WeakMap<HTMLElement, MatchState['lastSettlement']>();
export function renderMatch(match: MatchState): void {
  const round=document.querySelector('#table-round');
  if(round) round.textContent=`東${match.roundNumber}局 ${match.honba}本場\n供託${match.depositSticks}本`;
  const deposits = document.querySelector<HTMLElement>('#deposit-sticks');
  if (deposits) renderDepositSticks(deposits, match.depositSticks);
  const panel = document.querySelector<HTMLElement>('#match-result')!;
  const button = document.querySelector<HTMLButtonElement>('#next-round')!;
  button.hidden = match.status !== 'round-ended';
  button.disabled = button.hidden;
  if (renderedSettlements.has(panel) && renderedSettlements.get(panel) === match.lastSettlement) return;
  renderedSettlements.set(panel, match.lastSettlement);
  panel.hidden = !match.lastSettlement;
  panel.replaceChildren();
  const result = match.lastSettlement;
  if (!result) return;
  const text = (tag: string, textContent: string) => Object.assign(document.createElement(tag),{textContent});
  panel.append(text('h2',`東${result.roundNumber}局 ${result.honba}本場 ${result.reason === 'four-kans' ? '四開槓・途中流局（罰符なし）' : result.reason === 'draw' ? '流局！' : '点棒精算'}`));
  if (result.tenpai) {
    for (const player of match.game.players) {
      panel.append(text('p',`${names[player.id]}：${result.tenpai[player.id] ? 'テンパイ' : 'ノーテン'}`));
      const hand = document.createElement('ol'); hand.className = 'winning-hand'; hand.setAttribute('aria-label',`${names[player.id]}の流局手牌`);
      for (const tile of player.hand) { const item = document.createElement('li'); item.append(createTileElement(tile.tile)); hand.append(item); }
      panel.append(hand);
    }
    panel.append(text('p','ノーテン罰符（合計3,000点・0人／4人テンパイでは移動なし）'));
  }
  for (const payment of result.payments) panel.append(text('p',`${names[payment.payerId]} → ${names[payment.recipientId]} ${payment.points.toLocaleString('ja-JP')}点（基本${payment.basePoints}点・本場${payment.honbaPoints}点・ノーテン罰符${payment.notenPoints}点）`));
  if (result.deposits) panel.append(text('p',`供託：${names[result.deposits.recipientId]} ＋${result.deposits.points}点`));
  panel.append(text('h3','局終了後の持ち点'));
  for (let id=0;id<4;id++) panel.append(text('p',`${names[id]} ${result.after[id].toLocaleString('ja-JP')}点（${result.deltas[id]>=0 ? '＋' : '－'}${Math.abs(result.deltas[id]).toLocaleString('ja-JP')}点）`));
  if (result.next) panel.append(text('p',`次局：東${result.next.roundNumber}局 ${result.next.honba}本場 · 親：${names[result.next.dealerId]}`));
  if (result.matchEnded) {
    panel.append(text('h2','東風戦終了'));
    const ranking = document.createElement('ol');
    for (const player of rankPlayers(match)) ranking.append(text('li',`${player.rank}位 ${names[player.playerId]} ${player.points.toLocaleString('ja-JP')}点`));
    panel.append(ranking);
  }
}
