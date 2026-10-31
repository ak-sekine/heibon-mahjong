import { renderMelds } from './melds.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import { uraDoraIndicators } from '../game/dora.ts';
import { ordinaryTile } from '../model/tile.ts';
import type { FuEntry } from '../analysis/fu.ts';
import type { ScoreTier } from '../analysis/score.ts';
import type { GameState, PlayerId, PlayerState, PhysicalTile, SeatWind, TsumoResult, RonCandidate } from '../model/game.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { createTileElement, tileLabel, wrapRiverTileFace } from './tile-svg.ts';
import { canDiscard } from '../game/discard.ts';
import { exposedDoraIndicators } from '../game/dora.ts';
import { renderDoraIndicators, createResultDoraRow } from './dora.ts';
import { applyRiverLayout, applyRiverTilePlacement, calculateRiverLayout, riverPositionFor } from './river-layout.ts';
import type { RoundSettlement } from '../model/match.ts';
import { renderSeatLabel, renderWallCount } from './shared-table-components.ts';
import { renderRoundWinSummary } from './round-win-summary.ts';
import { yakuDisplayName } from './yaku-names.ts';
import { pendingDiscardTarget } from './pending-discard.ts';
import { riichiRiverReference } from './riichi-river-reference.ts';
export { yakuDisplayName } from './yaku-names.ts';

const winds: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const defaultSeatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;

function tileOrder(tile: Tile): number {
  return tile.category === 'suited' ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + HONORS.indexOf(tile.honor);
}

function renderSelf(player: PlayerState, enabled: boolean): void {
  const hand = document.querySelector<HTMLUListElement>('#player-hand')!;
  const items = [...player.hand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id)).map((physical: PhysicalTile) => {
    const item = document.createElement('li');
    item.dataset.tileId = physical.id;
    item.append(tileButton(physical, enabled && !player.riichi));
    return item;
  });
  if (player.drawnTile) {
    const item = document.createElement('li');
    item.className = 'drawn-tile';
    item.dataset.tileId = player.drawnTile.id;
    item.append(tileButton(player.drawnTile, enabled));
    items.push(item);
  }
  hand.replaceChildren(...items);
  hand.dataset.hasDrawn = String(player.drawnTile !== null);
}

function tileButton(physical: PhysicalTile, enabled: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile-choice ui-button ui-button--a';
  button.dataset.tileId = physical.id;
  button.disabled = !enabled;
  button.setAttribute('aria-label', tileLabel(physical.tile));
  button.setAttribute('aria-pressed', 'false');
  const svg = createTileElement(physical.tile);
  svg.setAttribute('aria-hidden', 'true');
  button.append(svg);
  return button;
}

