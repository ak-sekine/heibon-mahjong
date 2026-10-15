import { passCalls } from '../src/game/calls.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeclareRon, declareRon, passRon, getRonCandidates, getRonTile, getWaitingTileKinds, isDiscardFuriten } from '../src/game/ron.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { drawTile, drawOrStop } from '../src/game/draw.ts';
import { discardTile } from '../src/game/discard.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { GameController } from '../src/ui/controller.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey, redFive } from '../src/model/tile.ts';
import type { GameState, PlayerId, PlayerState, RonResult } from '../src/model/game.ts';
import { ronStart, ronGame, RON_HANDS } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { inventory, freeze, allTiles } from './helpers.ts';

const faces = (groups: readonly string[]) => groups.flatMap(g => [...g.slice(0, -1)].map(n => ordinaryTile(TILE_KINDS[
  ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1])));
const keys = (groups: readonly string[]) => getWaitingTileKinds(faces(groups)).map(tileKindKey);
function playerChange(game: GameState, id: PlayerId, change: Partial<PlayerState>): GameState {
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[id] = { ...players[id], ...change };
  return { ...game, players };
}
/** Move an actual tile into the river, retaining all 136 physical objects. */
export function riverTile(game: GameState, id: PlayerId, key: string, red = false): GameState {
  const tile = game.liveWall.find(t => tileKindKey(t.tile) === key && t.tile.isRed === red)!;
  assert.ok(tile);
  return { ...playerChange(game, id, { river: [...game.players[id].river, tile] }),
    liveWall: game.liveWall.filter(t => t !== tile) };
}
const result = (g: GameState) => { assert.equal(g.winResult?.winMethod, 'ron'); return g.winResult as RonResult; };

for (const [discarder, winner] of [[1,0],[0,1],[1,2],[2,3]] as const) {
  test(`seat ${winner} rons latest discard from seat ${discarder}, using shared yaku and real inventory`, () => {
    const initial = ronStart(discarder, [winner]); const snapshot = structuredClone(initial); freeze(initial);
    let game = discardTile(initial, discarder, initial.players[discarder].drawnTile!.id);
    if (winner === 0) { assert.equal(canDeclareRon(game, winner), true); game = declareRon(game, winner); }
    assert.equal(game.phase, 'won');
    const win = result(game); assert.deepEqual(win.winners.map(w => w.winnerId), [winner]);
    assert.equal(win.discarderId, discarder);
    assert.equal(win.winningTileId, initial.players[discarder].drawnTile!.id);
    assert.equal(game.players[winner].hand.length, 13);
    assert.ok(win.winners[0].candidate.yaku.some(y => y.id === 'pinfu'));
    assert.ok(!win.winners[0].candidate.yaku.some(y => y.id === 'menzen-tsumo'));
    inventory(game, initial); assert.deepEqual(initial, snapshot);
  });
}

for (const [name, discarder, winners] of [
  ['single human',1,[0]], ['double CPUs',0,[1,2]], ['triple CPUs',0,[1,2,3]],
  ['double human/CPU',1,[0,2]], ['triple human/CPUs',1,[0,2,3]], ['clockwise order',3,[0,1,2]],
] as const) test(`${name}: atomic winners, clockwise order and shared physical tile`, () => {
  const initial = ronStart(discarder, winners);
  let game = discardTile(initial, discarder, initial.players[discarder].drawnTile!.id);
  if (winners.includes(0 as never)) {
    assert.equal(game.phase, 'awaiting-ron'); assert.equal(game.winResult, null);
    const candidates = getRonCandidates(game); assert.equal(candidates.length, winners.length);
    assert.equal(canDeclareRon(game, discarder), false);
    game = declareRon(game, 0);
  }
  const win = result(game);
  const expected = [1,2,3].map(offset => (discarder + offset) % 4).filter(id => winners.includes(id as never));
  assert.deepEqual(win.winners.map(w => w.winnerId), expected);
  assert.ok(win.winners.every(w => w.winningTileId === win.winningTileId && w.discarderId === discarder));
  assert.equal(game.ronWindow, null);
  assert.equal(allTiles(game).filter(t => t.id === win.winningTileId).length, 1);
  inventory(game, initial);
});

