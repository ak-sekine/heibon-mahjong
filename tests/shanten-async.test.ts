import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { startGame } from '../src/game/start.ts';
import { seeded } from './helpers.ts';
for(const mode of ['cancel','replace'] as const)test(`sliced CPU evaluation ${mode} cannot commit a stale discard`,async()=>{
 let game=startGame(seeded(0),1);const initial=game;let writes=0;
 const runner=new AutomaticTurnRunner({wait:async()=>{}});
 const promise=runner.run(()=>game,next=>{game=next;writes++;});
 await Promise.resolve();
 if(mode==='cancel')runner.cancel();else game={...game};
 const snapshot=game;await promise;
 assert.equal(game,snapshot);assert.equal(writes,0);assert.deepEqual(game.players,initial.players);assert.equal(runner.running,false);
});
