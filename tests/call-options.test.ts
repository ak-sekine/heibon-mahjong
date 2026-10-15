import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueCallOptions } from '../src/ui/call-options.ts';
import { getCallOptions, declareCall } from '../src/game/calls.ts';
import { discardTile } from '../src/game/discard.ts';
import { callStart } from './calls-fixture.ts';
import { inventory } from './helpers.ts';

for (const [name, hand, called, count] of [
  ['duplicate pon', ['555m','234p','678s','19p','12z'], 'red:man-5', 1],
  ['duplicate chi and distinct sequences', ['334467m','234p','19p','12z'], 'man-5', 3],
  ['red chi', ['4450m','234p','678s','19p','1z'], 'man-6', 2],
  ['red pon', ['550m','234p','678s','19p','12z'], 'man-5', 2],
] as const) test(`display ${name} retains executable physical options`, () => {
  const initial = callStart(3, {0: hand}, called);
  const game = discardTile(initial,3,initial.players[3].drawnTile!.id);
  const raw = getCallOptions(game,0).filter(o=>o.type!=='daiminkan');
  const options = uniqueCallOptions(raw);
  assert.equal(options.length,count);
  assert.ok(raw.length > options.length);
  assert.deepEqual(uniqueCallOptions([...raw].reverse()).map(o=>o.tiles.map(t=>`${t.tile.category==='suited'?t.tile.suit+ t.tile.rank: t.tile.honor}:${t.tile.isRed}`).sort().join()).sort(),
    options.map(o=>o.tiles.map(t=>`${t.tile.category==='suited'?t.tile.suit+ t.tile.rank: t.tile.honor}:${t.tile.isRed}`).sort().join()).sort());
  for (const option of options) {
    assert.ok(raw.includes(option));
    const result = declareCall(game,0,option.id);
    inventory(result, initial);
    assert.deepEqual(result.players[0].melds![0].tiles,option.tiles);
    for (const id of option.handTileIds) assert.ok(!result.players[0].hand.some(t=>t.id===id));
  }
  if (name.startsWith('red')) assert.deepEqual(options.map(o=>o.tiles.some(t=>t.tile.isRed)).sort(),[false,true]);
});