for (const winners of [[0], [0,2], [0,2,3]] as const) test(`human pass with ${winners.length} candidates resolves remaining CPUs`, () => {
  const game = ronGame(1, winners), tile = getRonTile(game)!; freeze(game);
  const passed = passRon(game, 0);
  assert.equal(passed.players[0].temporaryFuriten, true);
  assert.equal(game.players[0].temporaryFuriten, false);
  assert.equal(passed.ronWindow, null);
  if (winners.length === 1) { assert.equal(passed.phase, 'awaiting-draw'); assert.equal(passed.turnPlayerId, 2); }
  else { assert.equal(passed.phase, 'won'); assert.deepEqual(result(passed).winners.map(w => w.winnerId), winners.slice(1)); }
  assert.equal(passed.players[1].river.at(-1), tile);
  assert.throws(() => passRon(passed, 0), RangeError);
  assert.throws(() => declareRon(passed, 0), RangeError);
  inventory(passed, game);
});

for (const [name, modify] of [
  ['self discard', (g: GameState) => ({ ...g, ronWindow: { discarderId: 0 as const, tileId: g.ronWindow!.tileId } })],
  ['old discard ID', (g: GameState) => ({ ...g, ronWindow: { ...g.ronWindow!, tileId: 'old-game-tile' } })],
  ['old phase', (g: GameState) => ({ ...g, phase: 'awaiting-draw' as const })],
  ['absent window', (g: GameState) => ({ ...g, ronWindow: null })],
  ['wrong turn', (g: GameState) => ({ ...g, turnPlayerId: 2 as const })],
  ['temporary furiten', (g: GameState) => playerChange(g,0,{ temporaryFuriten:true })],
  ['twelve tiles', (g: GameState) => playerChange(g,0,{ hand:g.players[0].hand.slice(1) })],
  ['draw occupied', (g: GameState) => playerChange(g,0,{ drawnTile:g.liveWall[0] })],
  ['duplicate ID', (g: GameState) => playerChange(g,0,{ hand:[...g.players[0].hand.slice(1),getRonTile(g)!] })],
  ['unfinished shape', (g: GameState) => playerChange(g,0,{ hand:[...g.players[0].hand.slice(1),g.liveWall[0]] })],
] as const) test(`reject ron: ${name}`, () => {
  const game = modify(ronGame()); assert.equal(canDeclareRon(game, 0), false);
  assert.throws(() => declareRon(game,0), RangeError);
});

for (const winner of [0,1,2,3] as const) test(`seat ${winner}: no yaku and dora-only cannot ron`, () => {
  const discarder = ((winner + 1) % 4) as PlayerId;
  const game = ronGame(discarder,[winner]);
  // 46s is kanchan, so replace the otherwise pinfu wait with value-less tanki.
  const noYaku = ronGame(discarder,[winner],[['123m','456m','789p','456s','2p']], 'pin-2',false,'pin-1');
  assert.equal(noYaku.phase,'awaiting-draw'); assert.equal(canDeclareRon(noYaku,winner),false);
  assert.equal(noYaku.winResult,null); assert.equal(game.phase,winner === 0 ? 'awaiting-ron' : 'won');
});

test('waiting tiles require thirteen, exclude fifth copies and treat red as same kind', () => {
  assert.throws(() => getWaitingTileKinds([]),RangeError);
  const hand = faces(['1111m','234m','567p','789s']);
  assert.ok(!getWaitingTileKinds(hand).some(k => tileKindKey(k)==='man-1'));
  const waits = keys(RON_HANDS[0]); assert.deepEqual(waits,['sou-2','sou-5']);
});
for (const [name, hand, expected] of [
  ['ryanmen',['123m','456m','789p','22p','34s'],['sou-2','sou-5']],
  ['seven pairs',['11m','22m','33p','44p','66s','77s','5s'],['sou-5']],
  ['kokushi single',['19m','19p','19s','1234566z'],['red']],
  ['kokushi thirteen',['19m','19p','19s','1234567z'],['man-1','man-9','pin-1','pin-9','sou-1','sou-9','east','south','west','north','white','green','red']],
  ['no yaku tanki',['123m','456m','789p','456s','2p'],['pin-2']],
] as const) test(`shape waits: ${name}`, () => { assert.deepEqual(keys(hand),expected); });

