import { controller, render, resetLocalActionChoices } from '../main.ts';
import { startMatch } from '../game/match.ts';
import { AutomaticTurnRunner } from '../game/automatic-turns.ts';
import { getTestScenario } from './test-scenarios.ts';
import { createRiverTestState } from './river-test-fixture.ts';
import './style.css';

const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const scenarioCpuRunner = new AutomaticTurnRunner();
let activeScenarioId = select.value;
const riverControls = document.querySelector<HTMLElement>('#river-test-controls')!;
const riverCountSelect = document.querySelector<HTMLSelectElement>('#river-count')!;
const riverBadge = document.querySelector<HTMLElement>('#river-test-badge')!;

function startRiverScenario(count: number): void {
  scenarioCpuRunner.cancel();
  controller.newGame();
  controller.selectedTileId = null;
  try {
    controller.match = startMatch(createRiverTestState(count));
  } catch (error) {
    document.querySelector('#test-status')!.textContent = error instanceof Error ? error.message : '局面を生成できませんでした。';
    return;
  }
  resetLocalActionChoices();
  activeScenarioId = 'river-test';
  document.querySelector('#scenario-help')!.textContent =
    `合法な一局の進行から、自分の河が${count}枚で打牌待ちになる局面を再現しました。打牌すると${count + 1}枚目が追加されます。`;
  document.querySelector('#test-status')!.textContent = '手牌を選び、「打牌する」を押してください。';
  render();
}

function startScenario(id: string): void {
  riverControls.hidden = id !== 'river-test';
  riverBadge.hidden = id !== 'river-test';
  if (id === 'river-test') {
    activeScenarioId = id;
    startRiverScenario(Number(riverCountSelect.value));
    return;
  }
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
document.querySelector('#start-river-test')!.addEventListener('click', () => startRiverScenario(Number(riverCountSelect.value)));
document.querySelector('#repeat-scenario')!.addEventListener('click', () => {
  select.value = activeScenarioId;
  startScenario(activeScenarioId);
});
const requestedDebug = new URLSearchParams(window.location.search).get('debug');
if (requestedDebug === 'river') select.value = 'river-test';
activeScenarioId = select.value;
startScenario(activeScenarioId);
