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
import { OnlineGameController } from './online/game-controller.ts';
import { MainMenu } from './ui/main-menu.ts';
import { ActionPanel, mountActionPanel } from './ui/action-panel.ts';
import { createLocalActionPanelState } from './rendering/local-action-panel-state.ts';
import { mountScoreStrip, mountTableInfoPanel } from './ui/table-components.ts';

const localScoreHost = document.querySelector<HTMLElement>('#local-score-strip-host');
if (localScoreHost) mountScoreStrip(localScoreHost, 'local');
const onlineScoreHost = document.querySelector<HTMLElement>('#online-score-strip-host');
if (onlineScoreHost) mountScoreStrip(onlineScoreHost, 'online');
const localTableInfoHost = document.querySelector<HTMLElement>('#local-table-info-host');
if (localTableInfoHost) mountTableInfoPanel(localTableInfoHost, 'local');
const onlineTableInfoHost = document.querySelector<HTMLElement>('#online-table-info-host');
if (onlineTableInfoHost) mountTableInfoPanel(onlineTableInfoHost, 'online');
const localActionHost = document.querySelector<HTMLElement>('#local-action-panel-host');
const localActionRoot = localActionHost ? mountActionPanel(localActionHost, 'local') : null;
const onlineActionHost = document.querySelector<HTMLElement>('#online-action-panel-host');
const onlineActionRoot = onlineActionHost ? mountActionPanel(onlineActionHost, 'online') : null;
installCallViewport();
if (document.querySelector('#main-menu-toggle')) new MainMenu();
const resultDialog = new ResultDialog();
const controller = new GameController(undefined, { onChange: render });
let localKanChoicesOpen = false;
let localActionPanel: ActionPanel | null = null;
function render(): void {
  renderTable(controller.game, controller.match.points, controller.match.lastSettlement);
  renderMatch(controller.match);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
  localActionPanel?.update(createLocalActionPanelState(
    controller.match, controller.selectedTileId, controller.progressing, localKanChoicesOpen,
  ));
  resultDialog.update(controller.match);
}
export function resetLocalActionChoices(): void { localKanChoicesOpen = false; }
function newGame(): void { controller.newGame(); window.scrollTo(0, 0); }
new NewGameDialog(newGame);
if (localActionRoot) localActionPanel = new ActionPanel(localActionRoot, event => {
  switch (event.type) {
    case 'discard':
      void controller.confirm().catch(error => console.error('Turn progression failed', error));
      if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
      break;
    case 'riichi':
      void controller.declareRiichi().catch(error => console.error('Riichi progression failed', error));
      break;
    case 'tsumo': controller.declareTsumo(); break;
    case 'kyuushu': controller.declareKyuushuKyuuhai(); break;
    case 'ron':
      controller.declareRon();
      if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
      break;
    case 'pass-ron':
      void controller.passRon().catch(error => console.error('Turn progression failed', error));
      if (!document.querySelector<HTMLDialogElement>('#result-dialog')!.open) document.querySelector<HTMLButtonElement>('#new-game')!.focus({ preventScroll: true });
      break;
    case 'pass-call':
      void controller.passCalls().catch(error => console.error('Call pass failed', error));
      break;
    case 'kan-toggle':
      localKanChoicesOpen = true;
      render();
      break;
    case 'cancel-kan':
      localKanChoicesOpen = false;
      render();
      break;
    case 'select-kan':
      localKanChoicesOpen = false;
      void controller.kan(event.optionId).catch(error => console.error('Kan failed', error));
      break;
    case 'select-call':
      void controller.call(event.optionId).catch(error => console.error('Call failed', error));
      break;
    case 'next-round':
      if (!controller.canNextRound) return;
      window.scrollTo(0, 0);
      void controller.nextRound().catch(error => console.error('Next round failed', error));
      break;
    case 'show-result': resultDialog.open(); break;
    case 'return-local': break;
  }
});
if (document.querySelector('#online-create-open')) {
  if (!onlineActionRoot) throw new Error('Online action panel host is missing');
  const onlineGame = new OnlineGameController(new ActionPanel(onlineActionRoot));
  const waitingRoom = new OnlineWaitingRoom(import.meta.env.VITE_ONLINE_API_URL, message => onlineGame.receive(message));
  onlineGame.setActionSender((action, expectedGameRevision) => waitingRoom.sendGameAction(action, expectedGameRevision));
}
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing);
  localActionPanel?.update(createLocalActionPanelState(
    controller.match, controller.selectedTileId, controller.progressing, localKanChoicesOpen,
  ));
  resultDialog.update(controller.match);
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

// Shared UI entry for the isolated verification page.
export { controller, render };