export function renderTable(game: GameState, points?: readonly number[], settlement: RoundSettlement | null = null,
  viewerSeat: PlayerId = 0, seatNames: readonly string[] = defaultSeatNames): void {
  const pendingDiscard = pendingDiscardTarget(game);
  // Validate every river before touching the current DOM. A malformed
  // declaration reference must leave the prior frame intact and be reported by
  // the caller, rather than rendering a half-updated table.
  const riverLayouts = new Map(game.players.map(player => {
    if (player.riichi && !player.riichi.declarationTileId) {
      throw new RangeError(`Riichi declaration tile reference is missing for player ${player.id}`);
    }
    const declaration = riichiRiverReference(
      player.id, player.river, player.riichi?.declarationTileId,
      game.players.flatMap(owner => (owner.melds ?? []).map(meld => ({
        ownerSeat: owner.id, type: meld.type, calledTileId: meld.calledTileId, fromPlayerId: meld.fromPlayerId, tiles: meld.tiles,
      }))), player.discardHistory,
    );
    if (declaration.state === 'inconsistent') {
      throw new RangeError(`Riichi declaration tile is missing from player ${player.id}'s river`);
    }
    return [player.id, calculateRiverLayout(riverPositionFor(viewerSeat, player.id), player.river.length, declaration.index)] as const;
  }));
  renderWinResult(game, settlement, seatNames);
  renderRoundSummary(game, settlement, seatNames);
  const winningResults = game.winResult
    ? game.winResult.winMethod === 'ron' ? game.winResult.winners : [game.winResult]
    : [];
  const winnersById = new Map(winningResults.map(result => [result.winnerId, result]));
  const revealUra = game.phase === 'won' && (game.winResult?.winMethod === 'ron'
    ? game.winResult.winners.some(winner => Boolean(game.players[winner.winnerId].riichi))
    : Boolean(game.winResult && game.players[game.winResult.winnerId].riichi));
  renderDoraIndicators(document.querySelector<HTMLElement>('#dora-indicators')!, exposedDoraIndicators(game), revealUra ? uraDoraIndicators(game) : []);
  for (const player of game.players) {
    const id: PlayerId = player.id;
    const winningResult = winnersById.get(id);
    const publicRonTileCount = player.control === 'cpu' && winningResult?.winMethod === 'ron' ? 1 : 0;
    const count = player.hand.length + Number(player.drawnTile !== null) + publicRonTileCount;
    const displayId = (id - viewerSeat + 4) % 4;
    const label = document.querySelector<HTMLElement>(`#label-${displayId}`)!;
    const section = document.querySelector<HTMLElement>(`.seat[data-player-id="${displayId}"]`);
    if (section) section.setAttribute('aria-label', `${seatNames[id]}の席`);
    renderSeatLabel(label, {
      name: seatNames[id],
      wind: player.wind,
      points: points?.[id] ?? 25000,
      isDealer: game.dealerId === id,
      isSelf: id === viewerSeat,
      isActive: game.phase !== 'wall-exhausted' && game.phase !== 'won' && game.turnPlayerId === id,
      displayOrder: displayId,
      isRiichi: Boolean(player.riichi),
      isConnected: true,
    });
    if (id === viewerSeat) {
      renderSelf(player, canDiscard(game, viewerSeat));
      if (settlement?.reason === 'kyuushu-kyuuhai' && game.abortiveDrawPlayerId === id) {
        renderRevealedOwnHand(document.querySelector<HTMLUListElement>('#player-hand')!, player);
      }
    }
    else {
      const backHand = document.querySelector<HTMLElement>(`.concealed-hand[data-player-id="${displayId}"]`);
      if (backHand) {
        if (settlement?.reason === 'kyuushu-kyuuhai' && game.abortiveDrawPlayerId === id) {
          renderPublicCpuDrawHand(backHand, player, seatNames);
        } else if (winningResult && player.control === 'cpu') renderPublicCpuHand(backHand, game, winningResult, seatNames);
        else if (player.control === 'cpu' && settlement?.reason === 'draw' && settlement.tenpai?.[id]) {
          renderPublicCpuDrawHand(backHand, player, seatNames);
        } else {
          backHand.setAttribute('aria-label', `${seatNames[id]}の非公開手牌 ${count}枚`);
          backHand.replaceChildren(...Array.from({length:count},()=>{
            const back=document.createElement('span'); back.className='tile-back';
            back.setAttribute('aria-hidden','true'); return back;
          }));
        }
      }
    }
    const melds = document.querySelector<HTMLElement>(`.open-melds[data-player-id="${displayId}"]`);
    if (melds) renderMelds(melds, player, game, seatNames);
    const river = document.querySelector<HTMLElement>(`.river[data-player-id="${displayId}"]`)!;
    river.setAttribute('aria-label', `${seatNames[id]}の河`);
    const layout = riverLayouts.get(id)!;
    applyRiverLayout(river, layout);
    river.replaceChildren(...player.river.map((physical, index) => {
      const position = layout.placements[index];
      const item = document.createElement('div');
      item.className = pendingDiscard?.seat === id && pendingDiscard.riverIndex === index
        ? 'river-tile pending-discard-target' : 'river-tile';
      item.dataset.playerId = String(id);
      item.dataset.tileId = physical.id;
      item.dataset.riichiDeclaration = String(player.riichi?.declarationTileId === physical.id);
      applyRiverTilePlacement(item, position);
      const tile = createTileElement(physical.tile);
      if (item.dataset.riichiDeclaration === 'true') {
        const description = `${tileLabel(physical.tile)} リーチ宣言牌`;
        tile.setAttribute('aria-label', description);
        tile.querySelector('title')!.textContent = description;
      }
      item.append(wrapRiverTileFace(tile));
      return item;
    }));
  }
  renderWallCount(document.querySelector<HTMLElement>('#wall-count')!, {
    liveWallCount: game.liveWall.length,
    deadWallCount: game.deadWall.length,
  });
}

