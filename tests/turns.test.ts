import { passCalls } from '../src/game/calls.ts';
import { isForbiddenDiscard } from '../src/game/melds.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/start.ts';
import { drawTile, drawOrStop } from '../src/game/draw.ts';
import { passRon } from '../src/game/ron.ts';
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

test('seeded games preserve inventory through exhaustion or early ron; seed zero consumes the complete wall', () => {
  for (let seed = 0; seed < 20; seed++) {
    const random = seeded(seed);
    const initial = startGame(random);
    let game = initial;
    let discards = 0;
    let draws = 0;
    inventory(game, initial);
    while (game.phase !== 'wall-exhausted' && game.phase !== 'won') {
      if (game.phase === 'awaiting-ron') game = transition(game, initial, g => passRon(g, 0));
      if (game.phase === 'awaiting-call') game = transition(game, initial, g => passCalls(g,0));
      if (game.phase === 'won') break;
      if (game.phase === 'awaiting-draw') {
        const remaining = game.liveWall.length;
        game = transition(game, initial, drawOrStop);
        if (remaining) draws++;
        else break;
      }
      const id = game.turnPlayerId;
      assert.ok([0,1,2,3].includes(id));
      const player = game.players[id];
      const candidates = [...player.hand,...(player.drawnTile?[player.drawnTile]:[])].filter(t=>!isForbiddenDiscard(player,t.id));
      const tile = candidates[Math.floor(random()*candidates.length)];
      assert.equal(player.hand.length,13-3*(player.melds?.length ?? 0)+Number(Boolean(player.callDiscard)));
      assert.ok(player.drawnTile || player.callDiscard);
      // Zero live tiles still permit the final discard.
      if (draws === 69) assert.equal(game.liveWall.length, 0);
      game = transition(game, initial, state => discardTile(state, id, tile.id));
      assert.ok(game.players[id].river.includes(tile) || game.players.some(p=>p.melds?.some(m=>m.calledTileId===tile.id)));
      assert.equal(game.players[id].drawnTile, null);
      if (game.phase === 'awaiting-draw') assert.equal(game.turnPlayerId, (id + 1) % 4);
      else assert.ok(['awaiting-call','awaiting-discard','awaiting-ron','won'].includes(game.phase));
      assert.throws(() => discardTile(game, id, game.players[id].hand[0].id), RangeError);
      discards++;
    }
    if (game.phase === 'won') {
      assert.notEqual(seed, 0, 'fixed seed zero must retain full-wall coverage');
      inventory(game, initial);
      continue;
    }
    assert.equal(draws, 69);
    assert.equal(discards,70+game.players.reduce((n,p)=>n+(p.melds?.length ?? 0),0));
    assert.equal(game.players.reduce((n,p)=>n+(p.discardHistory?.length ?? p.river.length),0),discards);
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
