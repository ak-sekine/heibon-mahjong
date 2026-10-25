import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canDiscard, discardTile } from '../src/game/discard.ts';
import { drawOrStop } from '../src/game/draw.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { GameController } from '../src/ui/controller.ts';
import { createWall } from '../src/game/wall.ts';
import type { GameState } from '../src/model/game.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { createRiverTestState } from '../src/verification/river-test-fixture.ts';

function assertPhysicalInventory(game: GameState, drawnPlayerId = 0, requireDraw = true): void {
  const tiles = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
    ...player.hand,
    ...(player.drawnTile ? [player.drawnTile] : []),
    ...player.river,
    ...(player.melds ?? []).flatMap(meld => meld.tiles),
  ])];
  const canonical = new Map(createWall().map(tile => [tile.id, tileKindKey(tile.tile)]));
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(tile => tile.id)).size, 136);
  for (const tile of tiles) assert.equal(canonical.get(tile.id), tileKindKey(tile.tile));
  assert.equal(game.deadWall.length, 14);
  assert.ok(game.players.every(player => player.hand.length === 13 - 3 * (player.melds?.length ?? 0) + Number(Boolean(player.callDiscard))));
  if (requireDraw) assert.ok(game.players[drawnPlayerId].drawnTile);
  for (const player of game.players) {
    const history = new Set((player.discardHistory ?? []).map(tile => tile.id));
    assert.ok(player.river.every(tile => history.has(tile.id)));
  }
}

for (const count of [17, 18, 19, 23]) {
  test(`river test ${count} starts from a legal human discard turn and can append one real tile`, () => {
    const game = createRiverTestState(count);
    assert.equal(game.phase, 'awaiting-discard');
    assert.equal(game.dealerId, 0);
    assert.equal(game.turnPlayerId, 0);
    assert.deepEqual(game.players.map(player => player.control), ['human', 'cpu', 'cpu', 'cpu']);
    assert.equal(game.players[0].river.length, count);
    assertPhysicalInventory(game);

    const drawn = game.players[0].drawnTile!;
    const updated = discardTile(game, 0, drawn.id);
    assert.equal(updated.players[0].hand.length, game.players[0].hand.length);
    assert.equal(updated.players[0].drawnTile, null);
    assert.equal(updated.players[0].discardHistory!.at(-1)?.id, drawn.id);
    assert.ok(updated.players[0].river.length === count || updated.players[0].river.length === count + 1,
      'an automatically called discard is retained in history and moved to the caller meld');
    assertPhysicalInventory(updated, 0, false);
    if (count === 23) {
      assert.equal(updated.players[0].river.length, 24);
      assert.equal(drawOrStop(updated).phase, 'wall-exhausted');
    }
  });
}

test('24 and 25 tile actionable river states are rejected because 23 is the legal maximum', () => {
  for (const count of [24, 25]) assert.throws(() => createRiverTestState(count), RangeError);
});

test('18 tile start runs CPU turns and returns to the human for a 20th discard', async () => {
  const controller = new GameController(() => createRiverTestState(18), {
    wait: async () => {},
    chooseDiscard: player => player.drawnTile!.id,
  });
  for (const expectedRiverCount of [19, 20]) {
    assert.equal(controller.game.players[0].river.length, expectedRiverCount - 1);
    const selected = controller.game.players[0].drawnTile!.id;
    controller.select(selected);
    assert.equal(controller.canConfirm, true);
    await controller.confirm();
    assert.equal(controller.game.players[0].river.length, expectedRiverCount);
    assertPhysicalInventory(controller.game, 0, false);
    if (expectedRiverCount === 19) {
      assert.equal(controller.game.turnPlayerId, 0);
      assert.equal(controller.game.phase, 'awaiting-discard');
      assert.ok(controller.game.players[0].drawnTile);
    }
  }
});

test('CPU1 reaches a legal 18-tile discard turn and its ordinary CPU runner makes the 19th discard', async () => {
  const initial = createRiverTestState(18, 1);
  assert.equal(initial.phase, 'awaiting-discard');
  assert.equal(initial.dealerId, 0);
  assert.equal(initial.turnPlayerId, 1);
  assert.equal(initial.players[1].wind, 'south');
  assert.deepEqual(initial.players.map(player => player.control), ['human', 'cpu', 'cpu', 'cpu']);
  assert.equal(initial.players[1].river.length, 18);
  assert.equal(canDiscard(initial, 1), true);
  assertPhysicalInventory(initial, 1);

  let match = startMatch(initial);
  const transitions: Array<{ turn: number; phase: string; cpu1River: number }> = [];
  const runner = new AutomaticTurnRunner({ wait: async () => {} });
  await runner.runMatch(() => match, next => {
    transitions.push({
      turn: next.game.turnPlayerId,
      phase: next.game.phase,
      cpu1River: next.game.players[1].river.length,
    });
    match = next;
  });

  assert.equal(transitions[0]?.cpu1River, 19);
  assert.equal(transitions[0]?.turn, 2);
  assert.equal(transitions[0]?.phase, 'awaiting-draw');
  assert.equal(match.status, 'playing');
  assert.equal(match.game.players[1].river.length, 19);
  assert.equal(match.game.players[2].river.length, initial.players[2].river.length + 1);
  assert.equal(match.game.players[3].river.length, initial.players[3].river.length + 1);
  assert.equal(match.game.turnPlayerId, 0);
  assert.equal(match.game.phase, 'awaiting-discard');
  assertPhysicalInventory(match.game);

  const humanDiscard = match.game.players[0].drawnTile!;
  match = updateMatchGame(match, discardTile(match.game, 0, humanDiscard.id));
  await runner.runMatch(() => match, next => { match = next; });
  assert.equal(match.game.players[1].river.length, 20);
  assert.equal(match.game.players[1].discardHistory!.at(-1)?.id, match.game.players[1].river.at(-1)?.id);
  assert.equal(match.game.players[2].river.length, initial.players[2].river.length + 2);
  assert.equal(match.game.phase, 'wall-exhausted');
  assert.equal(match.status, 'round-ended');
  assertPhysicalInventory(match.game, 0, false);
});
