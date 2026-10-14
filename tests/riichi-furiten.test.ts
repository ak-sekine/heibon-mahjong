import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riichiStart } from './riichi-fixture.ts';
import { startMatch, nextRound, updateMatchGame } from '../src/game/match.ts';
import { declareRiichi } from '../src/game/riichi.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { canDeclareRon, declareRon, getRonCandidates, passRon, isFuriten } from '../src/game/ron.ts';
import { canDeclareTsumo, declareTsumo } from '../src/game/tsumo.ts';
import { ronGame, withRiverTile } from './ron-fixture.ts';
import { fixedRound } from './match-fixture.ts';
import { inventory } from './helpers.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
function setPlayer(game: GameState, id: number, change: Partial<PlayerState>): GameState {
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[id] = {...players[id],...change};return {...game,players};
}
function window(mode: 'ron' | 'furiten' = 'ron') {
  const initial=riichiStart(mode);
  let game=declareRiichi(startMatch(initial),0,initial.players[0].drawnTile!.id).game;
  game=drawTile(game,1);game=discardTile(game,1,game.players[1].drawnTile!.id);
  return {initial,game};
}
test('pre-riichi pass sets only temporary furiten and draw clears it',()=>{
  const game=ronGame();const passed=passRon(game,0);
  assert.equal(passed.players[0].temporaryFuriten,true);assert.equal(passed.players[0].riichi,null);
  let g=passed;for(let i=0;i<2;i++){g=drawTile(g,g.turnPlayerId);g=discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile!.id);}
  g=drawTile(g,0);assert.equal(g.players[0].temporaryFuriten,false);
});
test('riichi pass records permanent player-level furiten and engine rejects ron',()=>{
  const {initial,game}=window();assert.ok(canDeclareRon(game,0));const passed=passRon(game,0);
  assert.equal(passed.players[0].riichi?.passedRon,true);assert.equal(isFuriten(passed.players[0]),true);inventory(passed,initial);
  const retry={...game,players:passed.players};assert.equal(canDeclareRon(retry,0),false);
  assert.deepEqual(getRonCandidates(retry),[]);assert.throws(()=>declareRon(retry,0),RangeError);
});
test('fixed wall scenario D: own draw preserves furiten, later CPU2 winning discard is blocked, tsumo remains legal',()=>{
  const {initial,game}=window('furiten');let g=passRon(game,0);
  for(let i=0;i<2;i++){g=drawTile(g,g.turnPlayerId);g=discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile!.id);}
  g=drawTile(g,0);assert.equal(g.players[0].temporaryFuriten,false);assert.equal(g.players[0].riichi?.passedRon,true);
  g=discardTile(g,0,g.players[0].drawnTile!.id);g=drawTile(g,1);g=discardTile(g,1,g.players[1].drawnTile!.id);
  g=drawTile(g,2);const tile=g.players[2].drawnTile!;assert.ok(tile.id.startsWith('man-5'));
  g=discardTile(g,2,tile.id);assert.equal(g.phase,'awaiting-draw');assert.equal(canDeclareRon(g,0),false);
  g=drawTile(g,3);g=discardTile(g,3,g.players[3].drawnTile!.id);g=drawTile(g,0);
  assert.equal(g.players[0].riichi?.passedRon,true);assert.ok(canDeclareTsumo(g,0));inventory(g,initial);const won=declareTsumo(g,0);inventory(won,initial);
});
for(const id of [0,1,2,3] as const) test(`permanent furiten applies through every ron API: seat ${id}`,()=>{
  const game=ronGame(id===1?2:1,[id]);const blocked=setPlayer(game,id,{riichi:{declarationTileId:'past',passedRon:true},temporaryFuriten:false});
  assert.equal(canDeclareRon(blocked,id),false);assert.ok(!getRonCandidates(blocked).some(c=>c.winnerId===id));assert.throws(()=>declareRon(blocked,id),RangeError);
});
test('discard furiten remains effective for a riichi CPU',()=>{
  const game=ronGame(1,[2]);const blocked=setPlayer(withRiverTile(game,2,'sou-5'),2,{riichi:{declarationTileId:'past',passedRon:false}});
  assert.equal(canDeclareRon(blocked,2),false);assert.equal(isFuriten(blocked.players[2]),true);
});
test('passing one side prevents ron on every kind of a multiple wait',()=>{
  const game=ronGame(1,[0]);const passed=passRon(setPlayer(game,0,{riichi:{declarationTileId:'past'}}),0);
  // The same hand has 2/5 sou waits; either ron tile is blocked by player state.
  for(const key of ['sou-2','sou-5']) {
    const tile=game.liveWall.find(t=>t.id.startsWith(key))!;
    const players=[...passed.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
    players[1]={...players[1],river:[tile]};
    const retry={...game,players,ronWindow:{discarderId:1 as const,tileId:tile.id}};
    assert.equal(canDeclareRon(retry,0),false);assert.throws(()=>declareRon(retry,0),RangeError);
  }
});
test('next round and new match clear permanent furiten and pending declarations',()=>{
  const match=startMatch();const game=fixedRound(0,[0]);const ended=updateMatchGame(match,setPlayer(game,0,{riichi:{declarationTileId:'past',passedRon:true}}));
  const next=nextRound(ended);assert.ok(next.game.players.every(p=>p.riichi===null&&!p.temporaryFuriten));assert.equal(next.game.pendingRiichi,null);
  const fresh=startMatch();assert.ok(fresh.game.players.every(p=>p.riichi===null));assert.equal(fresh.game.pendingRiichi,null);
});
