import { installCallViewport } from './ui/call-viewport.ts';
import './style.css';
import { renderTable, renderSelection } from './rendering/table.ts';
import { renderMatch } from './rendering/match.ts';
import { ResultDialog } from './ui/result-dialog.ts';
import { NewGameDialog } from './ui/new-game-dialog.ts';
import { RulePreferences, RuleSettingsDialog } from './ui/rule-settings.ts';
import type { GameRules } from './model/rules.ts';
import { GameController } from './ui/controller.ts';
import { getLastLocalGameTransition, waitForTurn } from './game/automatic-turns.ts';
import { OnlineWaitingRoom } from './online/waiting-room.ts';
import { OnlineGameController } from './online/game-controller.ts';
import { MainMenu } from './ui/main-menu.ts';
import { ActionPanel, mountActionPanel } from './ui/action-panel.ts';
import { createLocalActionPanelState } from './rendering/local-action-panel-state.ts';
import { mountScoreStrip, mountTableInfoPanel } from './ui/table-components.ts';
import { declarationsBetween } from './model/declaration.ts';
import { DeclarationBubbleRenderer } from './rendering/declaration-bubbles.ts';
import { riverPositionFor } from './rendering/river-layout.ts';
import { diagnosticLog, getBuildInfo, getLastSuccessfulRender, installGlobalErrorDiagnostics, mountDiagnosticDialog, recordGameRenderFailure, recordRenderStarted, recordRenderSucceeded, safeErrorInfo } from './online/diagnostics.ts';

installGlobalErrorDiagnostics();
const localScoreHost = document.querySelector<HTMLElement>('#local-score-strip-host');
const localScoreRoot = localScoreHost ? mountScoreStrip(localScoreHost, 'local') : null;
const onlineScoreHost = document.querySelector<HTMLElement>('#online-score-strip-host');
if (onlineScoreHost) mountScoreStrip(onlineScoreHost, 'online');
const localTableInfoHost = document.querySelector<HTMLElement>('#local-table-info-host');
const localTableInfoRoot = localTableInfoHost ? mountTableInfoPanel(localTableInfoHost, 'local') : null;
const onlineTableInfoHost = document.querySelector<HTMLElement>('#online-table-info-host');
if (onlineTableInfoHost) mountTableInfoPanel(onlineTableInfoHost, 'online');
const localActionHost = document.querySelector<HTMLElement>('#local-action-panel-host');
const localActionRoot = localActionHost ? mountActionPanel(localActionHost, 'local') : null;
const onlineActionHost = document.querySelector<HTMLElement>('#online-action-panel-host');
const onlineActionRoot = onlineActionHost ? mountActionPanel(onlineActionHost, 'online') : null;
installCallViewport();
if (document.querySelector('#main-menu-toggle')) {
  const riverTestMenuItem = document.querySelector<HTMLButtonElement>('#river-test-open');
  if (riverTestMenuItem && import.meta.env.DEV) {
    riverTestMenuItem.hidden = false;
    riverTestMenuItem.addEventListener('click', () => {
      window.location.assign(new URL('test.html?debug=river', window.location.href));
    });
  }
  new MainMenu();
}
const resultDialog = new ResultDialog();
let onlineGameController: OnlineGameController | null = null;
const localTable = document.querySelector<HTMLElement>('#local-table')!;
const idleState = document.querySelector<HTMLElement>('#app-idle');
const localDeclarationBubbles = new DeclarationBubbleRenderer(localTable);
const riverDebugMode = window.location.pathname.endsWith('/test.html') &&
  new URLSearchParams(window.location.search).get('debug') === 'river';