for (const [discard, red] of [['sou-2',false],['sou-5',false],['sou-5',true]] as const) test(`entire wait furiten: river ${discard}, red=${red}`, () => {
  const initial = ronStart(1,[0],[['123m','456m','789p','22p','34s']], 'sou-5', !red);
  const furiten = riverTile(initial,0,discard,red);
  const game = discardTile(furiten,1,furiten.players[1].drawnTile!.id);
  assert.equal(isDiscardFuriten(game.players[0]),true);
  assert.equal(game.phase,'awaiting-draw'); assert.equal(canDeclareRon(game,0),false);
  inventory(game,furiten);
});
for (const [name, hand, key] of [
  ['seven pairs',['11m','22m','33p','44p','66s','77s','5s'],'sou-5'],
  ['kokushi',['19m','19p','19s','1234566z'],'red'],
  ['no supported yaku',['123m','456m','789p','456s','2p'],'pin-2'],
] as const) test(`discard furiten uses shape: ${name}`, () => {
  const initial = ronStart(1,[0],[hand],key,false);
  const game = riverTile(initial,0,key);
  assert.equal(isDiscardFuriten(game.players[0]),true);
  const discarded = discardTile(game,1,game.players[1].drawnTile!.id);
  assert.equal(canDeclareRon(discarded,0),false); inventory(discarded,game);
});

test('temporary furiten persists through other seats; own normal live draw clears only temporary status', () => {
  let game = passRon(ronGame(),0); const initial = game;
  for (const id of [2,3] as const) {
    game = drawTile(game,id); assert.equal(game.players[0].temporaryFuriten,true);
    game = discardTile(game,id,game.players[id].drawnTile!.id);
    if(game.phase==='awaiting-call') game=passCalls(game,0);
    assert.equal(game.players[0].temporaryFuriten,true);
  }
  game = riverTile(game,0,'sou-5');
  assert.equal(isDiscardFuriten(game.players[0]),true);
  game = drawTile(game,0); assert.equal(game.players[0].temporaryFuriten,false);
  assert.equal(isDiscardFuriten(game.players[0]),true); inventory(game,initial);
});
test('temporary furiten blocks another actual waiting discard before own draw', () => {
  let game = passRon(ronGame(),0);
  // Arrange the next live draw by moving an existing ordinary five to the front.
  const tile = game.liveWall.find(t => tileKindKey(t.tile)==='sou-5')!;
  game = { ...game, liveWall:[tile,...game.liveWall.filter(t=>t!==tile)] };
  game = drawTile(game,2); game = discardTile(game,2,tile.id);
  assert.equal(game.phase,'awaiting-draw'); assert.equal(canDeclareRon(game,0),false);
});
for (const temporary of [false,true]) test(`furiten never blocks tsumo, temporary=${temporary}`, () => {
  const game = playerChange(tsumoGame(),0,{ temporaryFuriten:temporary });
  assert.equal(canDeclareTsumo(game,0),true); assert.equal(declareTsumo(game,0).phase,'won');
});

