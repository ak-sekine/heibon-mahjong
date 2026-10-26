import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomaticTurnRunner, waitForTurn } from '../src/game/automatic-turns.ts';
import { diagnosticLog } from '../src/online/diagnostics.ts';
import { callStart } from './calls-fixture.ts';

test('CPU runner records timer scheduling and interruption without recording game tiles',async()=>{
  diagnosticLog.clear();
  await waitForTurn(0,new AbortController().signal);
  const fired=diagnosticLog.all();
  assert.ok(fired.some(entry=>entry.event==='local_cpu_wait_timer_started'&&entry.details.plannedMs===0));
  assert.ok(fired.some(entry=>entry.event==='local_cpu_wait_timer_fired'&&typeof entry.details.elapsedMs==='number'));
  diagnosticLog.clear();
  const controller=new AbortController();
  const waiting=waitForTurn(1000,controller.signal);
  controller.abort();await waiting;
  const interrupted=diagnosticLog.all();
  assert.ok(interrupted.some(entry=>entry.event==='local_cpu_wait_timer_interrupted'));
  assert.equal(JSON.stringify([...fired,...interrupted]).includes('tileId'),false);
});

test('CPU runner records failed turn and async boundary with scrubbed error text',async()=>{
  diagnosticLog.clear();
  const game=callStart();
  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:()=>{throw new Error('private tile-man-5 token=secret-value');}});
  await assert.rejects(runner.run(()=>game,()=>{}),/private/u);
  const entries=diagnosticLog.all();
  assert.ok(entries.some(entry=>entry.event==='local_cpu_turn_started'&&entry.details.seat===3));
  const failed=entries.find(entry=>entry.event==='local_cpu_turn_failed');
  assert.ok(failed);assert.equal(failed.details.errorName,'Error');assert.equal(failed.details.errorCode,'error');
  assert.equal(JSON.stringify(entries).includes('man-5'),false);
  assert.equal(JSON.stringify(entries).includes('secret-value'),false);
  assert.ok(entries.some(entry=>entry.event==='local_runner_failed'&&entry.details.runnerState==='failed'));
});

test('runner completion callback render failures mark the runner failed',async()=>{
  diagnosticLog.clear();
  const game=callStart(0);
  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:player=>player.drawnTile!.id});
  await assert.rejects(runner.run(()=>game,()=>{},()=>{throw new Error('render callback failed');}),/render callback failed/u);
  const events=diagnosticLog.all().map(entry=>entry.event);
  assert.ok(events.includes('local_runner_completion_callback_failed'));
  assert.ok(events.includes('local_runner_failed'));
  assert.ok(!events.includes('local_runner_completed'));
});

test('stall monitor warns after a long CPU turn and leaves game state untouched',async()=>{
  diagnosticLog.clear();
  const game=callStart();
  let release!:()=>void;
  const runner=new AutomaticTurnRunner({wait:()=>new Promise<void>(resolve=>{release=resolve;})});
  const pending=runner.run(()=>game,()=>{});
  while(!release) await new Promise<void>(resolve=>setImmediate(resolve));
  const realNow=Date.now;
  try { Date.now=()=>realNow()+31_000; runner.reportIfStalled('page-resumed'); }
  finally { Date.now=realNow; }
  const warning=diagnosticLog.all().find(entry=>entry.event==='local_cpu_turn_stalled');
  assert.ok(warning);assert.equal(warning.details.runnerState,'running');assert.equal(warning.details.waitingState,'waiting');
  assert.equal(runner.running,true);assert.equal(game.phase,'awaiting-discard');
  runner.cancel();release();await pending;
  assert.equal(runner.running,false);assert.equal(game.phase,'awaiting-discard');
});
