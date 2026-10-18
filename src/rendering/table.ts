import { renderMelds } from './melds.ts';
import { getKanOptions } from '../game/kan.ts';
import { uniqueCallOptions } from '../ui/call-options.ts';
import { getCallOptions } from '../game/calls.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import { uraDoraIndicators } from '../game/dora.ts';
import { ordinaryTile } from '../model/tile.ts';
import type { FuEntry } from '../analysis/fu.ts';
import type { ScoreTier } from '../analysis/score.ts';
import type { GameState, PlayerId, PlayerState, PhysicalTile, SeatWind, TsumoResult, RonCandidate } from '../model/game.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';
import { canDeclareRon, getRonTile } from '../game/ron.ts';
import { canDeclareTsumo } from '../game/tsumo.ts';
import type { YakuId } from '../analysis/yaku.ts';
import { canDeclareRiichi } from '../game/riichi.ts';
import { canDeclareKyuushuKyuuhai } from '../game/special-draws.ts';
import { canDiscard } from '../game/discard.ts';
import { exposedDoraIndicators } from '../game/dora.ts';
import { renderDoraIndicators, createResultDoraRow } from './dora.ts';
import type { RoundSettlement } from '../model/match.ts';

const winds: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const seatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;
function turnLabel(game: GameState): string {
  if (game.phase === 'won') {
    const result = game.winResult!;
    return result.winMethod === 'ron'
      ? `${result.winners.map(w => seatNames[w.winnerId]).join('・')}がロン和了！ 放銃：${seatNames[result.discarderId]}`
      : `${seatNames[result.winnerId]}がツモ和了！`;
  }
  if (game.phase === 'awaiting-call') return 'ポン・チー宣言待ち';
  if (game.phase === 'awaiting-ron') return 'ロン宣言待ち';
  if (game.phase === 'wall-exhausted') return game.abortiveDraw === 'four-kans' ? '四開槓・途中流局'
    : game.abortiveDraw === 'kyuushu-kyuuhai' ? '九種九牌・途中流局'
      : game.abortiveDraw === 'four-winds' ? '四風連打・途中流局'
        : game.abortiveDraw === 'four-riichi' ? '四家立直・途中流局' : '牌山がなくなりました';
  return `${game.turnPlayerId === 0 ? 'あなた' : seatNames[game.turnPlayerId]}の手番`;
}

function previewText(tag: string, textContent: string): HTMLElement { return Object.assign(document.createElement(tag), {textContent}); }

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
  button.className = 'tile-choice';
  button.dataset.tileId = physical.id;
  button.disabled = !enabled;
  button.setAttribute('aria-label', tileLabel(physical.tile));
  button.setAttribute('aria-pressed', 'false');
  const svg = createTileElement(physical.tile);
  svg.setAttribute('aria-hidden', 'true');
  button.append(svg);
  return button;
}

