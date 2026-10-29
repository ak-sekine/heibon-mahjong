import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawSeatAssignment, type MatchParticipant } from '../src/game/seating.ts';
import { riverPositionFor } from '../src/rendering/river-layout.ts';
import { GameController } from '../src/ui/controller.ts';
import { settleRound } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import { fixedRound } from './match-fixture.ts';
import { seeded } from './helpers.ts';

const participants: [MatchParticipant, MatchParticipant, MatchParticipant, MatchParticipant] = [
  { id: 'human', control: 'human', name: '自分' },
  { id: 'cpu1', control: 'cpu', name: 'CPU1' },
  { id: 'cpu2', control: 'cpu', name: 'CPU2' },
  { id: 'cpu3', control: 'cpu', name: 'CPU3' },
];

function choicesRandom([forFour, forThree, forTwo]: readonly [number, number, number]): () => number {
  const limits = [4, 3, 2];
  const values = [forFour, forThree, forTwo];
  let index = 0;
  return () => (values[index] + 0.25) / limits[index++];
}

async function advanceToHumanTurn(controller: GameController, humanSeat: number): Promise<void> {
  for (let step = 0; step < 64; step++) {
    while (controller.progressing) await new Promise<void>(resolve => setImmediate(resolve));
    if (controller.game.phase === 'awaiting-discard' && controller.game.turnPlayerId === humanSeat) return;
    if (controller.game.phase === 'awaiting-call') {
      await controller.passCalls();
      continue;
    }
    if (controller.game.phase === 'awaiting-ron' && controller.canRon) {
      await controller.passRon();
      continue;
    }
    if (controller.game.phase === 'won' || controller.game.phase === 'wall-exhausted') break;
  }
  throw new Error(`Game did not return to human seat ${humanSeat}`);
}

test('Fisher–Yates seating is deterministic and can produce every one of the 24 orders', () => {
  const orders = new Set<string>();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
    const picks = [a, b, c] as const;
    const assigned = drawSeatAssignment(participants, choicesRandom(picks));
    assert.deepEqual(drawSeatAssignment(participants, choicesRandom(picks)), assigned);
    assert.equal(new Set(assigned.map(person => person.id)).size, 4);
    orders.add(assigned.map(person => person.id).join(','));
  }
  assert.equal(orders.size, 24);
});

test('large deterministic sample gives each seating approximately equal frequency', () => {
  let state = 0x5eed1234;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
  const counts = new Map<string, number>();
  const eastCounts = new Map<string, number>();
  for (let sample = 0; sample < 24_000; sample++) {
    const assigned = drawSeatAssignment(participants, random);
    const order = assigned.map(person => person.id).join(',');
    counts.set(order, (counts.get(order) ?? 0) + 1);
    const east = assigned[0].id;
    eastCounts.set(east, (eastCounts.get(east) ?? 0) + 1);
  }
  assert.equal(counts.size, 24);
  assert.ok([...counts.values()].every(count => Math.abs(count - 1000) < 100));
  assert.ok(participants.every(person => Math.abs((eastCounts.get(person.id) ?? 0) - 6000) < 300));
});

test('seat assignment forwards invalid random values to the validated shuffle', () => {
  assert.throws(() => drawSeatAssignment(participants, () => 1), /Random source must return a value/);
});

test('the default offline controller randomizes only when a new match is requested', async () => {
  for (let humanPosition = 0; humanPosition < 4; humanPosition++) {
    const picks = Array.from({ length: 24 }, (_, order) => [Math.floor(order / 6), Math.floor(order / 2) % 3, order % 2] as const)
      .find(value => drawSeatAssignment(participants, choicesRandom(value)).findIndex(person => person.control === 'human') === humanPosition)!;
    const controller = new GameController(undefined, {
      startImmediately: false,
      random: choicesRandom(picks),
      wait: async () => {},
    });
    assert.equal(controller.hasGame, false);
    controller.newGame('tonpu');
    assert.equal(controller.playerSeat, humanPosition);
    assert.equal(controller.game.players[humanPosition].control, 'human');
    assert.equal(controller.match.format, 'tonpu');
    while (controller.progressing) await new Promise<void>(resolve => setImmediate(resolve));
  }
});

