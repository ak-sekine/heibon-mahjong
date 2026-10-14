import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shantenProgressionStart } from './shanten-progression-fixture.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { drawTile } from '../src/game/draw.ts';
import { discardTile } from '../src/game/discard.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { calculateShanten } from '../src/analysis/shanten.ts';
import { inventory } from './helpers.ts';
import { assertPointConservation } from '../src/game/match.ts';

test('legal 136 wall: two shanten -> one -> tenpai -> existing riichi -> tsumogiri',async()=>{
 const initial=shantenProgressionStart();let match=startMatch(initial);
 const shanten=()=>calculateShanten(match.game.players[1].hand.map(t=>t.tile)).minimum;
 const runner=new AutomaticTurnRunner({wait:async()=>{}});
 const run=()=>runner.runMatch(()=>match,m=>{match=m;inventory(m.game,initial);assertPointConservation(m);});
 const cycle=()=>{while(match.game.turnPlayerId!==1){let g=match.game;if(g.phase==='awaiting-draw')g=drawTile(g,g.turnPlayerId);match=updateMatchGame(match,discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile!.id));}};
 assert.equal(shanten(),2);await run();assert.equal(shanten(),1);assert.equal(match.depositSticks,0);
 cycle();await run();assert.equal(shanten(),0);assert.equal(match.depositSticks,1);assert.equal(match.points[1],24000);
 const p=match.game.players[1];assert.equal(p.riichi?.declarationTileId,p.river.at(-1)?.id);
 cycle();const expected=match.game.liveWall[0].id;await run();assert.equal(match.game.players[1].river.at(-1)?.id,expected);assert.deepEqual(match.game.players[1].hand,p.hand);
});
