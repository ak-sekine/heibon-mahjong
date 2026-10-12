import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { GameController } from '../src/ui/controller.ts';
import { discardTile } from '../src/game/discard.ts';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import type { GameState } from '../src/model/game.ts';
import { cpuTsumoStart, cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { freeze, inventory } from './helpers.ts';

for (const id of [1, 2, 3] as const) {
  test(`CPU${id}: common API, own wind, candidate, actual live draw and immutable inventory`, () => {
    const game = cpuTsumoGame(id), player = game.players[id];
    const snapshot = structuredClone(game); freeze(game);
    assert.equal(player.wind, ['east', 'south', 'west', 'north'][id]);
    assert.equal(canDeclareTsumo(game, id), true);
    const won = declareTsumo(game, id), result = won.winResult!;
    assert.deepEqual(game, snapshot);
    assert.equal(result.winnerId, id);
    assert.equal(result.winningTileId, player.drawnTile!.id);
    assert.equal(won.players, game.players);
    assert.equal(won.liveWall, game.liveWall);
    assert.equal(won.deadWall, game.deadWall);
    assert.deepEqual(result.analysis, analyzeYaku([...player.hand, player.drawnTile!].map(t => t.tile), {
      winMethod: 'tsumo', seatWind: player.wind, roundWind: 'east', winningTile: player.drawnTile!.tile,
    }));
    assert.deepEqual(result.candidate.yaku.map(y => y.id).sort(), ['menzen-tsumo', 'pinfu']);
    assert.equal(result.yakuHan, 2); assert.equal(result.doraCount, 1);
    assert.equal(result.redDoraCount, 2); assert.equal(result.totalHanIncludingDora, 5);
    assert.equal(canDeclareTsumo(won, id), false);
    assert.throws(() => declareTsumo(won, id), RangeError);
    inventory(won, game);
  });
  for (const [name, change] of [
    ['no draw', (g: GameState) => ({ ...g.players[id], drawnTile: null, drawnTileSource: null })],
    ['deal draw', (g: GameState) => ({ ...g.players[id], drawnTileSource: 'deal' })],
    ['duplicate ID', (g: GameState) => ({ ...g.players[id], drawnTile: g.players[id].hand[0] })],
    ['twelve hand', (g: GameState) => ({ ...g.players[id], hand: g.players[id].hand.slice(1) })],
  ] as const) test(`CPU${id} rejects ${name}`, () => {
    const g = cpuTsumoGame(id);
    const game = { ...g, players: g.players.map(p => p.id === id ? change(g) : p) } as GameState;
    assert.equal(canDeclareTsumo(game, id), false);
    assert.throws(() => declareTsumo(game, id), RangeError);
  });
  test(`CPU${id} rejects wrong turn, unfinished shape and awaiting draw`, () => {
    const g = cpuTsumoGame(id);
    assert.equal(canDeclareTsumo({ ...g, turnPlayerId: 0 }, id), false);
    assert.equal(canDeclareTsumo({ ...g, phase: 'awaiting-draw' }, id), false);
    assert.equal(canDeclareTsumo(cpuTsumoGame(id, ['124578m', '124p', '789s', '11z']), id), false);
  });
  test(`CPU${id} automatic win precedes strategy, consumes no winning-turn RNG, stops and notifies`, async () => {
    const initial = cpuTsumoStart(id);
    let game = discardTile(initial, 0, initial.players[0].drawnTile!.id);
    let calls = 0, randomCalls = 0, complete = 0;
    const runner = new AutomaticTurnRunner({
      wait: async ms => { assert.equal(ms, 300); },
      random: () => { randomCalls++; return 0.999; },
      chooseDiscard: (p, random) => { calls++; assert.notEqual(p.id, id); random(); return p.drawnTile!.id; },
    });
    const states: GameState[] = [];
    await runner.run(() => game, next => { game = next; states.push(next); }, () => complete++);
    assert.equal(game.phase, 'won'); assert.equal(game.winResult!.winnerId, id);
    assert.equal(calls, id - 1); assert.equal(randomCalls, id - 1);
    assert.equal(game.players[id].river.length, 0);
    assert.equal(game.liveWall.length, initial.liveWall.length - id);
    assert.equal(game.players[id].drawnTile, initial.liveWall[id - 1]);
    assert.equal(runner.running, false); assert.equal(complete, 1);
    for (const state of states) inventory(state, initial);
    const won = game;
    await runner.run(() => game, next => { game = next; });
    assert.equal(game, won); assert.equal(calls, id - 1);
  });
  test(`CPU${id} real 300ms boundary, overlapping start and cancelled winning wait`, async () => {
    const initial = cpuTsumoGame(id);
    let game = initial, resolve!: () => void;
    let signal!: AbortSignal, completed = 0;
    const runner = new AutomaticTurnRunner({ wait: (ms, s) => {
      assert.equal(ms, 300); signal = s; return new Promise(r => { resolve = r; });
    }, chooseDiscard: () => { throw Error('winning CPU must never discard'); } });
    const old = runner.run(() => game, next => { game = next; }, () => completed++);
    await runner.run(() => game, next => { game = next; });
    assert.equal(game, initial); assert.equal(runner.running, true);
    runner.cancel(); game = cpuTsumoStart(id); const fresh = game;
    assert.equal(signal.aborted, true); resolve(); await old;
    assert.equal(game, fresh); assert.equal(completed, 0); assert.equal(runner.running, false);
  });
  test(`CPU${id} latest state wins only once and controller remains human-only`, async () => {
    let game = cpuTsumoGame(id), resolve!: () => void;
    const runner = new AutomaticTurnRunner({ wait: () => new Promise(r => { resolve = r; }) });
    const run = runner.run(() => game, next => { game = next; });
    game = declareTsumo(game, id); const won = game;
    resolve(); await run;
    assert.equal(game, won); assert.equal(runner.running, false);
    const ui = new GameController(() => won);
    assert.equal(ui.canTsumo, false); ui.declareTsumo(); assert.equal(ui.game, won);
    ui.newGame(); assert.equal(ui.progressing, false);
  });
  test(`CPU${id} own wind triplet and yakuman exclude dora han`, () => {
    const groups = ['123m', '456m', '789p', `${id+1}${id+1}${id+1}z`, '66s'];
    const result = declareTsumo(cpuTsumoGame(id, groups), id).winResult!;
    assert.ok(result.candidate.yaku.some(y => y.id === 'yakuhai-seat-wind'));
    assert.ok(!result.candidate.yaku.some(y => y.id === 'yakuhai-round-wind'));
    const yakuman = declareTsumo(cpuTsumoGame(id, ['19m', '19p', '19s', '12345677z'], 'man-9'), id).winResult!;
    assert.equal(yakuman.yakumanCount, 1); assert.equal(yakuman.doraCount, 1);
    assert.equal(yakuman.doraHan, 0); assert.equal(yakuman.redDoraHan, 0);
    assert.equal(yakuman.totalHanIncludingDora, 0);
  });
}
