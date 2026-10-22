import type { FuEntry } from '../analysis/fu.ts';
import type { YakuId } from '../analysis/yaku.ts';
import { HONORS, SUITS, ordinaryTile, type Tile } from '../model/tile.ts';
import type { PublicMeld, PlayerGameView, PublicWinSummary } from './game-view.ts';
import { createResultDoraRow } from '../rendering/dora.ts';
import { createTileElement, tileLabel } from '../rendering/tile-svg.ts';
import { yakuDisplayName } from '../rendering/table.ts';

const winds = { east: '東', south: '南', west: '西', north: '北' } as const;
const abortiveNames = {
  'four-kans': '四開槓',
  'kyuushu-kyuuhai': '九種九牌',
  'four-winds': '四風連打',
  'four-riichi': '四家立直',
} as const;
const scoreTierNames = {
  normal: '', mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満',
  'kazoe-yakuman': '数え役満', yakuman: '役満',
} as const;

function text(tag: string, content: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

function tileOrder(tile: Tile): number {
  return tile.category === 'suited'
    ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1
    : 27 + HONORS.indexOf(tile.honor);
}

function playerName(view: PlayerGameView, playerId: number): string {
  const player = view.seats[playerId];
  if (player.control !== 'cpu') return player.name;
  const cpuSeats = view.seats.filter(seat => seat.control === 'cpu').sort((a, b) => a.seat - b.seat);
  return `CPU${cpuSeats.findIndex(seat => seat.seat === playerId) + 1}`;
}

function fuEntryLabel(entry: FuEntry): string {
  switch (entry.type) {
    case 'open-ron-minimum': return '副露ロン最低符';
    case 'base': return '基本符';
    case 'menzen-ron': return '門前ロン';
    case 'tsumo': return 'ツモ';
    case 'pinfu-tsumo': return '平和ツモ（20符固定）';
    case 'seven-pairs': return '七対子（25符固定）';
    case 'kan': return `${entry.concealed ? '暗カン' : '明カン'}（${tileLabel(ordinaryTile(entry.tile))}）`;
    case 'triplet': return `${entry.concealed ? '暗刻' : '明刻'}（${tileLabel(ordinaryTile(entry.tile))}・${entry.terminalOrHonor ? '么九牌・字牌' : '中張牌'}）`;
    case 'pair': return `雀頭（${tileLabel(ordinaryTile(entry.tile))}${entry.dragon ? '・三元牌' : ''}${entry.seatWind ? '・自風' : ''}${entry.roundWind ? '・場風' : ''}）`;
    case 'wait': return `${({ ryanmen: '両面', shanpon: 'シャンポン', kanchan: '嵌張', penchan: '辺張', tanki: '単騎' })[entry.wait]}待ち`;
  }
}

function renderMelds(container: HTMLElement, melds: readonly PublicMeld[], playerId: number): void {
  for (const meld of melds) {
    const group = document.createElement('div');
    group.className = 'open-meld';
    group.dataset.meldType = meld.type;
    const direction = (meld.fromPlayerId - playerId + 4) % 4;
    group.dataset.fromDirection = String(direction);
    const calledIndex = meld.type === 'chi'
      ? meld.tiles.findIndex(tile => tile?.id === meld.calledTileId)
      : meld.type === 'ankan' ? -1 : direction === 3 ? 0 : direction === 2 ? 1 : meld.tiles.length - 1;
    meld.tiles.forEach((tile, index) => {
      const item = document.createElement('span');
      if (!tile) {
        item.className = 'concealed-kan-back';
        item.setAttribute('aria-label', '裏向き牌');
      } else {
        if (tile.id === meld.calledTileId) item.classList.add('called-tile');
        const face = createTileElement(tile.tile);
        face.setAttribute('aria-hidden', 'true');
        item.append(face);
        if (meld.type === 'kakan' && tile.id === meld.calledTileId) {
          const added = meld.tiles.find(candidate => candidate?.id === meld.addedTileId);
          if (added) {
            const overlay = document.createElement('span');
            overlay.className = 'added-kan-tile';
            overlay.append(createTileElement(added.tile));
            item.append(overlay);
          }
        }
      }
      if (index === calledIndex) item.classList.add('called-tile');
      group.append(item);
    });
    container.append(group);
  }
}

function renderWin(container: HTMLElement, view: PlayerGameView, winner: PublicWinSummary): void {
  const seat = view.seats[winner.winnerId];
  const section = document.createElement('section');
  section.className = 'winner-result';
  section.dataset.winnerId = String(winner.winnerId);
  section.append(text('h2', winner.method === 'ron' ? 'ロン和了！' : 'ツモ和了！'));
  section.append(text('p', `和了者：${playerName(view, winner.winnerId)}（${winds[seat.wind]}）`));
  if (winner.method === 'ron' && winner.discarderId !== undefined) {
    const discarder = view.seats[winner.discarderId];
    section.append(text('p', `放銃者：${playerName(view, winner.discarderId)}（${winds[discarder.wind]}）`));
  }

  const handTiles = [...(seat.revealedHand ?? [])].sort((a, b) =>
    tileOrder(a.tile) - tileOrder(b.tile) || Number(a.tile.isRed) - Number(b.tile.isRed) || a.id.localeCompare(b.id));
  section.append(text('p', '和了手牌：'));
  const hand = document.createElement('ol');
  hand.className = 'winning-hand';
  hand.setAttribute('aria-label', '和了手牌');
  for (const physical of handTiles) {
    const item = document.createElement('li');
    if (physical.id === winner.winningTile.id) item.className = 'winning-draw';
    item.append(createTileElement(physical.tile));
    hand.append(item);
  }
  section.append(hand);
  if (seat.melds.length) {
    section.append(text('p', '公開副露面子：'));
    const melds = document.createElement('div');
    melds.className = 'result-melds';
    renderMelds(melds, seat.melds, winner.winnerId);
    section.append(melds);
  }

  section.append(text('p', '今回対応している役の判定結果'));
  const yakuList = document.createElement('ul');
  for (const yaku of winner.yaku) {
    const name = yakuDisplayName(yaku.id as YakuId, 'detail') || yaku.id;
    yakuList.append(text('li', `${name} ${yaku.yakuman ? '役満' : `${yaku.han}翻`}`));
  }
  section.append(yakuList);
  if (winner.yakumanCount > 0) {
    section.append(text('p', `役満：${winner.yakumanCount}役満`));
  } else {
    section.append(text('p', `役合計：${winner.yakuHan}翻`));
    const bonuses = document.createElement('div');
    bonuses.className = 'win-bonuses';
    bonuses.append(text('p', `通常ドラ：${winner.doraCounts.normal}枚（${winner.dora.normal}翻）`));
    bonuses.append(text('p', `裏ドラ：${winner.doraCounts.ura}枚（${winner.dora.ura}翻）`));
    bonuses.append(text('p', `赤ドラ：${winner.doraCounts.red}枚（${winner.dora.red}翻）`));
    section.append(bonuses, text('p', `合計：${winner.han}翻`));
  }
  section.append(createResultDoraRow(view.doraIndicators, false));
  if (seat.riichi && view.uraDoraIndicators) section.append(createResultDoraRow(view.uraDoraIndicators, true));
  if (winner.fu !== null) {
    section.append(text('p', `符：${winner.fu}符`));
    const details = document.createElement('details');
    details.className = 'fu-details';
    details.append(text('summary', '符の内訳'));
    const breakdown = document.createElement('ul');
    for (const entry of winner.fuEntries) breakdown.append(text('li', `${fuEntryLabel(entry)}：${entry.fu}符`));
    details.append(breakdown, text('p', `切り上げ前：${winner.rawFu ?? winner.fu}符`), text('p', `最終：${winner.fu}符`));
    section.append(details);
  }

  const payments = view.result!.payments.filter(payment => payment.recipientId === winner.winnerId);
  const depositPoints = view.result!.deposits?.recipientId === winner.winnerId ? view.result!.deposits.points : 0;
  const settledPoints = payments.reduce((sum, payment) => sum + payment.points, 0) + depositPoints;
  const received = settledPoints || winner.totalPoints;
  const tier = scoreTierNames[winner.scoreTier];
  const method = `${seat.isDealer ? '親' : '子'}の${winner.method === 'ron' ? 'ロン' : 'ツモ'}`;
  section.append(text('p', `獲得点数：${tier ? `${tier} ` : ''}${received.toLocaleString('ja-JP')}点（${method}）`, 'win-score'));
  section.append(text('p', '支払い：'));
  const paymentList = document.createElement('ul');
  paymentList.className = 'win-payments';
  if (payments.length) {
    for (const payment of payments) {
      paymentList.append(text('li', `${playerName(view, payment.payerId)}（${view.seats[payment.payerId].isDealer ? '親' : '子'}） → ${playerName(view, winner.winnerId)} ${payment.points.toLocaleString('ja-JP')}点（基本${payment.basePoints}点＋本場${payment.honbaPoints}点${payment.notenPoints ? `・ノーテン罰符${payment.notenPoints}点` : ''}）`));
    }
  } else {
    paymentList.append(text('li', '精算情報なし'));
  }
  section.append(paymentList);
  if (depositPoints > 0) section.append(text('p', `供託：${depositPoints.toLocaleString('ja-JP')}点を獲得`));
  section.append(text('p', payments.some(payment => payment.recipientId === view.result!.dealerId) || winner.winnerId === view.result!.dealerId
    ? '局進行：親連荘' : '局進行：親交代'));
  container.append(section);
}

export function onlineResultTitle(view: PlayerGameView): string {
  const result = view.result;
  if (!result) return '';
  if (view.status === 'match-ended' || result.matchEnded) return '東風戦終了';
  return result.reason === 'nagashi-mangan' ? '流し満貫'
    : result.reason in abortiveNames ? `途中流局（${abortiveNames[result.reason as keyof typeof abortiveNames]}）`
      : result.reason === 'draw' ? '荒牌流局'
        : result.reason === 'ron' ? 'ロン和了' : 'ツモ和了';
}

/** Render only the public, server-allowlisted result into the shared dialog. */
export function renderOnlineResultContent(container: HTMLElement, view: PlayerGameView): void {
  const result = view.result;
  container.replaceChildren();
  container.hidden = result === null;
  if (!result) return;

  for (const winner of result.winners) renderWin(container, view, winner);
  const settlement = document.createElement('section');
  settlement.className = 'online-settlement';
  settlement.append(text('h2', `東${result.roundNumber}局 ${result.honba}本場 · ${onlineResultTitle(view)}`));

  if (result.reason === 'nagashi-mangan') {
    const winners = result.nagashiManganWinners ?? [];
    settlement.append(text('p', `成立者：${winners.map(playerId => playerName(view, playerId)).join('・') || 'なし'}`));
    settlement.append(text('p', `満貫相当・${result.honba}本場（支払者1人につき100点を加算）`));
  }
  if (result.tenpai) {
    for (const seat of view.seats) {
      settlement.append(text('p', `${playerName(view, seat.seat)}：${result.tenpai[seat.seat] ? 'テンパイ' : 'ノーテン'}`));
      if (result.tenpai[seat.seat] && seat.revealedHand) {
        const hand = document.createElement('ol');
        hand.className = 'winning-hand';
        hand.setAttribute('aria-label', `${playerName(view, seat.seat)}の公開された流局手牌`);
        for (const tile of [...seat.revealedHand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id))) {
          const item = document.createElement('li');
          item.append(createTileElement(tile.tile));
          hand.append(item);
        }
        settlement.append(hand);
      }
    }
    settlement.append(text('p', 'ノーテン罰符（合計3,000点・0人／4人テンパイでは移動なし）'));
  }
  if (result.payments.length) {
    settlement.append(text('h3', '支払い'));
    const payments = document.createElement('ul');
    for (const payment of result.payments) {
      const reason = result.reason === 'nagashi-mangan' ? '満貫相当' : payment.notenPoints ? 'ノーテン罰符' : '基本';
      payments.append(text('li', `${playerName(view, payment.payerId)} → ${playerName(view, payment.recipientId)} ${payment.points.toLocaleString('ja-JP')}点（${reason}${payment.basePoints}点・本場${payment.honbaPoints}点${payment.notenPoints ? `・ノーテン罰符${payment.notenPoints}点` : ''}）`));
    }
    settlement.append(payments);
  }
  if (result.deposits) settlement.append(text('p', `供託：${playerName(view, result.deposits.recipientId)} ＋${result.deposits.points.toLocaleString('ja-JP')}点`));
  else if (['four-kans', 'kyuushu-kyuuhai', 'four-winds', 'four-riichi', 'draw'].includes(result.reason)) {
    settlement.append(text('p', `供託：${view.round.depositSticks}本を次局へ持ち越し`));
  }

  settlement.append(text('h3', '局終了後の持ち点'));
  for (const seat of view.seats) {
    const delta = result.deltas[seat.seat];
    settlement.append(text('p', `${playerName(view, seat.seat)} ${result.after[seat.seat].toLocaleString('ja-JP')}点（${delta >= 0 ? '＋' : '－'}${Math.abs(delta).toLocaleString('ja-JP')}点）`));
  }
  if (result.reason === 'nagashi-mangan') {
    settlement.append(text('p', (result.nagashiManganWinners ?? []).includes(result.dealerId) ? '親：連荘' : '親：交代'));
  } else if (result.reason in abortiveNames) settlement.append(text('p', '親：連荘 · 本場＋1'));
  if (result.next) settlement.append(text('p', `次局：東${result.next.roundNumber}局 ${result.next.honba}本場 · 親：${playerName(view, result.next.dealerId)}`));
  if (view.status === 'match-ended' || result.matchEnded) {
    settlement.append(text('h2', '東風戦終了'));
    const rankings = [...view.seats].map(seat => ({ seat, points: result.after[seat.seat] }))
      .sort((a, b) => b.points - a.points || a.seat.seat - b.seat.seat);
    const ranking = document.createElement('ol');
    rankings.forEach(({ seat, points }, index) => ranking.append(text('li', `${index + 1}位 ${playerName(view, seat.seat)} ${points.toLocaleString('ja-JP')}点`)));
    settlement.append(ranking);
  }
  container.append(settlement);
}
