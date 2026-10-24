import { controller, render, resetLocalActionChoices } from '../main.ts';
import { startMatch } from '../game/match.ts';
import { AutomaticTurnRunner } from '../game/automatic-turns.ts';
import { getTestScenario } from './test-scenarios.ts';
import './style.css';

const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const scenarioCpuRunner = new AutomaticTurnRunner();
let activeScenarioId = select.value;

function startScenario(id: string): void {
  const scenario = getTestScenario(id);
  scenarioCpuRunner.cancel();
  controller.newGame(); // cancel any scheduled CPU turn before replacing the match
  controller.selectedTileId = null;
  controller.match = startMatch(scenario.generateInitialGameState());
  resetLocalActionChoices();
  activeScenarioId = scenario.id;
  document.querySelector('#scenario-help')!.textContent = scenario.description;
  document.querySelector('#test-status')!.textContent = scenario.targetPlayerId === 0
    ? '局面を準備しました。九種九牌ボタンから宣言してください。'
    : '局面を準備しました。CPUの第一ツモ処理を実行中です。';
  render();
  if (scenario.targetPlayerId !== 0) {
    void scenarioCpuRunner.runMatch(
      () => controller.match,
      match => { controller.match = match; render(); },
      render,
    ).then(() => {
      document.querySelector('#test-status')!.textContent = controller.game.abortiveDrawPlayerId === scenario.targetPlayerId
        ? `${scenario.displayName}の宣言が成立しました。結果画面で公開範囲を確認できます。`
        : 'CPU自動処理が終了しました。局面を再実行してください。';
    });
  }
}

document.querySelector('#load-scenario')!.addEventListener('click', () => startScenario(select.value));
document.querySelector('#repeat-scenario')!.addEventListener('click', () => {
  select.value = activeScenarioId;
  startScenario(activeScenarioId);
});
startScenario(activeScenarioId);
