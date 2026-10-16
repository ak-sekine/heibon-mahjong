import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioGame, scenarioHelp } from '../src/verification/scenarios.ts';
import type { Scenario } from '../src/verification/scenarios.ts';
import { allTiles } from './helpers.ts';
import { declareKan, getKanOptions } from '../src/game/kan.ts';
import { declareRon, passRon } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
for (const mode of Object.keys(scenarioHelp) as Scenario[]) test(`public scenario ${mode} has 136 unique physical tiles`, () => {
  const tiles = allTiles(scenarioGame(mode));
  assert.equal(tiles.length, 136);
  assert.equal(new Set(tiles.map(t => t.id)).size, 136);
});
test('public multiple scenario allows two real kans', () => {
  let g = scenarioGame('multiple');
  for (let i = 0; i < 2; i++) g = declareKan(g, 0, getKanOptions(g, 0)[0].id);
  assert.equal(g.kanCount, 2);
  assert.equal(allTiles(g).length, 136);
});
test('public robbery supports both normal ron scoring and passing', () => {
  const g = scenarioGame('chankan');
  const pending = declareKan(g, 1, getKanOptions(g, 1)[0].id);
  assert.equal(pending.phase, 'awaiting-ron');
  assert.equal(declareRon(pending, 0).phase, 'won');
  assert.equal(passRon(pending, 0).players[1].melds[0].type, 'kakan');
});
test('public rinshan uses actual scoring', () => {
  const g = scenarioGame('rinshan');
  const won = declareTsumo(declareKan(g, 0, getKanOptions(g, 0)[0].id), 0);
  assert.equal(won.winResult!.winMethod, 'tsumo');
});
