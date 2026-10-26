import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticLog, installGlobalErrorDiagnostics, recordGameRenderFailure, safeErrorInfo, sanitizeDiagnosticMessage } from '../src/online/diagnostics.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

test('diagnostic log keeps the newest 500 allowlisted entries and survives reload', async () => {
  const storage = new MemoryStorage();
  const log = new DiagnosticLog(storage);
  for (let index = 0; index < 505; index++) {
    log.record('INFO', 'game_action_completed', { actionType: 'discard', requestId: `req-${index}`, gameRevision: index, secret: 'must not be saved', ticket: 'c'.repeat(64) });
  }
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(log.all().length, 500);
  assert.equal(log.all()[0]?.details.requestId, 'req-5');
  assert.match(log.all()[0]!.timestamp, /^\d{4}-\d\d-\d\dT.*\.\d{3}Z$/u);
  assert.equal(JSON.stringify(log.all()).includes('must not be saved'), false);
  assert.equal(JSON.stringify(log.all()).includes('secret'), false);
  assert.equal(JSON.stringify(log.all()).includes('c'.repeat(64)), false);
  const restored = new DiagnosticLog(storage);
  assert.equal(restored.all().length, 500);
  assert.equal(restored.all()[499]?.details.requestId, 'req-504');
});

test('diagnostic logging safely ignores unavailable and throwing storage', async () => {
  const unavailable = new DiagnosticLog(null);
  assert.doesNotThrow(() => unavailable.record('ERROR', 'action_response_timeout', { requestId: 'abc', durationMs: 15000 }));
  assert.equal(unavailable.all().length, 1);
  const broken = { getItem: () => { throw new Error('private storage exception'); }, setItem: () => { throw new Error('private storage exception'); }, removeItem: () => { throw new Error('private storage exception'); } };
  const log = new DiagnosticLog(broken);
  assert.doesNotThrow(() => log.record('WARN', 'websocket_disconnected', { closeCode: 1006 }));
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(log.all().length, 1);
  assert.doesNotThrow(() => log.clear());
});

test('diagnostic buffer protects warnings and errors from frequent CPU progress events',()=>{
  const log=new DiagnosticLog(null);
  for(let index=0;index<500;index++)log.record('INFO','local_cpu_turn_completed',{turnId:`local-${index}`,seat:index%4,phase:'awaiting-discard'});
  log.record('ERROR','local_game_render_failed',{errorName:'RangeError',errorMessage:'layout failed',source:'renderTable'});
  for(let index=0;index<500;index++)log.record('INFO','local_cpu_turn_completed',{turnId:`later-${index}`,seat:index%4,phase:'awaiting-discard'});
  assert.equal(log.all().length,500);
  assert.ok(log.all().some(entry=>entry.event==='local_game_render_failed'));
  assert.equal(log.all().at(-1)?.details.turnId,'later-499');
});

test('critical CPU start checkpoint survives before the deferred full log save',()=>{
  const storage=new MemoryStorage(), log=new DiagnosticLog(storage);
  log.record('INFO','local_cpu_stage_started',{cpuTurnId:'local-9',stage:'discard_selection',seat:2,phase:'awaiting-discard'});
  const restored=new DiagnosticLog(storage);
  assert.equal(restored.all().at(-1)?.event,'local_cpu_stage_started');
  assert.equal(restored.all().at(-1)?.details.cpuTurnId,'local-9');
});

test('high priority build and CPU starts survive routine log overflow',()=>{
  const log=new DiagnosticLog(null);
  log.record('INFO','app_build_info',{gitSha:'abc123',buildTimeUtc:'2026-10-26T00:00:00.000Z',schemaVersion:2});
  log.record('INFO','local_cpu_turn_started',{cpuTurnId:'local-1',seat:2});
  for(let index=0;index<600;index++)log.record('INFO','routine_event',{seat:index%4});
  assert.ok(log.all().some(entry=>entry.event==='app_build_info'));
  assert.ok(log.all().some(entry=>entry.event==='local_cpu_turn_started'));
});

test('exception text is scrubbed before it enters diagnostic entries',()=>{
  const log=new DiagnosticLog(null);
  const info=safeErrorInfo(new Error('failed tile-man-5 token=secret123 at https://private.example/path'));
  log.record('ERROR','window_error',{...info,source:'window.error'});
  const serialized=JSON.stringify(log.all());
  assert.equal(serialized.includes('man-5'),false);
  assert.equal(serialized.includes('secret123'),false);
  assert.equal(serialized.includes('private.example'),false);
  assert.match(sanitizeDiagnosticMessage('failed [ticket: value]'),/redacted/u);
  assert.equal(log.all()[0]?.details.errorName,'Error');
});

test('diagnostic error extraction does not throw on hostile error getters',()=>{
  const error=new Proxy({}, {get(){throw new Error('private getter failure');}});
  assert.doesNotThrow(()=>safeErrorInfo(error));
  assert.doesNotThrow(()=>recordGameRenderFailure(new DiagnosticLog(null),{seat:0,phase:'awaiting-discard',riverCounts:'0,0,0,0'},error,'main.render'));
});

test('render failure records safe turn, phase, river counts, and failure location',()=>{
  const log=new DiagnosticLog(null);
  recordGameRenderFailure(log,{turnId:'local-4',seat:2,phase:'awaiting-discard',riverCounts:'9,8,9,7'},
    new RangeError('Riichi declaration tile is missing from player 2 river'),'main.render>renderTable');
  const details=log.all()[0]?.details;
  const {errorId,stack,...safeDetails}=details!;
  assert.deepEqual(safeDetails,{turnId:'local-4',seat:2,phase:'awaiting-discard',riverCounts:'9,8,9,7',errorName:'RangeError',errorMessage:'Riichi declaration tile is missing from player 2 river',errorCode:'rangeerror',source:'main.render>renderTable'});
  assert.match(String(stack),/RangeError/u);
  assert.match(String(errorId),/^exception-\d+$/u);
});

test('global error and rejection listeners record once without suppressing the events',()=>{
  const log=new DiagnosticLog(null);
  const listeners=new Map<string,(event:any)=>void>();
  const original=globalThis.window;
  globalThis.window={
    addEventListener:(type:string,listener:EventListenerOrEventListenerObject)=>listeners.set(type,listener as (event:any)=>void),
    setTimeout:(callback:TimerHandler,delay?:number)=>setTimeout(callback,delay),
    clearTimeout:(id:number)=>clearTimeout(id),
  } as unknown as Window;
  try {
    installGlobalErrorDiagnostics(log);
    const error=new Error('tile-man-5 token=private-value');
    listeners.get('error')!({error,message:error.message});
    listeners.get('unhandledrejection')!({reason:error});
    listeners.get('unhandledrejection')!({reason:new Error('async failure')});
    assert.deepEqual(log.all().map(entry=>entry.event),['window_error','unhandled_rejection']);
    assert.equal(JSON.stringify(log.all()).includes('private-value'),false);
    assert.equal(JSON.stringify(log.all()).includes('man-5'),false);
  } finally { globalThis.window=original; }
});