for (const red of [false,true]) test(`winning discard itself counts as normal dora and red=${red}`, () => {
  const game = ronGame(1,[0],undefined,'sou-5',red,'sou-4');
  const win = result(declareRon(game,0)).winners[0];
  assert.equal(win.yakuHan,1); assert.equal(win.doraCount,1); assert.equal(win.doraHan,1);
  assert.equal(win.redDoraCount,Number(red)); assert.equal(win.redDoraHan,Number(red));
  assert.equal(win.totalHanIncludingDora,2+Number(red));
});
test('yakuman has no dora han on ron', () => {
  const game = ronGame(1,[0],[['19m','19p','19s','1234566z']],'red',false,'green');
  const win = result(declareRon(game,0)).winners[0];
  assert.equal(win.yakumanCount,1); assert.equal(win.doraCount,1);
  assert.equal(win.doraHan,0); assert.equal(win.redDoraHan,0); assert.equal(win.totalHanIncludingDora,0);
});
test('each simultaneous winner computes its own yaku and han', () => {
  const game = ronGame(1,[0,2],[RON_HANDS[0],['234m','456p','678s','33p','55s']]);
  const wins = result(declareRon(game,0)).winners;
  assert.equal(wins.length,2); assert.notDeepEqual(wins[0].candidate.yaku,wins[1].candidate.yaku);
  assert.notEqual(wins[0].totalHanIncludingDora,wins[1].totalHanIncludingDora);
});
for (const winner of [0,1,2,3] as const) test(`own seat wind and east round wind on ron: seat ${winner}`, () => {
  const hand = ['111z','234m','678p','55p','46s'];
  const game = ronGame(((winner+1)%4) as PlayerId,[winner],[hand]);
  const won = winner===0 ? declareRon(game,0) : game;
  const win = result(won).winners[0];
  assert.ok(win.candidate.yaku.some(y=>y.id==='yakuhai-round-wind'));
  assert.equal(win.candidate.yaku.some(y=>y.id==='yakuhai-seat-wind'),won.players[winner].wind==='east');
});

for (const op of ['draw','discard','tsumo','CPU declaration','CPU pass'] as const) test(`ron pending rejects ${op}`, () => {
  const game = ronGame(1,[0,2]);
  const actions = { draw:()=>drawTile(game,2), discard:()=>discardTile(game,1,game.players[1].hand[0].id),
    tsumo:()=>declareTsumo(game,0), 'CPU declaration':()=>declareRon(game,2), 'CPU pass':()=>passRon(game,2) };
  assert.throws(actions[op],RangeError);
});
test('won rejects draw, discard, ron, pass and repeated resolution', () => {
  const game = declareRon(ronGame(),0);
  for (const action of [()=>drawTile(game,2),()=>drawOrStop(game),()=>discardTile(game,1,game.players[1].hand[0].id),()=>declareRon(game,0),()=>passRon(game,0)]) assert.throws(action,RangeError);
});

test('runner pauses at human ron, consumes no next draw and resumes after pass', async () => {
  const initial = ronStart(), tile = initial.players[1].drawnTile!;
  const ui = new GameController(()=>initial,{wait:async()=>{},chooseDiscard:()=>tile.id});
  // Run the same production scheduler against the CPU discard.
  const runner = new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:()=>tile.id});
  let game = initial; await runner.run(()=>game,g=>{game=g;});
  assert.equal(runner.running,false); assert.equal(game.phase,'awaiting-ron');
  assert.equal(game.liveWall.length,initial.liveWall.length);
  ui.game = game; assert.equal(ui.canRon,true); assert.equal(ui.canTsumo,false); assert.equal(ui.canConfirm,false);
  ui.declareRon(); assert.equal(ui.game.phase,'won'); assert.equal(ui.progressing,false);
  assert.throws(()=>ui.declareRon(),RangeError); assert.throws(()=>ui.passRon(),RangeError);
});
test('controller pass restarts CPU turns and returns to human', async () => {
  const start = ronStart(); const ui = new GameController(()=>start,{wait:async()=>{},chooseDiscard:p=>p.drawnTile!.id});
  ui.game = ronGame(); await ui.passRon();
  while(ui.game.phase==='awaiting-call') await ui.passCalls();
  assert.equal(ui.progressing,false); assert.equal(ui.game.phase,'awaiting-discard');
  assert.equal(ui.game.turnPlayerId,0); assert.equal(ui.game.players[0].temporaryFuriten,false);
});
for (const won of [false,true]) test(`new game clears ron window, winners and furiten: won=${won}`, () => {
  const initial = ronStart(); const ui = new GameController(()=>initial);
  ui.game = won ? declareRon(ronGame(),0) : ronGame();
  ui.newGame(); assert.equal(ui.game,initial); assert.equal(ui.game.ronWindow,null);
  assert.equal(ui.game.winResult,null); assert.ok(ui.game.players.every(p=>!p.temporaryFuriten));
  assert.equal(ui.canRon,false); assert.equal(ui.progressing,false);
});
test('old async wait cannot overwrite reset after ron waiting', async () => {
  let release!:()=>void;
  const initial = ronStart(0,[1]);
  const ui = new GameController(()=>initial,{wait:()=>new Promise<void>(r=>{release=r;})});
  // Non-winning legal discard starts a delayed CPU turn.
  const safe = initial.players[0].hand.find(t=>!getWaitingTileKinds(initial.players[1].hand.map(t=>t.tile)).some(k=>tileKindKey(k)===tileKindKey(t.tile)))!;
  ui.select(safe.id); const pending = ui.confirm();
  assert.equal(ui.progressing,true); ui.game = ronGame(); ui.newGame();
  release(); await pending; assert.equal(ui.game,initial); assert.equal(ui.progressing,false);
});

