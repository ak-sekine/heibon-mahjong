import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/start.ts';
import { drawTile, drawOrStop } from '../src/game/draw.ts';
import { discardTile } from '../src/game/discard.ts';
import { nextPlayerId, stopAtEmptyWall } from '../src/game/turn.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { seeded, transition, inventory } from './helpers.ts';

test('draw moves the first live tile only, preserving hand, dead wall and source', () => {
  const initial = startGame(seeded(1));
  const waiting = discardTile(initial, 0, initial.players[0].drawnTile!.id);
  const result = transition(waiting, initial, game => drawTile(game, 1));
  assert.equal(result.liveWall.length, waiting.liveWall.length - 1);
  assert.equal(result.players[1].drawnTile, waiting.liveWall[0]);
  assert.equal(result.players[1].hand, waiting.players[1].hand);
  assert.equal(result.deadWall, waiting.deadWall);
  assert.equal(result.turnPlayerId, 1);
  assert.equal(result.phase, 'awaiting-discard');
  assert.throws(() => drawTile(result, 1), RangeError);
});

test('wrong player, phase, hand size, occupied drawn slot and empty wall are rejected', () => {
  const initial = startGame();
  const game = discardTile(initial, 0, initial.players[0].drawnTile!.id);
  const snapshot = structuredClone(game);
  for (const id of [0, 2, 3, 99] as const) assert.throws(() => drawTile(game, id as 0), RangeError);
  assert.throws(() => drawTile(initial, 0), RangeError);
  assert.throws(() => drawTile({ ...game, phase: 'wall-exhausted' }, 1), RangeError);
  assert.throws(() => drawTile({ ...game, liveWall: [] }, 1), RangeError);
  for (const length of [12, 14]) {
    const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
    players[1] = { ...players[1], hand: Array.from({ length }, () => players[1].hand[0]) };
    assert.throws(() => drawTile({ ...game, players }, 1), RangeError);
  }
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[1] = { ...players[1], drawnTile: game.liveWall[0] };
  assert.throws(() => drawTile({ ...game, players }, 1), RangeError);
  assert.throws(() => stopAtEmptyWall(game), RangeError);
  assert.throws(() => nextPlayerId(99 as 0), RangeError);
  assert.deepEqual(game, snapshot);
});

test('all seats consume the complete live wall across many rounds with inventory conserved at every transition', () => {
  for (let seed = 0; seed < 20; seed++) {
    const random = seeded(seed);
    const initial = startGame(random);
    let game = initial;
    let discards = 0;
    let draws = 0;
    inventory(game, initial);
    while (game.phase !== 'wall-exhausted') {
      if (game.phase === 'awaiting-draw') {
        const remaining = game.liveWall.length;
        game = transition(game, initial, drawOrStop);
        if (remaining) draws++;
        else break;
      }
      const id = game.turnPlayerId;
      assert.equal(id, discards % 4);
      const player = game.players[id];
      const tile = [...player.hand, player.drawnTile!][Math.floor(random() * 14)];
      assert.equal(player.hand.length, 13);
      assert.ok(player.drawnTile);
      // Zero live tiles still permit the final discard.
      if (draws === 69) assert.equal(game.liveWall.length, 0);
      game = transition(game, initial, state => discardTile(state, id, tile.id));
      assert.equal(game.players[id].river.at(-1), tile);
      assert.equal(game.players[id].drawnTile, null);
      assert.equal(game.turnPlayerId, (id + 1) % 4);
      assert.equal(game.phase, 'awaiting-draw');
      assert.throws(() => discardTile(game, id, game.players[id].hand[0].id), RangeError);
      discards++;
    }
    assert.equal(draws, 69);
    assert.equal(discards, 70);
    assert.equal(game.turnPlayerId, 2);
    assert.deepEqual(game.players.map(p => p.river.length), [18, 18, 17, 17]);
    assert.equal(game.liveWall.length, 0);
    for (const player of game.players) {
      assert.throws(() => drawTile(game, player.id), RangeError);
      assert.throws(() => discardTile(game, player.id, player.hand[0].id), RangeError);
    }
    assert.throws(() => drawOrStop(game), RangeError);
  }
});

test('malformed discard hand and missing drawn tile are rejected for every seat', () => {
  for (const id of [0, 1, 2, 3] as const) {
    const game: GameState = startGame(undefined, id);
    for (const player of [{ ...game.players[id], drawnTile: null }, { ...game.players[id], hand: game.players[id].hand.slice(1) }]) {
      const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
      players[id] = player;
      assert.throws(() => discardTile({ ...game, players }, id, game.players[id].drawnTile!.id), RangeError);
    }
  }
});
