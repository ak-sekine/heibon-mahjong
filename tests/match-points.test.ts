import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMatch,settleRound,updateMatchGame,assertPointConservation } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { scoringGame } from './scoring-fixture.ts';
import { fixedRon } from './match-fixture.ts';
import { freeze,inventory } from './helpers.ts';
import type { Points } from '../src/model/match.ts';
import { GameController } from '../src/ui/controller.ts';

test('initial match: 25,000 each, east 1, dealer 0, no honba/deposits',()=>{
 const match=startMatch();assert.deepEqual(match.points,[25000,25000,25000,25000]);assert.equal(match.roundNumber,1);assert.equal(match.dealerId,0);assert.equal(match.honba,0);assert.equal(match.depositSticks,0);assert.equal(match.roundWind,'east');assertPointConservation(match);
});
for(const [name,dealer,winners] of [['dealer ron',0,[0]],['child ron',0,[1]],['double',0,[0,2]],['triple',0,[0,1,2]]] as const) for(const honba of [0,1,2]) test(`${name}, ${honba} honba: independent payments, conservation, immutable and once`,()=>{
 const game=fixedRon(dealer,winners);inventory(game,game);const snapshot=structuredClone(game);freeze(game);
 const initial={...startMatch(startGame()),game,honba};const settled=settleRound(initial);const results=game.winResult!;
 assert.equal(results.winMethod,'ron');if(results.winMethod!=='ron')throw Error();
 const expected=[25000,25000,25000,25000];
 for(const winner of results.winners){const amount=winner.totalPoints+honba*300;expected[winner.winnerId]+=amount;expected[3]-=amount;}
 assert.deepEqual(settled.points,expected);assert.equal(settled.lastSettlement!.payments.length,winners.length);assertPointConservation(settled);
 assert.equal(settleRound(settled),settled);assert.equal(updateMatchGame(settled,game),settled);assert.deepEqual(game,snapshot);assert.deepEqual(initial.points,[25000,25000,25000,25000]);
 assert.ok(Object.isFrozen(settled.lastSettlement));assert.ok(Object.isFrozen(settled.lastSettlement!.payments));assert.ok(Object.isFrozen(settled.lastSettlement!.after));
});
for(const name of ['pinfu-parent','pinfu-child','mangan-parent','mangan-child']) for(const honba of [0,1,2]) test(`${name} tsumo ${honba} honba: each payer plus 100`,()=>{
 let game=scoringGame(name);if(game.phase!=='won')game=declareTsumo(game,game.turnPlayerId);
 const win=game.winResult!;if(win.winMethod!=='tsumo')throw Error();
 const match=settleRound({...startMatch(startGame()),game,honba});const expected=[25000,25000,25000,25000];
 for(const p of win.payments){expected[p.playerId]-=p.points+honba*100;expected[win.winnerId]+=p.points+honba*100;}
 assert.deepEqual(match.points,expected);assertPointConservation(match);assert.equal(match.lastSettlement!.payments.reduce((s,p)=>s+p.honbaPoints,0),honba*300);
});
test('dealer 5800 ron against CPU3 exact transfer',()=>{
 const game=fixedRon(0,[0]);const win=game.winResult!;if(win.winMethod!=='ron')throw Error();assert.equal(win.winners[0].totalPoints,5800);
 assert.deepEqual(startMatch(game).points,[30800,25000,25000,19200]);
});
for(const winners of [[0],[0,2],[0,1,2]] as const)test(`deposits go to nearest ron winner ${winners}`,()=>{
 const game=fixedRon(0,winners,3);const initial={...startMatch(startGame()),game,points:[23000,25000,25000,25000] as Points,depositSticks:2};
 const match=settleRound(initial);assert.deepEqual(match.lastSettlement!.deposits,{recipientId:0,points:2000});assert.equal(match.depositSticks,0);assertPointConservation(match);
});
test('nearest deposit winner independent of displayed winner order',()=>{
 const game=fixedRon(0,[1,2],0);const match=settleRound({...startMatch(startGame()),game,points:[24000,25000,25000,25000] as Points,depositSticks:1});
 assert.equal(match.lastSettlement!.deposits!.recipientId,1);assertPointConservation(match);
});
test('single tsumo receives all deposits',()=>{
 const game=declareTsumo(scoringGame('pinfu-parent'),0);const match=settleRound({...startMatch(startGame()),game,points:[25000,24000,25000,25000] as Points,depositSticks:1});assert.equal(match.lastSettlement!.deposits!.recipientId,0);assertPointConservation(match);
});
test('negative points allowed and new match resets all',()=>{
 const initial={...startMatch(),game:fixedRon(0,[0,1,2]),points:[99000,1000,1000,-1000] as Points};const match=settleRound(initial);assert.ok(match.points[3]<0);assertPointConservation(match);
 const ui=new GameController();ui.match=match;ui.newGame();assert.deepEqual(ui.match.points,[25000,25000,25000,25000]);assert.equal(ui.match.lastSettlement,null);
});
for(const amount of [-1,1.5,NaN,Infinity])test(`invalid payment ${amount} rejected`,()=>{
 const game=fixedRon(0,[0]);const win=game.winResult!;if(win.winMethod!=='ron')throw Error();
 const bad={...game,winResult:{...win,winners:[{...win.winners[0],payments:[{playerId:3 as const,points:amount}]}]}};
 assert.throws(()=>settleRound({...startMatch(),game:bad}),RangeError);
});
test('inconsistent deposits and point totals rejected',()=>assert.throws(()=>settleRound({...startMatch(),game:fixedRon(0,[0]),depositSticks:1}),RangeError));