export function renderTable(game: GameState, points?: readonly number[], settlement: RoundSettlement | null = null): void {
  renderWinResult(game);
  renderRoundSummary(game, settlement);
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
    const label = document.querySelector<HTMLElement>(`#label-${id}`)!;
    if (points) {
      const identity = Object.assign(document.createElement('span'), { textContent: `${seatNames[id]}（${winds[player.wind]}）${game.dealerId === id ? '親' : ''}` });
      if (player.riichi) {
        const status = previewText('span', ' リーチ');
        status.className = 'seat-status';
        identity.append(status);
      }
      const balance = Object.assign(document.createElement('span'), { textContent: `${points[id].toLocaleString('ja-JP')}点`, className: 'seat-points' });
      label.replaceChildren(identity, document.createTextNode(' '), balance);
    } else label.textContent = `${seatNames[id]} · ${winds[player.wind]} · ${count}枚${game.dealerId === id ? ' · 親' : ''}${player.riichi ? ' · リーチ' : ''}`;
    if(game.phase==='awaiting-ron' && game.ronWindow?.kind==='kakan' && game.ronWindow.kan?.playerId===id) {
      const declaration=previewText('span','加カン宣言中'); declaration.className='seat-declaration'; label.append(declaration);
    }
    label.dataset.active = String(game.phase !== 'wall-exhausted' && game.phase !== 'won' && game.turnPlayerId === id);
    if (id === 0) renderSelf(player, canDiscard(game, 0));
    else {
      const backHand = document.querySelector<HTMLElement>(`.concealed-hand[data-player-id="${id}"]`);
      if (backHand) {
        if (winningResult && player.control === 'cpu') renderPublicCpuHand(backHand, game, winningResult);
        else if (player.control === 'cpu' && settlement?.reason === 'draw' && settlement.tenpai?.[id]) {
          renderPublicCpuDrawHand(backHand, player);
        } else {
          backHand.setAttribute('aria-label', `${seatNames[id]}の非公開手牌 ${count}枚`);
          backHand.replaceChildren(...Array.from({length:count},()=>{
            const back=document.createElement('span'); back.className='tile-back';
            back.setAttribute('aria-hidden','true'); return back;
          }));
        }
      }
    }
    const melds = document.querySelector<HTMLElement>(`.open-melds[data-player-id="${id}"]`);
    if (melds) renderMelds(melds, player, game);
    const river = document.querySelector<HTMLElement>(`.river[data-player-id="${id}"]`)!;
    const side = id === 1 || id === 3;
    const declarationIndex = player.riichi
      ? player.river.findIndex(tile => tile.id === player.riichi!.declarationTileId)
      : -1;
    // Lay out face-sized cells independently: the sideways declaration has
    // the same tile dimensions as every other face after its rotation.
    river.style.display = 'block';
    river.style.gridTemplateColumns = '';
    river.style.gridTemplateRows = '';
    const gap = 1;
    river.style.width = side
      ? 'calc(var(--river-tile-height) * 3 + 2px)'
      : 'calc(var(--river-tile-width) * 6 + 5px)';
    river.style.height = side
      ? 'calc(var(--river-tile-width) * 6 + 5px)'
      : 'calc(var(--river-tile-height) * 3 + 2px)';
    const positions = player.river.map((physical,index)=>{
      const row=Math.floor(index/6),column=index%6;
      const screenRow=id===1?5-column:id===3?column:id===2?2-row:row;
      const screenColumn=id===1?row:id===3?2-row:id===2?5-column:column;
      const declaration=index===declarationIndex;
      const widthVar=side?(declaration?'--river-tile-width':'--river-tile-height'):(declaration?'--river-tile-height':'--river-tile-width');
      const heightVar=side?(declaration?'--river-tile-height':'--river-tile-width'):(declaration?'--river-tile-width':'--river-tile-height');
      return {physical,index,row:screenRow,column:screenColumn,declaration,widthVar,heightVar};
    });
    // All 18 slots have a fixed position, including slots not discarded into yet.
    // Without their reserved size, rotated seats collapse toward the screen's
    // top-left instead of starting at the top-left of each player's viewpoint.
    const rowCount = side ? 6 : 3;
    const columnCount = side ? 3 : 6;
    // Reserve all 18 slots, including empty positions. Expand only the track
    // along a player's six-discard line; other rows and columns keep their
    // regular tile spacing.
    const cellWidths = Array.from({ length: rowCount }, () =>
      Array<string>(columnCount).fill(side ? '--river-tile-height' : '--river-tile-width'));
    const cellHeights = Array.from({ length: rowCount }, () =>
      Array<string>(columnCount).fill(side ? '--river-tile-width' : '--river-tile-height'));
    for (const position of positions) {
      // The rotated declaration needs a wider track in top/bottom rivers or a
      // taller track in side rivers. Keep that correction in its own line.
      if (position.widthVar === '--river-tile-height') cellWidths[position.row][position.column] = position.widthVar;
      if (position.heightVar === '--river-tile-height') cellHeights[position.row][position.column] = position.heightVar;
    }
    const offset = (variables: readonly string[]) => {
      const widthTiles = variables.filter(value => value === '--river-tile-width').length;
      const heightTiles = variables.length - widthTiles;
      return `calc(var(--river-tile-width) * ${widthTiles} + var(--river-tile-height) * ${heightTiles} + ${variables.length * gap}px)`;
    };
    const trackSize = (variables: readonly string[]) => {
      const widthTiles = variables.filter(value => value === '--river-tile-width').length;
      const heightTiles = variables.length - widthTiles;
      return `calc(var(--river-tile-width) * ${widthTiles} + var(--river-tile-height) * ${heightTiles} + ${Math.max(0, variables.length - 1) * gap}px)`;
    };
    const centerLine = (tracks: readonly string[], base: string) =>
      `calc((${base} - ${trackSize(tracks)}) * .5)`;
    const horizontalLineOffsets = side
      ? Array<string>(rowCount).fill('0px')
      : cellWidths.map(row => centerLine(row, 'calc(var(--river-tile-width) * 6 + 5px)'));
    const verticalLineOffsets = side
      ? Array.from({ length: columnCount }, (_, column) =>
        centerLine(cellHeights.map(row => row[column]), 'calc(var(--river-tile-width) * 6 + 5px)'))
      : Array<string>(columnCount).fill('0px');
    const centerInTrack = (track: string, face: string) => track === face
      ? '0px'
      : `calc((var(${track}) - var(${face})) * .5)`;
    river.replaceChildren(...player.river.map((physical, index) => {
      const position=positions[index];
      const item = document.createElement('div');
      item.className = 'river-tile';
      item.dataset.tileId = physical.id;
      item.dataset.riichiDeclaration = String(player.riichi?.declarationTileId === physical.id);
      item.style.gridRow=String(position.row+1);
      item.style.gridColumn=String(position.column+1);
      item.style.position='absolute';
      item.style.width=`var(${position.widthVar})`;
      item.style.height=`var(${position.heightVar})`;
      item.style.left = `calc(${horizontalLineOffsets[position.row]} + ${offset(cellWidths[position.row].slice(0, position.column))} + ${centerInTrack(cellWidths[position.row][position.column], position.widthVar)})`;
      item.style.top = `calc(${verticalLineOffsets[position.column]} + ${offset(cellHeights.slice(0, position.row).map(row => row[position.column]))} + ${centerInTrack(cellHeights[position.row][position.column], position.heightVar)})`;
      const tile = createTileElement(physical.tile);
      if (item.dataset.riichiDeclaration === 'true') {
        const description = `${tileLabel(physical.tile)} リーチ宣言牌`;
        tile.setAttribute('aria-label', description);
        tile.querySelector('title')!.textContent = description;
      }
      item.append(tile);
      return item;
    }));
  }
  document.querySelector<HTMLElement>('#wall-count')!.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `山${game.liveWall.length}枚` }),
    Object.assign(document.createElement('span'), { textContent: `王牌 ${game.deadWall.length}枚` }),
  );
}

