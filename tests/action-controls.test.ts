import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSelection } from '../src/rendering/table.ts';
import { riichiStart } from './riichi-fixture.ts';
import { startMatch } from '../src/game/match.ts';
import { declareRiichi } from '../src/game/riichi.ts';
import { drawTile } from '../src/game/draw.ts';
import { discardTile } from '../src/game/discard.ts';

for (const state of ['other','unselected','eligible','ineligible','established-other','established-own','progressing'] as const) test(`action controls remain visible: ${state}`, () => {
  const nodes = new Map<string, any>();
  for (const id of ['#discard','#riichi','#tsumo','#ron-controls','#ron-status','#ron','#pass-ron','#selection-status','#local-game-controls']) nodes.set(id, {hidden:false,disabled:false,classList:{toggle(){}},focus(){}});
  nodes.get('#ron-controls').hidden=true;
  const original=globalThis.document;
  globalThis.document={querySelector:(s:string)=>nodes.get(s),querySelectorAll:()=>[]} as unknown as Document;
  try {
    let game=riichiStart('tsumo'); let selected: string|null=null;
    if(state==='other') game=discardTile(game,0,game.players[0].drawnTile!.id);
    if(state==='eligible'||state==='progressing') selected=game.players[0].drawnTile!.id;
    if(state==='ineligible') selected=game.players[0].hand.find(t=>t.tile.category==='suited'&&t.tile.suit==='man'&&t.tile.rank===1)!.id;
    if(state.startsWith('established')) {
      game=declareRiichi(startMatch(game),0,game.players[0].drawnTile!.id).game;
      if(state==='established-own') {
        for(let i=0;i<3;i++) {game=drawTile(game,game.turnPlayerId);game=discardTile(game,game.turnPlayerId,game.players[game.turnPlayerId].drawnTile!.id);}
        game=drawTile(game,0);
      }
    }
    const before=structuredClone(game);
    renderSelection(game,selected,state==='progressing');
    for(const id of ['#discard','#riichi','#tsumo']) assert.equal(nodes.get(id).hidden,false);
    assert.equal(nodes.get('#riichi').disabled,state!=='eligible');
    assert.equal(nodes.get('#discard').disabled,!['eligible','ineligible','established-own'].includes(state));
    assert.equal(nodes.get('#discard').textContent,state.startsWith('established')?'ツモ切り':'打牌する');
    assert.equal(nodes.get('#tsumo').disabled,state!=='established-own');
    assert.deepEqual(game,before);
  } finally {globalThis.document=original;}
});