for (const id of [1,2,3] as const) test(`CPU${id} discard furiten prevents automatic ron`, () => {
  const initial = ronStart(0,[id]);
  const furiten = riverTile(initial,id,'sou-2');
  const game = discardTile(furiten,0,furiten.players[0].drawnTile!.id);
  assert.equal(game.phase,'awaiting-draw'); assert.equal(game.winResult,null);
  assert.equal(canDeclareRon(game,id),false); inventory(game,furiten);
});
for (const id of [1,2,3] as const) test(`CPU${id} automatic ron stops scheduler without a next draw`, async () => {
  const discarder = ((id+3)%4) as PlayerId;
  const initial = ronStart(discarder,[id],undefined,'sou-5',true,'sou-4',true);
  let waits = 0;
  const ui = new GameController(()=>initial,{ wait:async ms=>{assert.equal(ms,300);waits++;}, chooseDiscard:p=>p.drawnTile!.id });
  ui.select(initial.players[0].drawnTile!.id); await ui.confirm();
  assert.equal(ui.game.phase,'won'); assert.equal(ui.progressing,false);
  assert.deepEqual(result(ui.game).winners.map(w=>w.winnerId),[id]);
  assert.equal(waits,discarder);
  assert.equal(ui.game.liveWall.length,initial.liveWall.length-discarder);
  inventory(ui.game,initial);
});
test('older actual river tile cannot replace the current ron target', () => {
  const start = riverTile(ronStart(),1,'sou-5');
  const game = discardTile(start,1,start.players[1].drawnTile!.id);
  const stale = {...game,ronWindow:{...game.ronWindow!,tileId:game.players[1].river[0].id}};
  assert.equal(getRonTile(stale),null); assert.equal(canDeclareRon(stale,0),false);
  assert.throws(()=>declareRon(stale,0),RangeError);
});
test('failed own draw does not clear temporary furiten', () => {
  const game = passRon(ronGame(),0); freeze(game);
  assert.throws(()=>drawTile(game,0),RangeError);
  assert.throws(()=>drawTile({...game,turnPlayerId:0,liveWall:[]},0),RangeError);
  assert.equal(game.players[0].temporaryFuriten,true);
});
test('reset after pass clears temporary furiten and never carries the window into a new game', () => {
  const initial = ronStart(); const ui = new GameController(()=>initial);
  ui.game = passRon(ronGame(),0);
  assert.equal(ui.game.players[0].temporaryFuriten,true); ui.newGame();
  assert.equal(ui.game.ronWindow,null); assert.equal(ui.game.winResult,null);
  assert.equal(ui.game.players[0].temporaryFuriten,false);
});
test('illegal player IDs reject declaration and pass without changing state', () => {
  const game = ronGame(); freeze(game);
  assert.equal(canDeclareRon(game,99 as PlayerId),false);
  assert.throws(()=>declareRon(game,99 as PlayerId),RangeError);
  assert.throws(()=>passRon(game,99 as PlayerId),RangeError);
});
