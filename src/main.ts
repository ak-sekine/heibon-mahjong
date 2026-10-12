import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { startGame } from './game/start.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';
import { renderTable } from './rendering/table.ts';

function newGame(): void { renderTable(startGame()); }
document.querySelector<HTMLButtonElement>('#new-game')!.addEventListener('click', newGame);
newGame();

const gallery = document.querySelector<HTMLUListElement>('#tile-gallery')!;
for (const tile of [...TILE_KINDS.map(ordinaryTile), ...SUITS.map(redFive)]) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = tileLabel(tile);
  item.append(createTileElement(tile), label);
  gallery.append(item);
}
