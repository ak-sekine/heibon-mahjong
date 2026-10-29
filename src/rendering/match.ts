import type { MatchState } from '../model/match.ts';
import { rankPlayers } from '../game/match.ts';
import { createTileElement } from './tile-svg.ts';
import { renderDepositSticks } from './deposit-sticks.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { renderRoundLabel } from './shared-table-components.ts';
const defaultNames = ['自分','CPU1','CPU2','CPU3'];
const renderedSettlements = new WeakMap<HTMLElement, MatchState['lastSettlement']>();
const abortiveNames = {
  'four-kans': '四開槓',
  'kyuushu-kyuuhai': '九種九牌',
  'four-winds': '四風連打',
  'four-riichi': '四家立直',
} as const;
function tileOrder(tile: Tile): number {
  return tile.category === 'suited' ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + HONORS.indexOf(tile.honor);
}
export function renderMatch(match: MatchState, names: readonly string[] = defaultNames): void {
  const round=document.querySelector<HTMLElement>('#table-round');
  if(round) renderRoundLabel(round, { roundWind: match.roundWind, roundNumber: match.roundNumber, honba: match.honba });
  const deposits = document.querySelector<HTMLElement>('#deposit-sticks');
  if (deposits) renderDepositSticks(deposits, match.depositSticks);
  const panel = document.querySelector<HTMLElement>('#match-result')!;
  if (renderedSettlements.has(panel) && renderedSettlements.get(panel) === match.lastSettlement) return;
  renderedSettlements.set(panel, match.lastSettlement);
  panel.hidden = !match.lastSettlement;
  panel.replaceChildren();
  const result = match.lastSettlement;
  if (!result) return;
  const text = (tag: string, textContent: string) => Object.assign(document.createElement(tag),{textContent});
  const title = result.reason === 'draw' ? '荒牌流局'
    : result.reason === 'nagashi-mangan' ? '流し満貫'
      : result.reason in abortiveNames ? `途中流局（${abortiveNames[result.reason as keyof typeof abortiveNames]}）`
        : result.reason === 'ron' ? 'ロン和了' : 'ツモ和了';
  panel.append(text('h2',`${result.roundWind === 'south' ? '南' : '東'}${result.roundNumber}局 ${result.honba}本場 ${title}`));
  if (result.reason === 'nagashi-mangan') {
    const winners = result.nagashiManganWinners ?? [];
    panel.append(text('p',`成立者：${winners.map(id=>names[id]).join('・')}`));
    panel.append(text('p',`満貫相当・${result.honba}本場（支払者1人につき100点を加算）`));
  }
  if (result.reason === 'kyuushu-kyuuhai' && match.game.abortiveDrawPlayerId !== undefined) {
    const player = match.game.players[match.game.abortiveDrawPlayerId];
    panel.append(text('p', `宣言者：${names[player.id]}`));
    const hand = document.createElement('ol');
    hand.className = 'winning-hand';
    hand.setAttribute('aria-label', `${names[player.id]}の九種九牌公開手牌`);
    const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
      .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
    for (const tile of tiles) {
      const item = document.createElement('li');
      item.append(createTileElement(tile.tile));
      hand.append(item);
    }
    panel.append(hand);
  }
  if (result.tenpai) {
    for (const player of match.game.players) {
      panel.append(text('p',`${names[player.id]}：${result.tenpai[player.id] ? 'テンパイ' : 'ノーテン'}`));
      if (result.tenpai[player.id]) {
        const hand = document.createElement('ol'); hand.className = 'winning-hand'; hand.setAttribute('aria-label',`${names[player.id]}の流局手牌`);
        const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
          .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
        for (const tile of tiles) { const item = document.createElement('li'); item.append(createTileElement(tile.tile)); hand.append(item); }
        panel.append(hand);
      }
    }
    panel.append(text('p','ノーテン罰符（合計3,000点・0人／4人テンパイでは移動なし）'));
  }
  for (const payment of result.payments) panel.append(text('p',`${names[payment.payerId]} → ${names[payment.recipientId]} ${payment.points.toLocaleString('ja-JP')}点（${result.reason === 'nagashi-mangan' ? '満貫相当' : '基本'}${payment.basePoints}点・本場${payment.honbaPoints}点${payment.notenPoints ? `・ノーテン罰符${payment.notenPoints}点` : ''}）`));
  if (result.deposits) panel.append(text('p',`供託：${names[result.deposits.recipientId]} ＋${result.deposits.points}点`));
  else if (['four-kans','kyuushu-kyuuhai','four-winds','four-riichi','draw'].includes(result.reason)) {
    panel.append(text('p',`供託：${match.depositSticks}本を次局へ持ち越し`));
  }
  panel.append(text('h3','局終了後の持ち点'));
  for (let id=0;id<4;id++) panel.append(text('p',`${names[id]} ${result.after[id].toLocaleString('ja-JP')}点（${result.deltas[id]>=0 ? '＋' : '－'}${Math.abs(result.deltas[id]).toLocaleString('ja-JP')}点）`));
  if (result.reason === 'nagashi-mangan') {
    const repeated = (result.nagashiManganWinners ?? []).includes(result.dealerId);
    panel.append(text('p', repeated ? '親：連荘' : '親：交代'));
  } else if (result.reason in abortiveNames) panel.append(text('p','親：連荘 · 本場＋1'));
  if (result.next) panel.append(text('p',`次局：${result.next.roundWind === 'south' ? '南' : '東'}${result.next.roundNumber}局 ${result.next.honba}本場 · 親：${names[result.next.dealerId]}`));
  if (result.matchEnded) {
    panel.append(text('h2', `${match.format === 'tonnan' ? '半荘戦' : '東風戦'}終了`));
    const ranking = document.createElement('ol');
    for (const player of rankPlayers(match)) ranking.append(text('li',`${player.rank}位 ${names[player.playerId]} ${player.points.toLocaleString('ja-JP')}点`));
    panel.append(ranking);
  }
}
