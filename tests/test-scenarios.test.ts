import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../src/ui/controller.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai } from '../src/game/special-draws.ts';
import { nextRound, startMatch, updateMatchGame } from '../src/game/match.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { getTestScenario, testScenarios } from '../src/verification/test-scenarios.ts';

test('all four deterministic nine terminals scenarios preserve the complete physical wall', () => {
  for (const scenario of testScenarios) {
    const game = scenario.generateInitialGameState();
    const allTiles = [
      ...game.players.flatMap(player => [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]),
      ...game.liveWall,
      ...game.deadWall,
    ];
    assert.equal(allTiles.length, 136, scenario.id);
    assert.equal(new Set(allTiles.map(tile => tile.id)).size, 136, scenario.id);
    assert.equal(game.deadWall.length, 14, scenario.id);
    assert.equal(game.liveWall.length, 69, scenario.id);
    assert.equal(game.players[scenario.targetPlayerId].hand.length, 13, scenario.id);
    assert.ok(canDeclareKyuushuKyuuhai(game, scenario.targetPlayerId), scenario.id);
    const eligible = game.players[scenario.targetPlayerId];
    const terminals = [...eligible.hand, eligible.drawnTile!]
      .filter(tile => tile.tile.category === 'honor' || tile.tile.category === 'suited' && [1, 9].includes(tile.tile.rank));
    assert.ok(new Set(terminals.map(tile => tileKindKey(tile.tile))).size >= 9, scenario.id);
    const repeat = scenario.generateInitialGameState();
    assert.deepEqual(
      [game.players[scenario.targetPlayerId].hand, game.players[scenario.targetPlayerId].drawnTile, game.liveWall, game.deadWall],
      [repeat.players[scenario.targetPlayerId].hand, repeat.players[scenario.targetPlayerId].drawnTile, repeat.liveWall, repeat.deadWall],
      `${scenario.id}: repeat must be deterministic`,
    );
    assert.equal(new Set(allTiles.map(tile => tileKindKey(tile.tile))).size, 34, scenario.id);
    for (const kind of new Set(allTiles.map(tile => tileKindKey(tile.tile)))) {
      assert.equal(allTiles.filter(tile => tileKindKey(tile.tile) === kind).length, 4, `${scenario.id}: ${kind}`);
    }
  }
});

test('human declares through the rule function and the next round clears public declaration state', () => {
  const scenario = getTestScenario('kyuushu-self');
  const match = startMatch(scenario.generateInitialGameState());
  assert.ok(canDeclareKyuushuKyuuhai(match.game, 0));
  const ended = updateMatchGame(match, declareKyuushuKyuuhai(match.game, 0));
  assert.equal(ended.game.abortiveDrawPlayerId, 0);
  const next = nextRound(ended, dealerId => getTestScenario('kyuushu-self').generateInitialGameState());
  assert.equal(next.game.abortiveDrawPlayerId, undefined);
  assert.equal(next.game.abortiveDraw, undefined);
  assert.equal(next.game.phase, 'awaiting-discard');
});

test('CPU scenarios use the normal automatic CPU declaration path', async () => {
  for (const scenario of testScenarios.slice(1)) {
    const controller = new GameController(() => scenario.generateInitialGameState());
    const cpuRunner = new AutomaticTurnRunner({ wait: async () => {} });
    await cpuRunner.runMatch(() => controller.match, match => { controller.match = match; });
    assert.equal(controller.game.abortiveDraw, 'kyuushu-kyuuhai', scenario.id);
    assert.equal(controller.game.abortiveDrawPlayerId, scenario.targetPlayerId, scenario.id);
    assert.equal(controller.game.phase, 'wall-exhausted', scenario.id);
    controller.newGame();
  }
});