/** Tile selection rendering never changes GameState or rebuilds focused tile buttons. */
export function renderSelection(game: GameState, selectedTileId: string | null, progressing = false, viewerSeat: PlayerId = 0): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#player-hand button'))) {
    button.setAttribute('aria-pressed', String(button.dataset.tileId === selectedTileId));
    button.disabled = isForbiddenDiscard(game.players[viewerSeat],button.dataset.tileId!) || progressing || !canDiscard(game, viewerSeat) || Boolean(game.players[viewerSeat].riichi && button.dataset.tileId !== game.players[viewerSeat].drawnTile?.id);
  }
}

function renderRoundSummary(game: GameState, settlement: RoundSettlement | null, seatNames: readonly string[]): void {
  const summary = document.querySelector<HTMLElement>('#round-result-summary');
  if (!summary) return;
  summary.replaceChildren();
  const text = (tag: string, textContent: string, className?: string) => {
    const node = Object.assign(document.createElement(tag), { textContent });
    if (className) node.className = className;
    return node;
  };
  if ((settlement?.reason === 'ron' || settlement?.reason === 'tsumo') && game.phase === 'won' && game.winResult) {
    summary.hidden = false;
    const winners = game.winResult.winMethod === 'ron' ? game.winResult.winners : [game.winResult];
    for (const result of winners) {
      const player = game.players[result.winnerId];
      const settledPayments = settlement?.payments.filter(payment => payment.recipientId === result.winnerId) ?? [];
      const depositPoints = settlement?.deposits?.recipientId === result.winnerId ? settlement.deposits.points : 0;
      const receivedPoints = result.yakumanCount > 0 && settledPayments.length
        ? settledPayments.reduce((sum, payment) => sum + payment.points, 0) + depositPoints
        : result.totalPoints;
      renderRoundWinSummary(summary, [{
        winnerName: seatNames[player.id],
        method: result.winMethod,
        han: result.totalHanIncludingDora,
        fu: result.fu,
        yakumanCount: result.yakumanCount,
        points: receivedPoints,
        yaku: result.candidate.yaku.map(entry => entry.id),
        doraCounts: { normal: result.doraCount, ura: result.uraDoraCount, red: result.redDoraCount },
      }]);
    }
    return;
  }
  if (settlement?.reason === 'draw' && settlement.tenpai) {
    summary.hidden = false;
    const ready = settlement.tenpai.flatMap((isTenpai, id) => isTenpai ? [seatNames[id]] : []);
    summary.append(text('p', `${settlement.roundWind === 'south' ? '南' : '東'}${settlement.roundNumber}局 ${settlement.honba}本場・流局`, 'round-summary-winner'));
    summary.append(text('p', `テンパイ：${ready.length === 0 ? 'なし' : ready.join('、')}`, 'round-summary-tenpai'));
    return;
  }
  if (settlement?.reason === 'nagashi-mangan') {
    summary.hidden = false;
    const winners = settlement.nagashiManganWinners ?? [];
    summary.append(text('p', '流し満貫', 'round-summary-winner'));
    summary.append(text('p', `成立：${winners.map(id => seatNames[id]).join('・')}`, 'round-summary-tenpai'));
    summary.append(text('p', `${settlement.honba}本場 · ${settlement.deposits ? `供託 ${settlement.deposits.points.toLocaleString('ja-JP')}点は${seatNames[settlement.deposits.recipientId]}へ` : '供託なし'}`, 'round-summary-payments'));
    for (const payment of settlement.payments) {
      summary.append(text('p', `${seatNames[payment.payerId]} → ${seatNames[payment.recipientId]} ${payment.points.toLocaleString('ja-JP')}点（満貫${payment.basePoints}点・本場${payment.honbaPoints}点）`, 'round-summary-payments'));
    }
    summary.append(text('p', winners.includes(settlement.dealerId) ? '親の流し満貫：親連荘' : '親の流し満貫なし：親交代', 'round-summary-next'));
    return;
  }
  const abortiveLabels = {
    'four-kans': '途中流局（四開槓）',
    'kyuushu-kyuuhai': '途中流局（九種九牌）',
    'four-winds': '途中流局（四風連打）',
    'four-riichi': '途中流局（四家立直）',
  } as const;
  if (settlement && settlement.reason in abortiveLabels) {
    summary.hidden = false;
    summary.append(text('p', abortiveLabels[settlement.reason as keyof typeof abortiveLabels], 'round-summary-winner'));
    return;
  }
  summary.hidden = true;
}

