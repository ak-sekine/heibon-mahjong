import assert from 'node:assert/strict';
import { test } from 'node:test';
import { declareCall, getCallOptions, passCalls } from '../src/game/calls.ts';
import { declareKan, getKanOptions } from '../src/game/kan.ts';
import type { GameState, PhysicalTile } from '../src/model/game.ts';
import { scenarioGame, type Scenario } from '../src/verification/scenarios.ts';

const cases = ['pon', 'daiminkan', 'ankan', 'kakan'] as const satisfies readonly Scenario[];

function assertCompletePhysicalWall(game: GameState): void {
  const physical: PhysicalTile[] = [
    ...game.liveWall,
    ...game.deadWall,
    ...game.players.flatMap(player => [
      ...player.hand,
      ...(player.drawnTile ? [player.drawnTile] : []),
      ...player.river,
      ...player.melds.flatMap(meld => meld.tiles),
    ]),
  ];
  assert.equal(physical.length, 136);
  assert.equal(new Set(physical.map(tile => tile.id)).size, 136);
}

test('call test fixtures use 136 unique physical tiles and expose only legal actions', () => {
  for (const mode of cases) {
    const game = scenarioGame(mode);
    assertCompletePhysicalWall(game);

    if (mode === 'pon' || mode === 'daiminkan') {
      const options = getCallOptions(game, 0);
      assert.equal(game.phase, 'awaiting-call');
      assert.equal(game.turnPlayerId, 3);
      if (mode === 'pon') assert.deepEqual(options.map(option => option.type), ['pon']);
      else {
        assert.equal(options.filter(option => option.type === 'pon').length, 3);
        assert.equal(options.filter(option => option.type === 'daiminkan').length, 1);
      }
      const selected = options.find(option => option.type === mode);
      assert.ok(selected, `${mode} must be a legal choice`);
      assertCompletePhysicalWall(declareCall(game, 0, selected.id));

      const passed = passCalls(game, 0);
      assert.equal(passed.ronWindow, null);
      assert.notEqual(passed.phase, 'awaiting-call');
      assert.equal(passed.turnPlayerId, 0);
      assertCompletePhysicalWall(passed);
      continue;
    }

    const options = getKanOptions(game, 0);
    assert.deepEqual(options.map(option => option.meld.type), [mode]);
    const completed = declareKan(game, 0, options[0].id);
    assert.equal(completed.kanCount, 1);
    assert.equal(completed.players[0].drawnTileSource, 'rinshan');
    assertCompletePhysicalWall(completed);
  }
});

test('call test page is isolated from game navigation and standalone itch build entry points', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../call-test.html', import.meta.url), 'utf8');
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/>/u);
  assert.match(html, /id="local-game-layout"/u);
  assert.match(html, /href="\.\/"[^>]*>通常対局へ戻る</u);
  assert.match(vite, /callTest:\s*'call-test\.html'/u);
  assert.match(vite, /isItchBuild\s*\?\s*\{\s*main:\s*'index\.html'\s*\}/u);
});
