import { controller, render, resetLocalActionChoices } from '../main.ts';
import { startMatch } from '../game/match.ts';
import { declareKan, getKanOptions } from '../game/kan.ts';
import { scenarioGame, scenarioHelp, type Scenario } from './scenarios.ts';
import './style.css';

const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const cpuKan = document.querySelector<HTMLButtonElement>('#start-cpu-kan')!;
function load() {
  const mode = select.value as Scenario;
  // Cancel pending CPU work before replacing the match, using the normal lifecycle.
  controller.newGame();
  controller.match = startMatch(scenarioGame(mode));
  resetLocalActionChoices();
  document.querySelector('#scenario-help')!.textContent = scenarioHelp[mode];
  cpuKan.hidden = mode !== 'chankan';
  cpuKan.disabled = false;
  render();
}
select.addEventListener('change', load);
document.querySelector('#load-scenario')!.addEventListener('click', load);
cpuKan.addEventListener('click', () => {
  const game = controller.game;
  const option = getKanOptions(game, 1)[0];
  if (game.turnPlayerId !== 1 || !option || controller.progressing) return;
  controller.game = declareKan(game, 1, option.id);
  cpuKan.disabled = true;
  render();
});
load();