function winningPhysicalTile(game: GameState, result: TsumoResult | RonCandidate): PhysicalTile {
  if (result.winMethod === 'tsumo') {
    const tile = game.players[result.winnerId].drawnTile;
    if (tile?.id === result.winningTileId) return tile;
  } else if (game.winResult?.winMethod === 'ron') {
    if (game.winResult.winningTile?.id === result.winningTileId) return game.winResult.winningTile;
    const tile = game.players[result.discarderId].river.find(candidate => candidate.id === result.winningTileId);
    if (tile) return tile;
  }
  throw new RangeError('Missing physical winning tile');
}

function renderPublicCpuHand(container: HTMLElement, game: GameState, result: TsumoResult | RonCandidate, seatNames: readonly string[]): void {
  const player = game.players[result.winnerId];
  const winningTile = winningPhysicalTile(game, result);
  const concealedTiles = [...player.hand]
    .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
  // The confirmed winning tile is a current draw for tsumo, or the existing
  // physical discard for ron. Rendering adds no tile to GameState.
  renderRevealedCpuHand(container, player, [...concealedTiles, winningTile], seatNames, result.winningTileId);
}

function renderPublicCpuDrawHand(container: HTMLElement, player: PlayerState, seatNames: readonly string[]): void {
  const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
  renderRevealedCpuHand(container, player, tiles, seatNames);
}

function renderRevealedOwnHand(container: HTMLUListElement, player: PlayerState): void {
  const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
  container.setAttribute('aria-label', `自分の公開手牌 ${tiles.map(tile => tileLabel(tile.tile)).join('・')}`);
  container.replaceChildren(...tiles.map(physical => {
    const item = document.createElement('li');
    const tile = document.createElement('span');
    tile.className = 'revealed-tile';
    tile.setAttribute('aria-hidden', 'true');
    tile.append(createTileElement(physical.tile));
    item.append(tile);
    return item;
  }));
}

function renderRevealedCpuHand(container: HTMLElement, player: PlayerState, tiles: readonly PhysicalTile[], seatNames: readonly string[], winningTileId?: string): void {
  container.setAttribute('aria-label', `${seatNames[player.id]}の公開手牌 ${tiles.map(tile => tileLabel(tile.tile)).join('・')}`);
  container.replaceChildren(...tiles.map(physical => {
    const tile = document.createElement('span');
    tile.className = physical.id === winningTileId ? 'revealed-tile winning-tile' : 'revealed-tile';
    tile.setAttribute('aria-hidden', 'true');
    tile.append(createTileElement(physical.tile));
    return tile;
  }));
}

