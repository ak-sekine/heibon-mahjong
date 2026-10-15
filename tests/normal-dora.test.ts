import { setupDiscard } from './setup-discard.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDora, countRedDora, doraKindFromIndicator } from '../src/analysis/dora.ts';
import { exposedDoraIndicators, DORA_INDICATOR_INDICES } from '../src/game/dora.ts';
import { ordinaryTile, redFive, tileKindKey, type Tile, type Rank, type Honor } from '../src/model/tile.ts';
import { tsumoStart, tsumoGame, RED_PINFU } from './tsumo-fixture.ts';
import { declareTsumo, selectTsumoCandidate } from '../src/game/tsumo.ts';
import { analyzeYaku } from '../src/analysis/yaku.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawOrStop } from '../src/game/draw.ts';
import { GameController } from '../src/ui/controller.ts';
import { freeze, inventory } from './helpers.ts';

const man = (rank: Rank) => ordinaryTile({ category: 'suited', suit: 'man', rank });
for (const [indicator, expected] of [
  [man(1), 'man-2'], [man(4), 'man-5'], [man(9), 'man-1'],
  ...(['pin', 'sou'] as const).map(suit => [ordinaryTile({ category:'suited', suit, rank:9 }), `${suit}-1`] as const),
  ...(['east','south','west','north','white','green','red'] as Honor[]).map((honor, i) =>
    [ordinaryTile({category:'honor', honor}), ['south','west','north','east','green','red','white'][i]] as const),
  ...(['man','pin','sou'] as const).map(suit => [redFive(suit), `${suit}-6`] as const),
] as const) test(`indicator ${tileKindKey(indicator)} red=${indicator.isRed} -> ${expected}`, () => {
  const snapshot = structuredClone(indicator); freeze(indicator);
  const kind = doraKindFromIndicator(indicator);
  assert.equal(tileKindKey(kind), expected);
  assert.equal('isRed' in kind, false);
  assert.deepEqual(indicator, snapshot);
});
for (const count of [0,1,2,3,4]) test(`normal dora counts ${count} copies`, () => {
  assert.equal(countDora(Array.from({length:count}, () => man(5)), [man(4)]), count);
});
for (const [tiles, normal, red] of [
  [[redFive('man')],1,1], [[man(5),redFive('man')],2,1],
  [[man(5),man(5),redFive('man')],3,1], [[redFive('pin'),redFive('sou')],0,2],
  [[man(5),man(5)],2,0], [[man(4)],0,0],
] as const) test(`normal/red bonuses independent: ${normal}/${red}, ${tiles.length} tiles`, () => {
  assert.equal(countDora(tiles, [man(4)]),normal); assert.equal(countRedDora(tiles),red);
});
test('normal dora is immutable, order independent and counts each exposed entry once', () => {
  const tiles = [man(5),redFive('man'),man(4),redFive('sou')], indicators = [man(4),man(4)];
  const snapshot = structuredClone([tiles,indicators]); freeze(tiles); freeze(indicators);
  assert.equal(countDora(tiles,indicators),4);
  assert.equal(countDora([...tiles].reverse(),indicators),4);
  assert.equal(countDora(tiles,[]),0);
  assert.deepEqual([tiles,indicators], snapshot);
  assert.equal(countDora([man(6)], [redFive('man')]),1);
});
for (const invalid of [null, {}, {category:'suited',suit:'bad',rank:5,isRed:false},
  {category:'suited',suit:'man',rank:10,isRed:false}, {category:'suited',suit:'man',rank:4,isRed:true},
  {category:'honor',honor:'bad',isRed:false}, {category:'honor',honor:'east',isRed:true}]) {
  test(`normal dora rejects invalid face ${JSON.stringify(invalid)}`, () => {
    const tile = invalid as Tile;
    assert.throws(() => doraKindFromIndicator(tile),RangeError);
    assert.throws(() => countDora([tile],[man(4)]),RangeError);
    assert.throws(() => countDora([],[tile]),RangeError);
  });
}
test('normal dora rejects malformed arrays and duplicate red faces', () => {
  assert.throws(() => countDora(null as unknown as Tile[],[]),RangeError);
  assert.throws(() => countDora([],null as unknown as Tile[]),RangeError);
  assert.throws(() => countDora([redFive('man'),redFive('man')],[]),RangeError);
});
test('exactly deadWall[4] is public from deal through exhaustion with physical inventory intact', () => {
  const initial = tsumoStart(RED_PINFU,false,undefined,'man-4');
  const indicator = initial.deadWall[4]; freeze(initial);
  assert.deepEqual(DORA_INDICATOR_INDICES,[4,6,8,10,12]);
  assert.deepEqual(exposedDoraIndicators(initial),[indicator]);
  let game = initial;
  for (let i=0; i<70; i++) {
    game = setupDiscard(game,game.turnPlayerId,game.players[game.turnPlayerId].drawnTile!.id);
    game = drawOrStop(game);
    assert.equal(exposedDoraIndicators(game)[0],indicator);
    inventory(game,initial);
  }
  assert.equal(game.phase,'wall-exhausted');
  assert.equal(game.liveWall.length,0);
  assert.equal(game.deadWall.length,14);
  assert.ok(![...game.liveWall,...game.players.flatMap(p=>[...p.hand,...p.river])].some(p=>p.id===indicator.id));
  assert.throws(()=>exposedDoraIndicators({...game,deadWall:[]}),RangeError);
});
test('two yaku + one normal dora + two red dora gives five han without changing yaku', () => {
  const game = tsumoGame(RED_PINFU,false,undefined,'man-4'); freeze(game);
  const won = declareTsumo(game,0), result = won.winResult!;
  assert.equal(result.totalHan,2); assert.equal(result.yakuHan,2);
  assert.equal(result.doraCount,1); assert.equal(result.doraHan,1);
  assert.equal(result.redDoraCount,2); assert.equal(result.redDoraHan,2);
  assert.equal(result.totalHanIncludingDora,5);
  assert.deepEqual(result.analysis, declareTsumo(tsumoGame(RED_PINFU,false,undefined,'sou-8'),0).winResult!.analysis);
  assert.equal(exposedDoraIndicators(won)[0],game.deadWall[4]); inventory(won,game);
});
test('normal dora adds han with no red tiles and never increases yakuman', () => {
  const result = declareTsumo(tsumoGame(RED_PINFU,false,[],'man-4'),0).winResult!;
  assert.equal(result.redDoraHan,0); assert.equal(result.doraHan,1);
  assert.equal(result.totalHanIncludingDora,3);
  const game = tsumoGame(['19m','19p','19s','12345677z'],false,undefined,'man-9');
  const yakuman = declareTsumo(game,0).winResult!;
  assert.equal(yakuman.doraCount,1); assert.equal(yakuman.doraHan,0);
  assert.equal(yakuman.redDoraHan,0); assert.equal(yakuman.totalHanIncludingDora,0); assert.equal(yakuman.yakumanCount,1);
  inventory(game,game);
});
test('dora cannot create a supported yaku or selectable candidate', () => {
  const game = tsumoGame(RED_PINFU,false,undefined,'man-4');
  const faces = [...game.players[0].hand,game.players[0].drawnTile!].map(t=>t.tile);
  assert.equal(countDora(faces,[game.deadWall[4].tile]),1);
  const analysis = analyzeYaku(faces,{winMethod:'ron',winningTile:{category:'suited',suit:'pin',rank:2},seatWind:'east',roundWind:'east'});
  assert.equal(analysis.hasSupportedYaku,false); assert.equal(selectTsumoCandidate(analysis),null);
});
test('new game uses new dead wall and cancels notifications from old CPU generation', async () => {
  const old = tsumoStart(RED_PINFU,false,undefined,'man-4'), fresh = tsumoStart(RED_PINFU,false,undefined,'sou-8');
  let starts=0, release!:()=>void;
  const ui = new GameController(()=>starts++ ? fresh : old,{wait:()=>new Promise<void>(resolve=>{release=resolve;})});
  ui.select(ui.game.players[0].drawnTile!.id); const pending=ui.confirm();
  ui.newGame(); assert.equal(exposedDoraIndicators(ui.game)[0],fresh.deadWall[4]);
  release(); await pending;
  assert.equal(ui.game,fresh); assert.notEqual(tileKindKey(old.deadWall[4].tile),tileKindKey(fresh.deadWall[4].tile));
  inventory(ui.game,fresh);
});

test('a red indicator awards no red bonus outside the winning hand', () => {
  const game = tsumoGame(RED_PINFU,false,[],'man-5');
  assert.equal(game.deadWall[4].tile.isRed,true);
  const result = declareTsumo(game,0).winResult!;
  assert.equal(result.redDoraCount,0); assert.equal(result.redDoraHan,0);
  assert.equal(result.doraHan,1); assert.equal(result.totalHanIncludingDora,3);
  inventory(game,game);
});
test('zero normal dora is valid on a complete winning hand', () => {
  const game = tsumoGame(RED_PINFU,false,undefined,'sou-8');
  const result = declareTsumo(game,0).winResult!;
  assert.equal(result.doraCount,0); assert.equal(result.doraHan,0);
  assert.equal(result.redDoraHan,2); assert.equal(result.totalHanIncludingDora,4);
});
