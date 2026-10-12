import type { GameState, PlayerId, PlayerState, PhysicalTile, SeatWind } from '../model/game.ts';
import { HONORS, SUITS, type Tile } from '../model/tile.ts';
import { createTileElement } from './tile-svg.ts';

const winds: Record<SeatWind, string> = { east: '東', south: '南', west: '西', north: '北' };
const seatNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;

function tileOrder(tile: Tile): number {
  return tile.category === 'suited' ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1 : 27 + HONORS.indexOf(tile.honor);
}

function renderSelf(player: PlayerState): void {
  const hand = document.querySelector<HTMLUListElement>('#player-hand')!;
  const items = [...player.hand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile) || a.id.localeCompare(b.id)).map((physical: PhysicalTile) => {
    const item = document.createElement('li');
    item.dataset.tileId = physical.id;
    item.append(createTileElement(physical.tile));
    return item;
  });
  if (player.drawnTile) {
    const item = document.createElement('li');
    item.className = 'drawn-tile';
    item.dataset.tileId = player.drawnTile.id;
    item.append(createTileElement(player.drawnTile.tile));
    items.push(item);
  }
  hand.replaceChildren(...items);
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
    if (id === 0) renderSelf(player);
    else renderCpu(player);
  }
  document.querySelector<HTMLElement>('#wall-count')!.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: `生きた牌山 ${game.liveWall.length}枚` }),
    Object.assign(document.createElement('span'), { textContent: `王牌 ${game.deadWall.length}枚` }),
  );
}
