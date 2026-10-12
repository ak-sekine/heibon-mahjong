import type { GameState, PlayerId, PlayerState, PhysicalTile, SeatWind } from '../model/game.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';
import { canDeclareTsumo } from '../game/tsumo.ts';
import type { YakuId } from '../analysis/yaku.ts';
import { canDiscard } from '../game/discard.ts';

const winds: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const seatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;
function turnLabel(game: GameState): string {
  if (game.phase === 'won') return 'ツモ和了！';
  if (game.phase === 'wall-exhausted') return '牌山がなくなりました';
  return `${game.turnPlayerId === 0 ? 'あなた' : seatNames[game.turnPlayerId]}の手番`;
}

function tileOrder(tile: Tile): number {
  return tile.category === 'suited' ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + HONORS.indexOf(tile.honor);
}

function renderSelf(player: PlayerState, enabled: boolean): void {
  const hand = document.querySelector<HTMLUListElement>('#player-hand')!;
  const items = [...player.hand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id)).map((physical: PhysicalTile) => {
    const item = document.createElement('li');
    item.dataset.tileId = physical.id;
    item.append(tileButton(physical, enabled));
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

export function renderTable(game: GameState): void {
  renderWinResult(game);
  for (const player of game.players) {
    const id: PlayerId = player.id;
    const count = player.hand.length + Number(player.drawnTile !== null);
    const label = document.querySelector<HTMLElement>(`#label-${id}`)!;
    label.textContent = `${seatNames[id]} · ${winds[player.wind]} · ${count}枚${game.dealerId === id ? ' · 親' : ''}`;
    label.dataset.active = String(game.phase !== 'wall-exhausted' && game.phase !== 'won' && game.turnPlayerId === id);
    if (id === 0) renderSelf(player, canDiscard(game, 0));
    const river = document.querySelector<HTMLElement>(`.river[data-player-id="${id}"]`)!;
    river.replaceChildren(...player.river.map((physical, index) => {
      const item = document.createElement('div');
      item.className = 'river-tile';
      item.dataset.tileId = physical.id;
      // Keep DOM/data in discard order; map the seat's 6-wide rows to screen cells.
      const row = Math.floor(index / 6), column = index % 6;
      const screenRow = id === 1 ? 5 - column : id === 3 ? column : id === 2 ? 2 - row : row;
      const screenColumn = id === 1 ? row : id === 3 ? 2 - row : id === 2 ? 5 - column : column;
      item.style.gridRow = String(screenRow + 1);
      item.style.gridColumn = String(screenColumn + 1);
      item.append(createTileElement(physical.tile));
      return item;
    }));
  }
  document.querySelector<HTMLElement>('#wall-count')!.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `生きた牌山 ${game.liveWall.length}枚` }),
    Object.assign(document.createElement('span'), { textContent: `王牌 ${game.deadWall.length}枚` }),
    Object.assign(document.createElement('span'), { textContent: turnLabel(game) }),
  );
}

/** Selection rendering never changes GameState or rebuilds focused tile buttons. */
export function renderSelection(game: GameState, selectedTileId: string | null, progressing = false): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#player-hand button'))) {
    button.setAttribute('aria-pressed', String(button.dataset.tileId === selectedTileId));
  }
  const player = game.players[0];
  const selected = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .find(tile => tile.id === selectedTileId);
  document.querySelector<HTMLButtonElement>('#discard')!.disabled = progressing || !selected || !canDiscard(game, 0);
  document.querySelector<HTMLButtonElement>('#tsumo')!.disabled = progressing || !canDeclareTsumo(game, 0);
  document.querySelector<HTMLElement>('#selection-status')!.textContent = game.phase === 'wall-exhausted'
    ? '牌山がなくなりました'
    : !canDiscard(game, 0) ? turnLabel(game)
    : selected ? `選択：${tileLabel(selected.tile)}` : 'あなたの手番：牌を選択して「打牌する」で確定';
}

const yakuNames: Record<YakuId, string> = {
  'menzen-tsumo': '門前清自摸和', tanyao: '断么九',
  'yakuhai-white': '役牌：白', 'yakuhai-green': '役牌：發', 'yakuhai-red': '役牌：中',
  'yakuhai-seat-wind': '役牌：自風', 'yakuhai-round-wind': '役牌：場風',
  pinfu: '平和', iipeikou: '一盃口', chiitoitsu: '七対子', toitoi: '対々和', 'kokushi-musou': '国士無双',
};
function renderWinResult(game: GameState): void {
  const panel = document.querySelector<HTMLElement>('#win-result')!;
  const result = game.winResult;
  panel.hidden = !result;
  panel.replaceChildren();
  if (!result) return;
  const text = (tag: string, textContent: string) => Object.assign(document.createElement(tag), { textContent });
  const player = game.players[result.winnerId];
  panel.append(text('h2', 'ツモ和了！'));
  panel.append(text('p', `${seatNames[player.id]}（${winds[player.wind]}）`));
  panel.append(text('p', '今回対応している役の判定結果'));
  const list = document.createElement('ul');
  for (const yaku of result.candidate.yaku) list.append(text('li',
    `${yakuNames[yaku.id]} ${yaku.yakuman > 0 ? `${yaku.yakuman}役満` : `${yaku.han}翻`}`));
  panel.append(list);
  if (result.yakumanCount > 0) {
    panel.append(text('p', `役満：${result.yakumanCount}役満`));
  } else {
    panel.append(text('p', `役合計：${result.yakuHan}翻`));
    const bonuses = document.createElement('div');
    bonuses.className = 'win-bonuses';
    bonuses.append(text('p', `赤ドラ：${result.redDoraCount}枚（${result.redDoraHan}翻）`));
    panel.append(bonuses);
    panel.append(text('p', `合計：${result.totalHanIncludingDora}翻`));
  }
  panel.append(text('p', '点数計算は未実装です。'));
}
