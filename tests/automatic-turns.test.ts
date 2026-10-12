import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/ui/controller.ts';
import { AutomaticTurnRunner, waitForTurn, type Wait } from '../src/game/automatic-turns.ts';
import { startGame } from '../src/game/start.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawOrStop } from '../src/game/draw.ts';
import type { GameState } from '../src/model/game.ts';
import { seeded, inventory } from './helpers.ts';

function manualWait() {
  const pending: { resolve: () => void; signal: AbortSignal }[] = [];
  const wait: Wait = (ms, signal) => {
    assert.equal(ms, 300);
    return new Promise(resolve => pending.push({ resolve, signal }));
  };
  return { wait, pending };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('CPU1, CPU2, CPU3 act once in order, return fourteen tiles to human and block rapid input', async () => {
  const { wait, pending } = manualWait();
  const initial = startGame(seeded(2));
  const states: GameState[] = [];
  const ui = new GameController(() => initial, { wait, random: () => 0, onChange: () => states.push(ui.game) });
  ui.select(ui.game.players[0].drawnTile!.id);
  const running = ui.confirm();
  assert.equal(ui.progressing, true);
  assert.equal(ui.game.turnPlayerId, 1);
  assert.equal(ui.game.players[0].drawnTile, null);
  assert.equal(ui.game.players[1].drawnTile, initial.liveWall[0]);
  const snapshot = ui.game;
  ui.select(ui.game.players[0].hand[0].id);
  await ui.confirm();
  assert.equal(ui.game, snapshot);
  assert.equal(pending.length, 1);
  for (const id of [1, 2, 3]) {
    assert.equal(ui.game.turnPlayerId, id);
    assert.equal(ui.game.players[id].river.length, 0);
    pending.shift()!.resolve();
    await flush();
    assert.equal(ui.game.players[id].river.length, 1);
  }
  await running;
  assert.equal(ui.progressing, false);
  assert.equal(ui.game.turnPlayerId, 0);
  assert.equal(ui.game.phase, 'awaiting-discard');
  assert.ok(ui.game.players[0].drawnTile);
  assert.equal(ui.game.liveWall.length, 65);
  assert.deepEqual(ui.game.players.map(p => p.river.length), [1, 1, 1, 1]);
  for (const state of states) inventory(state, initial);
  ui.select(ui.game.players[0].hand[0].id);
  assert.equal(ui.canConfirm, true);
});

test('old waits and old finally blocks cannot change a new game or duplicate its runner', async () => {
  const { wait, pending } = manualWait();
  let seed = 0;
  const ui = new GameController(() => startGame(seeded(seed++)), { wait });
  ui.select(ui.game.players[0].drawnTile!.id);
  const oldRun = ui.confirm();
  const old = pending.shift()!;
  ui.newGame();
  assert.equal(old.signal.aborted, true);
  assert.equal(ui.progressing, false);
  assert.equal(ui.selectedTileId, null);
  assert.equal(ui.game.phase, 'awaiting-discard');
  assert.equal(ui.game.liveWall.length, 69);
  assert.ok(ui.game.players.every(p => p.river.length === 0));
  const fresh = ui.game;
  old.resolve();
  await oldRun;
  assert.equal(ui.game, fresh);
  ui.select(ui.game.players[0].drawnTile!.id);
  const secondRun = ui.confirm();
  const second = pending.shift()!;
  ui.newGame();
  ui.select(ui.game.players[0].drawnTile!.id);
  const thirdRun = ui.confirm();
  const snapshot = ui.game;
  second.resolve();
  await secondRun;
  assert.equal(ui.game, snapshot);
  assert.equal(ui.progressing, true);
  await ui.confirm();
  assert.equal(pending.length, 1);
  for (let i = 0; i < 3; i++) { pending.shift()!.resolve(); await flush(); }
  await thirdRun;
  assert.deepEqual(ui.game.players.map(p => p.river.length), [1, 1, 1, 1]);
});

test('runner rejects overlapping starts and does no work after wall exhaustion', async () => {
  const { wait, pending } = manualWait();
  const runner = new AutomaticTurnRunner({ wait, random: () => 0.999 });
  const initial = startGame(seeded(3));
  let game = discardTile(initial, 0, initial.players[0].drawnTile!.id);
  const read = () => game, write = (next: GameState) => { game = next; };
  const first = runner.run(read, write);
  await runner.run(read, write);
  assert.equal(pending.length, 1);
  for (let i = 0; i < 3; i++) { pending.shift()!.resolve(); await flush(); }
  await first;
  assert.deepEqual(game.players.map(p => p.river.length), [1, 1, 1, 1]);
  const stopped = { ...game, phase: 'wall-exhausted' as const };
  game = stopped;
  await runner.run(read, write);
  assert.equal(game, stopped);
  assert.equal(pending.length, 0);
});

test('injected no-wait scheduling runs an entire game, stops after the final discard and resets', async () => {
  const initial = startGame(seeded(4));
  const states: GameState[] = [];
  const ui = new GameController(() => initial, { wait: async () => {}, random: seeded(5), onChange: () => states.push(ui.game) });
  let rounds = 0;
  while (ui.game.phase !== 'wall-exhausted') {
    ui.select(ui.game.players[0].drawnTile!.id);
    await ui.confirm();
    rounds++;
    assert.ok(rounds <= 18);
  }
  assert.equal(rounds, 18);
  assert.equal(ui.progressing, false);
  assert.equal(ui.game.liveWall.length, 0);
  assert.equal(ui.canConfirm, false);
  assert.deepEqual(ui.game.players.map(p => p.river.length), [18, 18, 17, 17]);
  for (const state of states) inventory(state, initial);
  const stopped = ui.game;
  ui.select(ui.game.players[0].hand[0].id);
  await ui.confirm();
  assert.equal(ui.game, stopped);
  ui.newGame();
  assert.equal(ui.game, initial);
  assert.equal(ui.selectedTileId, null);
});

test('final draw and final discard are also supported when the human consumes the last tile', async () => {
  const initial = startGame(seeded(8), 3);
  let game = initial;
  // The existing dealer parameter permits a real position with human's last draw.
  for (let discards = 0; discards < 69; discards++) {
    game = discardTile(game, game.turnPlayerId, game.players[game.turnPlayerId].drawnTile!.id);
    if (discards < 68) game = drawOrStop(game);
  }
  assert.equal(game.turnPlayerId, 0);
  assert.equal(game.liveWall.length, 1);
  const lastDraw = drawOrStop(game);
  assert.equal(lastDraw.liveWall.length, 0);
  const ui = new GameController(() => lastDraw, { wait: async () => {} });
  ui.select(lastDraw.players[0].drawnTile!.id);
  await ui.confirm();
  assert.equal(ui.game.phase, 'wall-exhausted');
  assert.equal(ui.game.turnPlayerId, 1);
  assert.equal(ui.game.players[0].drawnTile, null);
  assert.equal(ui.game.players[1].river.length, lastDraw.players[1].river.length);
  inventory(ui.game, initial);
});

test('real presentation wait resolves when cancelled, including an already aborted signal', async () => {
  const abort = new AbortController();
  const wait = waitForTurn(60_000, abort.signal);
  abort.abort();
  await wait;
  await waitForTurn(60_000, abort.signal);
});
