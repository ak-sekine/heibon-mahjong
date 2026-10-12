import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';
import { renderTable, renderSelection } from './rendering/table.ts';
import { GameController } from './ui/controller.ts';

const controller = new GameController();
function render(): void {
  renderTable(controller.game);
  renderSelection(controller.game, controller.selectedTileId);
}
function newGame(): void { controller.newGame(); render(); }
document.querySelector<HTMLButtonElement>('#new-game')!.addEventListener('click', newGame);
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId);
});
document.querySelector<HTMLButtonElement>('#discard')!.addEventListener('click', () => {
  controller.confirm();
  render();
  document.querySelector<HTMLButtonElement>('#new-game')!.focus();
});
render();

const gallery = document.querySelector<HTMLUListElement>('#tile-gallery')!;
for (const tile of [...TILE_KINDS.map(ordinaryTile), ...SUITS.map(redFive)]) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = tileLabel(tile);
  item.append(createTileElement(tile), label);
  gallery.append(item);
}
