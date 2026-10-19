import { installCallViewport } from './ui/call-viewport.ts';
import './style.css';
import { TILE_KINDS, SUITS, ordinaryTile, redFive } from './model/tile.ts';
import { createTileElement, tileLabel } from './rendering/tile-svg.ts';
import { renderTable, renderSelection } from './rendering/table.ts';
import { renderMatch } from './rendering/match.ts';
import { ResultDialog } from './ui/result-dialog.ts';
import { NewGameDialog } from './ui/new-game-dialog.ts';
import { GameController } from './ui/controller.ts';
import { OnlineWaitingRoom } from './online/waiting-room.ts';

installCallViewport();
const resultDialog = new ResultDialog();
const controller = new GameController(undefined, { onChange: render });
function render(): void {
  renderTable(controller.game, controller.match.points, controller.match.lastSettlement);
  renderMatch(controller.match);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing, controller.match.points[0]);
  resultDialog.update(controller.match);
}
function newGame(): void { controller.newGame(); window.scrollTo(0, 0); }
new NewGameDialog(newGame);
if (document.querySelector('#online-open')) new OnlineWaitingRoom(import.meta.env.VITE_ONLINE_API_URL);
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing, controller.match.points[0]);
  resultDialog.update(controller.match);
});
document.querySelector<HTMLButtonElement>('#discard')!.addEventListener('click', () => {
  void controller.confirm().catch(error => console.error('Turn progression failed', error));
  if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
});
document.querySelector<HTMLButtonElement>('#riichi')!.addEventListener('click', () => {
  void controller.declareRiichi().catch(error => console.error('Riichi progression failed', error));
});
document.querySelector<HTMLButtonElement>('#tsumo')!.addEventListener('click', () => {
  controller.declareTsumo();
});
document.querySelector<HTMLButtonElement>('#kyuushu-kyuuhai')!.addEventListener('click', () => {
  controller.declareKyuushuKyuuhai();
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

document.querySelector('#call-options')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-call-id]');
  if (button) void controller.call(button.dataset.callId!).catch(error => console.error('Call failed', error));
});
document.querySelector('#pass-calls')!.addEventListener('click', () => {
  void controller.passCalls().catch(error => console.error('Call pass failed', error));
});

document.querySelector('#kan')!.addEventListener('click',()=>{
  document.querySelector<HTMLElement>('#kan-controls')!.hidden=false;
  document.querySelector('#kan-controls')!.scrollIntoView({block:'nearest'});
});
document.querySelector('#cancel-kan')!.addEventListener('click',()=>{document.querySelector<HTMLElement>('#kan-controls')!.hidden=true;});
document.querySelector('#kan-options')!.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('button[data-kan-id]');
  if(button) { document.querySelector<HTMLElement>('#kan-controls')!.hidden=true; void controller.kan(button.dataset.kanId!).catch(e=>console.error('Kan failed',e)); }
});

// Shared UI entry for the isolated verification page.
export { controller, render };