const controller = new GameController(undefined, {
  startImmediately: false,
  randomizeSeating: true,
  onChange: render,
  wait: (milliseconds, signal, context) => waitForTurn(riverDebugMode ? 800 : milliseconds, signal, context),
});
mountDiagnosticDialog(diagnosticLog, () => ({
  ...(controller.hasGame ? controller.diagnosticSnapshot() : { gameMode: 'none' }),
  buildId: getBuildInfo().buildId, executionMode: controller.hasGame ? 'offline' : 'none',
  lastSuccessfulRenderId: getLastSuccessfulRender()?.renderId ?? null,
  lastSuccessfulRenderAt: getLastSuccessfulRender()?.timestamp ?? null,
  lastSuccessfulRenderPhase: getLastSuccessfulRender()?.phase ?? null,
  lastSuccessfulRenderSeat: getLastSuccessfulRender()?.seat ?? null,
  lastSuccessfulRenderRunnerState: getLastSuccessfulRender()?.runnerState ?? null,
}));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    diagnosticLog.record('INFO', 'page_resumed', { source: 'visibilitychange' });
    if (controller.hasGame && controller.match.status === 'playing') diagnosticLog.record('WARN', 'local_runner_resume_snapshot', {
      ...controller.diagnosticSnapshot(),
      displayState: document.visibilityState, gameMode: controller.match.format ?? 'tonpu',
    });
    controller.reportIfStalled('page-resumed');
  }
});
window.addEventListener('pagehide', () => {
  diagnosticLog.record('INFO', 'page_hidden', { source: 'pagehide' });
  diagnosticLog.flush();
});
let previouslyRenderedGame: typeof controller.game | null = null;
let previouslyRenderedMatchStatus: string = 'playing';
let localKanChoicesOpen = false;
let localActionPanel: ActionPanel | null = null;
function render(): void {
  if (!controller.hasGame) {
    document.body.dataset.gameMode = 'none';
    localDeclarationBubbles.clearAll();
    if (idleState) idleState.hidden = false;
    localScoreRoot!.hidden = true;
    localTableInfoRoot!.hidden = true;
    localTable.hidden = true;
    document.querySelector<HTMLElement>('#round-result-summary')!.hidden = true;
    localActionRoot!.hidden = true;
    document.querySelector<HTMLElement>('#match-result')!.replaceChildren();
    localTable.querySelectorAll<HTMLElement>('.concealed-hand, .open-melds, .river, #player-hand, #dora-indicators, #wall-count, #deposit-sticks').forEach(node => node.replaceChildren());
    localScoreRoot!.querySelectorAll<HTMLElement>('.seat-label').forEach(node => node.replaceChildren());
    localTableInfoRoot!.querySelectorAll<HTMLElement>('#table-round').forEach(node => {
      node.textContent = '';
      node.removeAttribute('aria-label');
      node.removeAttribute('title');
    });
    localActionPanel?.clear();
    previouslyRenderedGame = null;
    previouslyRenderedMatchStatus = 'playing';
    localKanChoicesOpen = false;
    return;
  }
  document.body.dataset.gameMode = 'offline';
  if (idleState) idleState.hidden = true;
  localScoreRoot!.hidden = false;
  localTableInfoRoot!.hidden = false;
  localTable.hidden = false;
  document.querySelector<HTMLElement>('#round-result-summary')!.hidden = false;
  localActionRoot!.hidden = false;
  const game = controller.game;
  const renderId = recordRenderStarted(diagnosticLog, {
    seat: game.turnPlayerId, phase: game.phase, runnerState: controller.progressing ? 'running' : 'idle',
    currentTurn: game.turnPlayerId, remainingTiles: game.liveWall.length, displayState: document.visibilityState,
  });
  let renderStage = 'prepare';
  try {
    if (previouslyRenderedMatchStatus !== 'playing' && controller.match.status === 'playing') {
      localDeclarationBubbles.clearAll();
    }
    const declarations = declarationsBetween(previouslyRenderedGame, game);
    renderStage = 'renderTable';
    renderTable(game, controller.match.points, controller.match.lastSettlement, controller.playerSeat, controller.playerNames);
    renderStage = 'declarationBubbles';
    for (const declaration of declarations) {
      const position = riverPositionFor(controller.playerSeat, declaration.seat);
      const displaySeat = (declaration.seat - controller.playerSeat + 4) % 4;
      const river = localTable.querySelector<HTMLElement>(`.river[data-player-id="${displaySeat}"]`);
      if (river) localDeclarationBubbles.show(declaration.seat, declaration.kind, position, river);
    }
    previouslyRenderedGame = game;
    previouslyRenderedMatchStatus = controller.match.status;
    renderStage = 'renderMatch';
    renderMatch(controller.match, controller.playerNames);
    renderStage = 'renderSelection';
    renderSelection(controller.game, controller.selectedTileId, controller.progressing, controller.playerSeat);
    renderStage = 'localActionPanel';
    try {
      localActionPanel?.update(createLocalActionPanelState(
        controller.match, controller.selectedTileId, controller.progressing, localKanChoicesOpen, controller.playerSeat, controller.playerNames,
      ));
      diagnosticLog.record('INFO', 'local_action_panel_updated', { renderId }, { persist: false, replace: true });
    } catch (error) {
      diagnosticLog.record('ERROR', 'local_action_panel_update_failed', { renderId, failedStage: renderStage, ...safeErrorInfo(error) });
      throw error;
    }
    renderStage = 'resultDialog';
    resultDialog.update(controller.match);
    recordRenderSucceeded(diagnosticLog, { renderId, timestamp: new Date().toISOString(), seat: controller.game.turnPlayerId,
      phase: controller.game.phase, runnerState: controller.progressing ? 'running' : 'idle', actionPanelUpdated: true,
      remainingTiles: controller.game.liveWall.length });
  } catch (error) {
    recordGameRenderFailure(diagnosticLog, {
      renderId, failedStage: renderStage, lastSuccessfulRenderId: getLastSuccessfulRender()?.renderId ?? null,
      lastSuccessfulRenderAt: getLastSuccessfulRender()?.timestamp ?? null,
      seat: game.turnPlayerId, currentTurn: game.turnPlayerId, phase: game.phase, remainingTiles: game.liveWall.length,
      round: `${controller.match.roundWind}${controller.match.roundNumber}`, honba: controller.match.honba,
      lastTransition: getLastLocalGameTransition(), runnerState: controller.progressing ? 'running' : 'idle',
      riverCounts: game.players.map(player => player.river.length).join(','),
    }, error, `main.render>${renderStage}`);
    console.error('Local game render failed', {
      turnPlayerId: game.turnPlayerId,
      riverLengths: game.players.map(player => player.river.length),
      stage: renderStage,
    });
    throw error;
  }
}
const buildInfo = getBuildInfo();
diagnosticLog.record('INFO', 'app_build_info', {
  buildId: buildInfo.buildId, gitSha: buildInfo.gitSha, buildTimeUtc: buildInfo.buildTimeUtc,
  appVersion: buildInfo.appVersion, mode: buildInfo.mode, schemaVersion: buildInfo.schemaVersion,
  executionMode: 'none',
});
export function resetLocalActionChoices(): void { localKanChoicesOpen = false; }
function newGame(rules: GameRules): void {
  localDeclarationBubbles.clearAll();
  controller.newGame(rules.matchFormat);
  // A synchronous, accepted local start is the persistence boundary. Storage
  // failures are swallowed so they cannot interrupt a playable match.
  rulePreferences.acceptedStart(rules);
  window.scrollTo(0, 0);
}
const rulePreferences = new RulePreferences();
new RuleSettingsDialog(rulePreferences);
new NewGameDialog(newGame, () => controller.hasGame, rulePreferences);
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
  onlineGameController = new OnlineGameController(new ActionPanel(onlineActionRoot), resultDialog, () => {
    controller.clearGame();
    render();
  });
  const waitingRoom = new OnlineWaitingRoom(import.meta.env.VITE_ONLINE_API_URL, message => onlineGameController?.receive(message), rulePreferences);
  onlineGameController.setActionSender((action, expectedGameRevision) => waitingRoom.sendGameAction(action, expectedGameRevision));
}
document.querySelector('#player-hand')!.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-tile-id]');
  if (!button) return;
  controller.select(button.dataset.tileId!);
  renderSelection(controller.game, controller.selectedTileId, controller.progressing, controller.playerSeat);
  localActionPanel?.update(createLocalActionPanelState(
    controller.match, controller.selectedTileId, controller.progressing, localKanChoicesOpen, controller.playerSeat, controller.playerNames,
  ));
  resultDialog.update(controller.match);
});
render();

// Shared UI entry for the isolated verification page.
export { controller, render };
