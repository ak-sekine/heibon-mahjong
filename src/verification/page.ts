import { controller, render, resetLocalActionChoices } from '../main.ts';
import { startMatch } from '../game/match.ts';
import { declareKan, getKanOptions } from '../game/kan.ts';
import { scenarioGame, scenarioHelp, type Scenario } from './scenarios.ts';
import { useFixedTestSeating } from './fixed-test-seating.ts';
import './style.css';

useFixedTestSeating(controller);

const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const cpuKan = document.querySelector<HTMLButtonElement>('#start-cpu-kan');
const callTestSettings = document.querySelector<HTMLDetailsElement>('#call-test-settings');
const callTestSettingsToggle = document.querySelector<HTMLButtonElement>('#toggle-call-test-settings');
const startButton = document.querySelector<HTMLButtonElement>('#load-scenario')!;
const repeatButton = document.querySelector<HTMLButtonElement>('#repeat-scenario');
function load() {
  const mode = select.value as Scenario;
  // Cancel pending CPU work before replacing the match, using the normal lifecycle.
  controller.newGame();
  controller.match = startMatch(scenarioGame(mode));
  resetLocalActionChoices();
  document.querySelector('#scenario-help')!.textContent = scenarioHelp[mode];
  if (cpuKan) {
    cpuKan.hidden = mode !== 'chankan';
    cpuKan.disabled = false;
  }
  render();
}
function startFromCallTest() {
  load();
  if (callTestSettings) callTestSettings.open = false;
}
if (callTestSettings) {
  const updateSettingsToggle = () => {
    if (callTestSettingsToggle) callTestSettingsToggle.textContent = callTestSettings.open ? '設定を閉じる' : 'シナリオを変更';
  };
  callTestSettingsToggle?.addEventListener('click', () => {
    callTestSettings.open = !callTestSettings.open;
    updateSettingsToggle();
  });
  callTestSettings.addEventListener('toggle', updateSettingsToggle);
  updateSettingsToggle();
  startButton.addEventListener('click', startFromCallTest);
  repeatButton?.addEventListener('click', startFromCallTest);
} else {
  select.addEventListener('change', load);
  startButton.addEventListener('click', load);
}
cpuKan?.addEventListener('click', () => {
  const game = controller.game;
  const option = getKanOptions(game, 1)[0];
  if (game.turnPlayerId !== 1 || !option || controller.progressing) return;
  controller.game = declareKan(game, 1, option.id);
  cpuKan.disabled = true;
  render();
});
load();