/** Selection rendering never changes GameState or rebuilds focused tile buttons. */
export function renderSelection(game: GameState, selectedTileId: string | null, progressing = false, points = 25000): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#player-hand button'))) {
    button.setAttribute('aria-pressed', String(button.dataset.tileId === selectedTileId));
    button.disabled = isForbiddenDiscard(game.players[0],button.dataset.tileId!) || progressing || !canDiscard(game, 0) || Boolean(game.players[0].riichi && button.dataset.tileId !== game.players[0].drawnTile?.id);
  }
  const kanOptions=progressing?[]:getKanOptions(game,0);
  const kanButton=document.querySelector<HTMLButtonElement>('#kan');
  if(kanButton) {kanButton.hidden=!kanOptions.length;kanButton.disabled=!kanOptions.length;}
  const kyuushuButton=document.querySelector<HTMLButtonElement>('#kyuushu-kyuuhai');
  if(kyuushuButton) {
    const available=!progressing && game.players[0].control==='human' && canDeclareKyuushuKyuuhai(game,0);
    kyuushuButton.hidden=!available;
    kyuushuButton.disabled=!available;
  }
  const kanPanel=document.querySelector<HTMLElement>('#kan-controls');
  if(kanPanel) {
    if(!kanOptions.length) kanPanel.hidden=true;
    document.querySelector('#kan-options')!.replaceChildren(...kanOptions.map(option=>{
      const b=document.createElement('button');b.type='button';b.dataset.kanId=option.id;
      b.append(document.createTextNode(option.meld.type==='ankan'?'暗カン':'加カン'));
      for(const t of option.meld.tiles) b.append(createTileElement(t.tile));
      return b;
    }));
  }
  const calls = document.querySelector<HTMLElement>('#call-controls');
  if (calls) {
    const options = game.phase === 'awaiting-call' ? uniqueCallOptions(getCallOptions(game,0)) : [];
    calls.hidden = !options.length;
    const choices = document.querySelector<HTMLElement>('#call-options')!;
    choices.replaceChildren(...options.map(option => {
      const button = document.createElement('button'); button.type='button'; button.dataset.callId=option.id;
      const name = option.type==='pon' ? 'ポン' : option.type==='daiminkan'?'大明カン':'チー';
      button.setAttribute('aria-label', `${name}：${option.tiles.map(t=>tileLabel(t.tile)).join('・')}（${option.handTileIds.join('、')}）`);
      button.append(document.createTextNode(name));
      for (const tile of option.tiles) button.append(createTileElement(tile.tile));
      return button;
    }));
  }
  const ron = document.querySelector<HTMLElement>('#ron-controls')!;
  const wasHidden = ron.hidden;
  const canRon = game.players[0].control === 'human' && canDeclareRon(game, 0);
  ron.hidden = !canRon;
  const tile = getRonTile(game);
  const status = document.querySelector<HTMLElement>('#ron-status')!;
  const target = document.querySelector<HTMLElement>('#ron-target');
  if (canRon && tile) {
    const kind = game.ronWindow?.kind;
    const action = kind === 'kakan' ? 'を加カンしようとしています'
      : kind === 'ankan' ? 'で暗カンを宣言しました' : 'を捨てました';
    status.textContent = `${seatNames[game.ronWindow!.discarderId]}が${tileLabel(tile.tile)}${action}`;
    if (target) {
      const svg = createTileElement(tile.tile);
      // The status already names the exact (including red) face once.
      svg.setAttribute('aria-hidden', 'true');
      target.replaceChildren(svg, previewText('p', kind === 'kakan' ? '追加する牌・この牌で槍槓できます'
        : kind === 'ankan' ? 'この牌で槍槓できます' : 'この牌でロンできます'));
    }
  } else {
    status.textContent = '';
    target?.replaceChildren();
    if (document.activeElement === document.querySelector('#ron') || document.activeElement === document.querySelector('#pass-ron')) {
      (document.activeElement as HTMLElement).blur();
    }
  }
  document.querySelector<HTMLButtonElement>('#ron')!.disabled = !canRon;
  document.querySelector<HTMLButtonElement>('#pass-ron')!.disabled = !canRon;
  if (canRon && wasHidden) document.querySelector<HTMLButtonElement>('#ron')!.focus({ preventScroll: true });
  document.querySelector<HTMLElement>('.discard-controls')!.classList.toggle('ron-pending', canRon);
  document.querySelector<HTMLElement>('.discard-controls')!.classList.toggle('game-ended', game.phase === 'won');
  const player = game.players[0];
  const selected = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .find(tile => tile.id === selectedTileId);
  const discard = document.querySelector<HTMLButtonElement>('#discard')!;
  discard.textContent = player.riichi ? 'ツモ切り' : '打牌する';
  discard.disabled = progressing || (!player.riichi && !selected) || !canDiscard(game, 0);
  const riichi = document.querySelector<HTMLButtonElement>('#riichi');
  if (riichi) {
    riichi.disabled = progressing || !selected || !canDeclareRiichi(game, 0, selected.id, points);
  }
  document.querySelector<HTMLButtonElement>('#tsumo')!.disabled = progressing || game.players[0].control !== 'human' || !canDeclareTsumo(game, 0);
  document.querySelector<HTMLElement>('#selection-status')!.textContent = game.phase === 'wall-exhausted'
    ? '牌山がなくなりました'
    : !canDiscard(game, 0) ? turnLabel(game)
    : player.riichi ? 'リーチ中：ツモ和了 または ツモ切り'
    : selected ? `選択：${tileLabel(selected.tile)}` : 'あなたの手番：牌を選択して「打牌する」で確定';
}