const renderedWins = new WeakMap<HTMLElement, GameState['winResult']>();
function renderWinResult(game: GameState, settlement: RoundSettlement | null, seatNames: readonly string[]): void {
  const panel = document.querySelector<HTMLElement>('#win-result')!;
  const win = game.winResult;
  if (renderedWins.has(panel) && renderedWins.get(panel) === win) return;
  renderedWins.set(panel, win);
  panel.hidden = !win;
  panel.replaceChildren();
  if (!win) return;
  for (const result of win.winMethod === 'ron' ? win.winners : [win]) {
    const section = document.createElement('section');
    section.className = 'winner-result';
    section.dataset.winnerId = String(result.winnerId);
    panel.append(section);
    const text = (tag: string, textContent: string) => Object.assign(document.createElement(tag), { textContent });
    const player = game.players[result.winnerId];
    section.append(text('h2', result.winMethod === 'ron' ? 'ロン和了！' : 'ツモ和了！'));
    section.append(text('p', `${result.winMethod === 'ron' ? '和了者：' : ''}${seatNames[player.id]}（${winds[player.wind]}）`));
    if (result.winMethod === 'ron') {
      const discarder = game.players[result.discarderId];
      section.append(text('p', `放銃者：${seatNames[discarder.id]}（${winds[discarder.wind]}）`));
    }
    {
      section.append(text('p', '和了手牌：'));
      const hand = document.createElement('ol');
      hand.className = 'winning-hand';
      hand.setAttribute('aria-label', '和了手牌');
      const tiles = [...player.hand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
      const winningTile = winningPhysicalTile(game, result);
      for (const physical of [...tiles, winningTile]) {
        const item = document.createElement('li');
        if (physical.id === result.winningTileId) item.className = 'winning-draw';
        item.append(createTileElement(physical.tile));
        hand.append(item);
      }
      section.append(hand);
      if(player.melds?.length) {
        section.append(text('p','公開副露面子：'));
        const open=document.createElement('div');open.className='result-melds';renderMelds(open,player,undefined,seatNames);section.append(open);
      }
    }
    section.append(text('p', '今回対応している役の判定結果'));
    const list = document.createElement('ul');
    for (const yaku of result.candidate.yaku) list.append(text('li',
      `${yakuDisplayName(yaku.id)} ${yaku.yakuman > 0 ? `${yaku.yakuman}役満` : `${yaku.han}翻`}`));
    section.append(list);
    if (result.yakumanCount > 0) {
      section.append(text('p', `役満：${result.yakumanCount}役満`));
    } else {
      section.append(text('p', `役合計：${result.yakuHan}翻`));
      const bonuses = document.createElement('div');
      bonuses.className = 'win-bonuses';
      bonuses.append(text('p', `通常ドラ：${result.doraCount}枚（${result.doraHan}翻）`));
      bonuses.append(text('p', `裏ドラ：${result.uraDoraCount}枚（${result.uraDoraHan}翻）`));
      bonuses.append(text('p', `赤ドラ：${result.redDoraCount}枚（${result.redDoraHan}翻）`));
      section.append(bonuses);
      section.append(text('p', `合計：${result.totalHanIncludingDora}翻`));
    }
    section.append(createResultDoraRow(exposedDoraIndicators(game), false));
    // Read hidden indicators only for a confirmed winner with established riichi.
    if (game.phase === 'won' && player.riichi) {
      section.append(createResultDoraRow(uraDoraIndicators(game), true));
    }
    if (result.fu !== null) section.append(text('p', `符：${result.fu}符`));
    const tier = scoreTierNames[result.scoreTier];
    const method = `${result.winnerId === game.dealerId ? '親' : '子'}の${result.winMethod === 'ron' ? 'ロン' : 'ツモ'}`;
    const settledPayments = settlement?.payments.filter(payment => payment.recipientId === result.winnerId) ?? [];
    const depositPoints = settlement?.deposits?.recipientId === result.winnerId ? settlement.deposits.points : 0;
    const receivedPoints = result.yakumanCount > 0 && settledPayments.length
      ? settledPayments.reduce((sum, payment) => sum + payment.points, 0) + depositPoints
      : result.totalPoints;
    const score = text('p', `獲得点数：${tier ? `${tier} ` : ''}${receivedPoints}点（${method}）`);
    score.className = 'win-score';
    section.append(score, text('p', '支払い：'));
    const payments = document.createElement('ul');
    payments.className = 'win-payments';
    if (result.yakumanCount > 0 && settledPayments.length) {
      for (const payment of settledPayments) payments.append(text('li',
        `${seatNames[payment.payerId]}（${payment.payerId === game.dealerId ? '親' : '子'}） → ${seatNames[result.winnerId]} ${payment.points}点（基本${payment.basePoints}点＋本場${payment.honbaPoints}点）`));
    } else {
      for (const payment of result.payments) payments.append(text('li',
        `${seatNames[payment.playerId]}（${payment.playerId === game.dealerId ? '親' : '子'}） → ${seatNames[result.winnerId]} ${payment.points}点`));
    }
    section.append(payments);
    if (result.yakumanCount > 0 && settledPayments.length) {
      section.append(text('p', `本場：${settlement!.honba}本場`));
      if (depositPoints > 0) section.append(text('p', `供託：${depositPoints.toLocaleString('ja-JP')}点を獲得`));
    }
    section.append(text('p', game.winResult &&
      (game.winResult.winMethod === 'ron' ? game.winResult.winners : [game.winResult]).some(winner => winner.winnerId === game.dealerId)
      ? '局進行：親連荘' : '局進行：親交代'));
    if (result.fu !== null) {
      const details = document.createElement('details');
      details.className = 'fu-details';
      details.append(text('summary', '符の内訳'));
      const breakdown = document.createElement('ul');
      for (const entry of result.fuBreakdown) breakdown.append(text('li', `${fuEntryLabel(entry)}：${entry.fu}符`));
      details.append(breakdown, text('p', `切り上げ前：${result.rawFu}符`), text('p', `最終：${result.fu}符`));
      section.append(details);
    }
  }
}

const scoreTierNames: Record<ScoreTier, string> = {
  normal: '', mangan: '満貫', haneman: '跳満', baiman: '倍満', sanbaiman: '三倍満',
  'kazoe-yakuman': '数え役満', yakuman: '役満',
};
function fuEntryLabel(entry: FuEntry): string {
  switch (entry.type) {
    case 'open-ron-minimum': return '副露ロン最低符';
    case 'base': return '基本符';
    case 'menzen-ron': return '門前ロン';
    case 'tsumo': return 'ツモ';
    case 'pinfu-tsumo': return '平和ツモ（20符固定）';
    case 'seven-pairs': return '七対子（25符固定）';
    case 'kan': return `${entry.concealed?'暗カン':'明カン'}（${tileLabel(ordinaryTile(entry.tile))}）`;
    case 'triplet': return `${entry.concealed ? '暗刻' : '明刻'}（${tileLabel(ordinaryTile(entry.tile))}・${entry.terminalOrHonor ? '么九牌・字牌' : '中張牌'}）`;
    case 'pair': return `雀頭（${tileLabel(ordinaryTile(entry.tile))}${entry.dragon ? '・三元牌' : ''}${entry.seatWind ? '・自風' : ''}${entry.roundWind ? '・場風' : ''}）`;
    case 'wait': return `${({ ryanmen: '両面', shanpon: 'シャンポン', kanchan: '嵌張', penchan: '辺張', tanki: '単騎' })[entry.wait]}待ち`;
  }
}
