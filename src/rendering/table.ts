import type { GameState, PlayerId, PlayerState, PhysicalTile, SeatWind } from '../model/game.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { createTileElement, tileLabel } from './tile-svg.ts';
import { canDiscard } from '../game/discard.ts';

const winds: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const seatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;

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

function renderCpu(player: PlayerState): void {
  const hand = document.querySelector<HTMLUListElement>(`#hand-${player.id}`)!;
  const count = player.hand.length + Number(player.drawnTile !== null);
  const backs = Array.from({ length: count }, () => {
    const item = document.createElement('li');
    item.className = 'tile-back';
    return item;
  });
  hand.replaceChildren(...backs);
}

export function renderTable(game: GameState): void {
  for (const player of game.players) {
    const id: PlayerId = player.id;
    const count = player.hand.length + Number(player.drawnTile !== null);
    document.querySelector<HTMLElement>(`#label-${id}`)!.textContent = `${seatNames[id]} · ${winds[player.wind]} · ${count}枚${game.dealerId === id ? ' · 親' : ''}`;
    if (id === 0) renderSelf(player, canDiscard(game, 0));
    else renderCpu(player);
    const river = document.querySelector<HTMLElement>(`.river[data-player-id="${id}"]`)!;
    river.replaceChildren(...player.river.map(physical => {
      const item = document.createElement('div');
      item.className = 'river-tile';
      item.dataset.tileId = physical.id;
      item.append(createTileElement(physical.tile));
      return item;
    }));
  }
  document.querySelector<HTMLElement>('#wall-count')!.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `生きた牌山 ${game.liveWall.length}枚` }),
    Object.assign(document.createElement('span'), { textContent: `王牌 ${game.deadWall.length}枚` }),
  );
}

/** Selection rendering never changes GameState or rebuilds focused tile buttons. */
export function renderSelection(game: GameState, selectedTileId: string | null): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#player-hand button'))) {
    button.setAttribute('aria-pressed', String(button.dataset.tileId === selectedTileId));
  }
  const player = game.players[0];
  const selected = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .find(tile => tile.id === selectedTileId);
  document.querySelector<HTMLButtonElement>('#discard')!.disabled = !selected || !canDiscard(game, 0);
  document.querySelector<HTMLElement>('#selection-status')!.textContent = game.phase === 'stopped'
    ? '打牌完了（次のターン処理は未実装）'
    : selected ? `選択：${tileLabel(selected.tile)}` : '牌を選択して「打牌する」で確定';
}