const yakuNames: Record<YakuId, string> = {
  rinshan:'嶺上開花', chankan:'槍槓', sankantsu:'三槓子', suukantsu:'四槓子',
  haitei:'海底摸月', houtei:'河底撈魚',
  riichi: '立直', ippatsu: '一発', 'double-riichi': 'ダブル立直', 'menzen-tsumo': '門前清自摸和', tanyao: '断么九',
  'yakuhai-white': '役牌：白', 'yakuhai-green': '役牌：發', 'yakuhai-red': '役牌：中',
  'yakuhai-seat-wind': '役牌：自風', 'yakuhai-round-wind': '役牌：場風',
  pinfu: '平和', iipeikou: '一盃口', ryanpeikou: '二盃口', sanankou: '三暗刻',
  chiitoitsu: '七対子', toitoi: '対々和', shousangen: '小三元', honroutou: '混老頭',
  chanta: '混全帯么九', junchan: '純全帯么九', 'sanshoku-doukou': '三色同刻',
  'sanshoku-doujun': '三色同順', ittsu: '一気通貫', honitsu: '混一色', chinitsu: '清一色',
  'kokushi-musou': '国士無双', suuankou: '四暗刻', daisangen: '大三元', tsuuiisou: '字一色',
  ryuuiisou: '緑一色', chinroutou: '清老頭', shousuushii: '小四喜', daisuushii: '大四喜',
  'chuuren-poutou': '九蓮宝燈',
};
const roundSummaryYakuOverrides: Partial<Record<YakuId, string>> = {
  'menzen-tsumo': 'ツモ',
  'yakuhai-white': '白',
  'yakuhai-green': '發',
  'yakuhai-red': '中',
  'yakuhai-seat-wind': '自風',
  'yakuhai-round-wind': '場風',
  tanyao: 'タンヤオ',
};

