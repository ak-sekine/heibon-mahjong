import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { startGame } from './game/start.ts';
import { HONORS, type Tile } from './model/tile.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';

const hand = document.querySelector<HTMLUListElement>('#player-hand')!;
const cpuCounts = document.querySelector<HTMLUListElement>('#cpu-counts')!;
const wallCount = document.querySelector<HTMLParagraphElement>('#wall-count')!;
let game = startGame();

function tileOrder(tile: Tile): number {
  return tile.category === 'suited'
    ? SUITS.indexOf(tile.suit) * 9 + tile.rank - 1
    : 27 + HONORS.indexOf(tile.honor);
}

function renderGame(): void {
  const self = game.players[0];
  const items = [...self.hand].sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile))
    .map(physical => {
      const item = document.createElement('li');
      item.append(createTileElement(physical.tile));
      return item;
    });
  if (self.drawnTile) {
    const extra = document.createElement('li');
    extra.className = 'drawn-tile';
    extra.setAttribute('aria-label', '親の追加1枚');
    extra.append(createTileElement(self.drawnTile.tile));
    items.push(extra);
  }
  hand.replaceChildren(...items);
  const winds = { south: '南', west: '西', north: '北', east: '東' };
  cpuCounts.replaceChildren(...game.players.slice(1).map(player => {
    const item = document.createElement('li');
    item.textContent = `CPU${player.id} · ${winds[player.wind]}：${player.hand.length + (player.drawnTile ? 1 : 0)}枚`;
    return item;
  }));
  wallCount.textContent = `生きた牌山：${game.liveWall.length}枚 · 王牌：${game.deadWall.length}枚`;
}

document.querySelector<HTMLButtonElement>('#new-game')!.addEventListener('click', () => {
  game = startGame();
  renderGame();
});
renderGame();

const gallery = document.querySelector<HTMLUListElement>('#tile-gallery')!;
for (const tile of [...TILE_KINDS.map(ordinaryTile), ...SUITS.map(redFive)]) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = tileLabel(tile);
  item.append(createTileElement(tile), label);
  gallery.append(item);
}