test('offline seating puts the human in all four seats, keeps the hand below, and preserves seats across rounds', async () => {
  for (let humanPosition = 0; humanPosition < 4; humanPosition++) {
    // Choose a shuffle whose first result position is exactly the requested ID.
    const found = Array.from({ length: 64 }, (_, seed) => seed).find(seed => {
      let state = seed;
      const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
      return drawSeatAssignment(participants, random).findIndex(person => person.control === 'human') === humanPosition;
    });
    assert.notEqual(found, undefined);
    let state = found!;
    const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
    const controller = new GameController(undefined, { startImmediately: false, randomizeSeating: true, random, wait: () => Promise.resolve() });
    controller.newGame('tonpu');
    assert.equal(controller.playerSeat, humanPosition);
    assert.equal(controller.game.players[humanPosition].control, 'human');
    assert.equal(controller.game.players.filter(player => player.control === 'human').length, 1);
    assert.equal(controller.game.dealerId, 0);
    assert.equal(riverPositionFor(controller.playerSeat, controller.playerSeat), 'bottom');
    assert.deepEqual(controller.game.players.map(player => player.wind), ['east', 'south', 'west', 'north']);
    assert.equal(new Set(controller.playerNames).size, 4);

    controller.match = settleRound({ ...controller.match, game: fixedRound(0, []) });
    const pending = controller.nextRound();
    assert.equal(controller.playerSeat, humanPosition);
    assert.equal(controller.game.players[humanPosition].control, 'human');
    assert.equal(controller.game.dealerId, 1);
    await pending;
  }
});

test('randomized offline turns return control to the human and keep the seat through East-to-South progress', async () => {
  for (let humanPosition = 0; humanPosition < 4; humanPosition++) {
    const picks = Array.from({ length: 24 }, (_, order) => [Math.floor(order / 6), Math.floor(order / 2) % 3, order % 2] as const)
      .find(value => drawSeatAssignment(participants, choicesRandom(value)).findIndex(person => person.control === 'human') === humanPosition)!;
    const controller = new GameController(dealerId => startGame(seeded(0x515), dealerId), {
      startImmediately: false,
      randomizeSeating: true,
      random: choicesRandom(picks),
      wait: async () => {},
      chooseDiscard: player => player.drawnTile?.id ?? player.hand[0].id,
    });
    controller.newGame('tonnan');
    await advanceToHumanTurn(controller, humanPosition);

    assert.equal(controller.playerSeat, humanPosition);
    assert.equal(controller.match.format, 'tonnan');
    assert.equal(controller.game.turnPlayerId, humanPosition);
    assert.equal(controller.game.players[humanPosition].control, 'human');
    assert.equal(controller.game.dealerId, 0);
    const drawnTileId = controller.game.players[humanPosition].drawnTile!.id;
    controller.select(drawnTileId);
    assert.equal(controller.canConfirm, true);
    await controller.confirm();
    await advanceToHumanTurn(controller, humanPosition);
    assert.equal(controller.game.players[humanPosition].river.length, 1);
    assert.equal(controller.game.turnPlayerId, humanPosition);
    assert.equal(controller.game.players[humanPosition].control, 'human');

    for (let completedRound = 0; completedRound < 4; completedRound++) {
      controller.match = settleRound({
        ...controller.match,
        game: fixedRound(controller.match.dealerId, []),
      });
      await controller.nextRound();
      assert.equal(controller.playerSeat, humanPosition);
      assert.equal(controller.game.players[humanPosition].control, 'human');
      assert.equal(controller.game.dealerId, (completedRound + 1) % 4);
    }
    assert.equal(controller.match.roundWind, 'south');
    assert.equal(controller.match.roundNumber, 1);
    assert.equal(controller.game.players.filter(player => player.control === 'human').length, 1);
  }
});