export function yakuDisplayName(id: YakuId, view: 'summary' | 'detail'): string {
  return view === 'summary' ? roundSummaryYakuOverrides[id] ?? yakuNames[id] : yakuNames[id];
}

function renderRoundSummary(game: GameState, settlement: RoundSettlement | null): void {
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
      const section = document.createElement('section');
      section.className = 'round-win-summary';
      const player = game.players[result.winnerId];
      const heading = result.winMethod === 'ron'
        ? `${seatNames[player.id]} ロン（${seatNames[result.discarderId]}から）`
        : `${seatNames[player.id]} ツモ`;
      section.append(text('p', heading, 'round-summary-winner'));
      const yaku = result.candidate.yaku.map(entry => yakuDisplayName(entry.id, 'summary'));
      if (result.yakumanCount === 0) {
        if (result.doraHan > 0) yaku.push(`ドラ${result.doraHan}`);
        if (result.uraDoraHan > 0) yaku.push(`裏ドラ${result.uraDoraHan}`);
        if (result.redDoraHan > 0) yaku.push(`赤ドラ${result.redDoraHan}`);
      }
      section.append(text('p', yaku.join('・'), 'round-summary-yaku'));
      const total = text('p', '', 'round-summary-total');
      total.append(text('span', result.yakumanCount > 0
        ? `${result.yakumanCount}役満`
        : `合計${result.totalHanIncludingDora}翻`, 'round-summary-value'));
      total.append(text('span', `${result.totalPoints.toLocaleString('en-US')}点`, 'round-summary-points'));
      section.append(total);
      if (result.yakumanCount > 0) {
        const payments = result.payments.map(payment =>
          `${seatNames[payment.playerId]}（${payment.playerId === game.dealerId ? '親' : '子'}）→${seatNames[result.winnerId]} ${payment.points.toLocaleString('en-US')}点`);
        section.append(text('p', `支払：${payments.join('・')}`, 'round-summary-payments'));
      }
      summary.append(section);
    }
    return;
  }
  if (settlement?.reason === 'draw' && settlement.tenpai) {
    summary.hidden = false;
    const ready = settlement.tenpai.flatMap((isTenpai, id) => isTenpai ? [seatNames[id]] : []);
    summary.append(text('p', '流局', 'round-summary-winner'));
    summary.append(text('p', `テンパイ：${ready.length === 0 ? 'なし' : ready.length === 4 ? '全員' : ready.join('・')}`, 'round-summary-tenpai'));
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

function renderPublicCpuHand(container: HTMLElement, game: GameState, result: TsumoResult | RonCandidate): void {
  const player = game.players[result.winnerId];
  const winningTile = winningPhysicalTile(game, result);
  const concealedTiles = [...player.hand]
    .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
  // The confirmed winning tile is a current draw for tsumo, or the existing
  // physical discard for ron. Rendering adds no tile to GameState.
  renderRevealedCpuHand(container, player, [...concealedTiles, winningTile], result.winningTileId);
}

function renderPublicCpuDrawHand(container: HTMLElement, player: PlayerState): void {
  const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id));
  renderRevealedCpuHand(container, player, tiles);
}

function renderRevealedCpuHand(container: HTMLElement, player: PlayerState, tiles: readonly PhysicalTile[], winningTileId?: string): void {
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
function renderWinResult(game: GameState): void {
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
        const open=document.createElement('div');open.className='result-melds';renderMelds(open,player);section.append(open);
      }
    }
    section.append(text('p', '今回対応している役の判定結果'));
    const list = document.createElement('ul');
    for (const yaku of result.candidate.yaku) list.append(text('li',
      `${yakuDisplayName(yaku.id, 'detail')} ${yaku.yakuman > 0 ? `${yaku.yakuman}役満` : `${yaku.han}翻`}`));
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
    const score = text('p', `獲得点数：${tier ? `${tier} ` : ''}${result.totalPoints}点（${method}）`);
    score.className = 'win-score';
    section.append(score, text('p', '支払い：'));
    const payments = document.createElement('ul');
    payments.className = 'win-payments';
    for (const payment of result.payments) payments.append(text('li',
      `${seatNames[payment.playerId]}（${payment.playerId === game.dealerId ? '親' : '子'}） → ${seatNames[result.winnerId]} ${payment.points}点`));
    section.append(payments);
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
