import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';
import { renderTable, renderSelection } from './rendering/table.ts';
import { renderMatch } from './rendering/match.ts';
import { GameController } from './ui/controller.ts';

const controller = new GameController(undefined, { onChange: render });
function render(): void {
  renderTable(controller.game, controller.match.points);
  renderMatch(controller.match);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
}
function newGame(): void { controller.newGame(); }
document.querySelector<HTMLButtonElement>('#new-game')!.addEventListener('click', newGame);
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
});
document.querySelector<HTMLButtonElement>('#discard')!.addEventListener('click', () => {
  void controller.confirm().catch(error => console.error('Turn progression failed', error));
  document.querySelector<HTMLButtonElement>('#new-game')!.focus();
});
document.querySelector<HTMLButtonElement>('#tsumo')!.addEventListener('click', () => {
  controller.declareTsumo();
});
document.querySelector<HTMLButtonElement>('#ron')!.addEventListener('click', () => {
  controller.declareRon();
  document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#pass-ron')!.addEventListener('click', () => {
  void controller.passRon().catch(error => console.error('Turn progression failed', error));
  document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#next-round')!.addEventListener('click', () => {
  void controller.nextRound().catch(error => console.error('Next round failed', error));
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
