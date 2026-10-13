import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';
import { renderTable, renderSelection } from './rendering/table.ts';
import { renderMatch } from './rendering/match.ts';
import { ResultDialog } from './ui/result-dialog.ts';
import { NewGameDialog } from './ui/new-game-dialog.ts';
import { GameController } from './ui/controller.ts';

const resultDialog = new ResultDialog();
const controller = new GameController(undefined, { onChange: render });
function render(): void {
  renderTable(controller.game, controller.match.points);
  renderMatch(controller.match);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
  resultDialog.update(controller.match);
}
function newGame(): void { controller.newGame(); window.scrollTo(0, 0); }
new NewGameDialog(newGame);
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
  resultDialog.update(controller.match);
});
document.querySelector<HTMLButtonElement>('#discard')!.addEventListener('click', () => {
  void controller.confirm().catch(error => console.error('Turn progression failed', error));
  if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#tsumo')!.addEventListener('click', () => {
  controller.declareTsumo();
});
document.querySelector<HTMLButtonElement>('#ron')!.addEventListener('click', () => {
  controller.declareRon();
  if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#pass-ron')!.addEventListener('click', () => {
  void controller.passRon().catch(error => console.error('Turn progression failed', error));
  if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#next-round')!.addEventListener('click', () => {
  if (!controller.canNextRound) return;
  document.querySelector<HTMLButtonElement>('#next-round')!.disabled = true;
  const progression = controller.nextRound();
  window.scrollTo(0, 0);
  void progression.catch(error => console.error('Next round failed', error));
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
