import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { startGame } from '../src/game/start.ts';
import type { GameState } from '../src/model/game.ts';
import { diagnosticLog } from '../src/online/diagnostics.ts';
import { seeded } from './helpers.ts';
import { callStart } from './calls-fixture.ts';

function cpuDrawState(): GameState {
  const game = startGame(seeded(17));
  return {
    ...game, phase: 'awaiting-draw', turnPlayerId: 1,
    players: game.players.map(player => player.id === 1 ? { ...player, control: 'cpu' as const } :
      player.id === 2 ? { ...player, control: 'human' as const } : player) as unknown as GameState['players'],
  };
}

test('CPU turn stages share an ID and appear in process order while async waiting is observable', async () => {
  diagnosticLog.clear();
  let state = cpuDrawState();
  let release!: () => void;
  const runner = new AutomaticTurnRunner({
    wait: () => new Promise<void>(resolve => { release = resolve; }),
    chooseDiscard: player => player.drawnTile!.id,
  });
  const running = runner.run(() => state, next => { state = next; });
  assert.equal(runner.diagnosticSnapshot(state).currentStage, 'wait_timer');
  assert.equal(runner.diagnosticSnapshot(state).waitingAsync, true);
  const waitingTurnId = runner.diagnosticSnapshot(state).cpuTurnId;
  release();
  await running;
  const entries = diagnosticLog.all();
  const turnEvents = entries.filter(entry => entry.event === 'local_cpu_turn_started' || entry.event === 'local_cpu_turn_completed');
  assert.deepEqual(turnEvents.map(entry => entry.event), ['local_cpu_turn_started', 'local_cpu_turn_completed']);
  assert.equal(turnEvents[0]?.details.cpuTurnId, turnEvents[1]?.details.cpuTurnId);
  assert.equal(waitingTurnId, turnEvents[0]?.details.cpuTurnId);
  const stages = entries.filter(entry => entry.event === 'local_cpu_stage_started').map(entry => entry.details.stage);
  assert.deepEqual(stages, ['draw_processing', 'state_transition', 'wait_timer', 'tsumo_judgment', 'kyuushu_judgment', 'kan_judgment', 'discard_selection', 'discard_commit', 'state_transition']);
  assert.ok(entries.some(entry => entry.event === 'local_cpu_stage_completed' && entry.details.stage === 'wait_timer'));
});

test('CPU synchronous stage exception is recorded and rethrown unchanged', async () => {
  diagnosticLog.clear();
  const state = callStart();
  const failure = new Error('diagnostic test failure');
  const runner = new AutomaticTurnRunner({ wait: async () => {}, chooseDiscard: () => { throw failure; } });
  await assert.rejects(runner.run(() => state, () => {}), error => error === failure);
  const failed = diagnosticLog.all().find(entry => entry.event === 'local_cpu_stage_failed');
  assert.equal(failed?.details.stage, 'discard_selection');
  const turnStart = diagnosticLog.all().find(entry => entry.event === 'local_cpu_turn_started');
  assert.equal(failed?.details.cpuTurnId, turnStart?.details.cpuTurnId);
});

test('unavailable diagnostic storage does not alter CPU decisions or the resulting game state', async () => {
  let normalResult = cpuDrawState();
  const normalRunner = new AutomaticTurnRunner({ wait: async () => {}, chooseDiscard: player => player.drawnTile!.id });
  await normalRunner.run(() => normalResult, next => { normalResult = next; });

  const broken = { getItem: () => { throw new Error('storage disabled'); }, setItem: () => { throw new Error('storage disabled'); }, removeItem: () => { throw new Error('storage disabled'); } };
  const target = diagnosticLog as unknown as { storage: typeof broken | null };
  const original = target.storage;
  Object.defineProperty(diagnosticLog, 'storage', { configurable: true, value: broken });
  try {
    let diagnosticResult = cpuDrawState();
    const runner = new AutomaticTurnRunner({ wait: async () => {}, chooseDiscard: player => player.drawnTile!.id });
    await runner.run(() => diagnosticResult, next => { diagnosticResult = next; });
    assert.deepEqual(diagnosticResult, normalResult);
  } finally { Object.defineProperty(diagnosticLog, 'storage', { configurable: true, value: original }); }
});
