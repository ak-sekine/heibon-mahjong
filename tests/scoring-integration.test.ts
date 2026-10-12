import { scoringGame } from './scoring-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFu } from '../src/analysis/fu.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { evaluateWin, selectScoredWinCandidate, selectWinCandidate } from '../src/game/win.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { declareRon, getRonCandidates } from '../src/game/ron.ts';
import { startGame } from '../src/game/start.ts';
import type { WinDetails, PlayerId } from '../src/model/game.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { ronGame } from './ron-fixture.ts';
import { freeze, inventory, seeded } from './helpers.ts';

const assertConsistent = (win: WinDetails) => {
  assert.equal(win.totalPoints, win.payments.reduce((s,p)=>s+p.points,0));
  assert.equal(win.totalHan, win.candidate.totalHan);
  assert.equal(win.yakumanCount,win.candidate.yakumanCount);
  assert.equal(win.totalHanIncludingDora,win.yakumanCount?0:win.yakuHan+win.doraHan+win.redDoraHan);
  if(win.rawFu!==null)assert.equal(win.rawFu,win.fuBreakdown.reduce((s,e)=>s+e.fu,0));
  assert.ok(win.analysis.candidates.includes(win.candidate));
};
for(const winner of [0,1,2,3] as const) test(`fixed wall tsumo scoring seat ${winner}`,()=>{
  const initial=winner===0?tsumoGame(['123m','456m','789p','22p','456s'],false,undefined,'man-4'):cpuTsumoGame(winner);
  freeze(initial);const won=declareTsumo(initial,winner);inventory(won,initial);
  assert.equal(won.winResult!.winMethod,'tsumo');if(won.winResult!.winMethod!=='tsumo')throw Error();
  const win=won.winResult!; assertConsistent(win);
  assert.equal(win.fu,20);assert.equal(win.scoreTier,'mangan');
  assert.equal(win.totalPoints,winner===0?12000:8000);
  assert.throws(()=>declareTsumo(won,winner),RangeError);
});
for(const winner of [0,1,2,3] as const)test(`fixed wall ron scoring seat ${winner}`,()=>{
  const discarder=((winner+1)%4) as PlayerId;
  const initial=ronGame(discarder,[winner]);freeze(initial);
  const won=initial.phase === 'won' ? initial : declareRon(initial,winner);inventory(won,initial);
  if(won.winResult?.winMethod!=='ron')throw Error();
  const win=won.winResult.winners.find(w=>w.winnerId===winner)!;assertConsistent(win);
  assert.equal(win.fu,30);assert.equal(win.payments[0].playerId,discarder);
  assert.equal(win.totalPoints,3900);assert.equal(win.redDoraHan,1);assert.equal(win.doraHan,1);
  assert.throws(()=>declareRon(won,winner),RangeError);
});
for(const winners of [[0,2],[0,2,3]] as const)test(`simultaneous ron ${winners.length} separate payments`,()=>{
  const initial=ronGame(1,winners);freeze(initial);const won=declareRon(initial,0);inventory(won,initial);
  if(won.winResult?.winMethod!=='ron')throw Error();
  assert.equal(won.winResult.winners.length,winners.length);
  for(const win of won.winResult.winners){assertConsistent(win);assert.deepEqual(win.payments,[{playerId:1,points:3900}]);}
  assert.equal(won.winResult.winners.reduce((s,w)=>s+w.totalPoints,0),3900*winners.length);
  assert.equal('points' in won.players[0],false);
});
for(const [name,groups,fu,mode] of [
  ['seven pairs',['11m','33m','55p','77p','22s','44s','77z'],25,'seven-pairs'],
  ['triplets',['234m','345p','678s','222p','66m'],30,'standard'],
  ['shanpon',['345m','678p','234s','66p','222m'],30,'standard'],
  ['kokushi',['19m','19p','19s','12345677z'],null,'yakuman'],
] as const)test(`fixed wall ${name}`,()=>{
  const initial=tsumoGame([...groups]);const won=declareTsumo(initial,0);inventory(won,initial);
  if(won.winResult?.winMethod!=='tsumo')throw Error();const win=won.winResult;assertConsistent(win);
  assert.equal(win.fu,fu);assert.equal(win.fuMode,mode);
  if(name==='kokushi'){assert.equal(win.totalPoints,48000);assert.equal(win.doraHan,0);assert.equal(win.redDoraHan,0);}
});
test('fixed shanpon ron versus tsumo marks only winning triplet open',()=>{
  const initial=ronGame(1,[0],[['345m','678p','234s','66p','22m']],'man-2',false,'sou-9');
  const ron=getRonCandidates(initial).find(w=>w.winnerId===0)!;assertConsistent(ron);
  const tsumo=tsumoGame(['345m','678p','234s','66p','222m'],false,[],'sou-9');
  const drawn=evaluateWin(tsumo,0,tsumo.players[0].drawnTile!,'tsumo')!;
  assert.equal(ron.candidate.wait,'shanpon');assert.equal(drawn.candidate.wait,'shanpon');
  assert.equal(ron.rawFu,32);assert.equal(drawn.rawFu,26);
  assert.equal(ron.fu,40);assert.equal(drawn.fu,30);
  assert.equal(ron.fuBreakdown.find(e=>e.type==='triplet')!.fu,2);
  assert.equal(drawn.fuBreakdown.find(e=>e.type==='triplet')!.fu,4);
  inventory(initial,initial);inventory(tsumo,tsumo);
});
for(const winning of ['man-1','man-2','man-3','man-4','man-5','man-6','man-7'])test(`ambiguous real hand maximizes points ${winning}`,()=>{
  const ranks='11223344556677'.split('');ranks.splice(ranks.indexOf(winning.at(-1)!),1);
  const game=ronGame(1,[0],[[ranks.join('')+'m']],winning,false,'sou-9');
  const result=getRonCandidates(game).find(w=>w.winnerId===0)!;assertConsistent(result);inventory(game,game);
  const evaluated=result.analysis.candidates.filter(c=>c.yaku.length>0).map(candidate=>{
    const fu=calculateFu(candidate,{winMethod:'ron',seatWind:'east',roundWind:'east'});
    const totalHanIncludingDora=candidate.totalHan+result.doraHan+result.redDoraHan;
    return {...result,candidate,totalHan:candidate.totalHan,yakuHan:candidate.totalHan,totalHanIncludingDora,...fu,
      ...calculateScore({totalHanIncludingDora,fu:fu.fu,yakumanCount:candidate.yakumanCount,winnerId:0,dealerId:1,discarderId:1,winMethod:'ron'})};
  });
  freeze(evaluated);
  assert.equal(result.totalPoints,Math.max(...evaluated.map(w=>w.totalPoints)));
  assert.equal(selectScoredWinCandidate(evaluated)!.candidate.id,result.candidate.id);
  assert.equal(selectScoredWinCandidate([...evaluated].reverse())!.candidate.id,result.candidate.id);
  assert.deepEqual(result.fuBreakdown,calculateFu(result.candidate,{winMethod:'ron',seatWind:'east',roundWind:'east'}).fuBreakdown);
  if(winning==='man-1') {assert.equal(result.fu,30);assert.equal(result.candidate.shape,'standard');assert.equal(result.yakuHan,2);}
});
test('point selection can prefer fewer han, with deterministic tie breakers',()=>{
  const game=tsumoGame();const original=evaluateWin(game,0,game.players[0].drawnTile!,'tsumo')!;
  // Selection-only score records exercise priority independently of shape analysis.
  const record=(id:string,han:number,fu:number,yakumanCount=0):WinDetails=>({...original,candidate:{...original.candidate,id},yakuHan:han,fu,yakumanCount,
    ...calculateScore({totalHanIncludingDora:han,fu,yakumanCount,winnerId:1,dealerId:0,discarderId:2,winMethod:'ron'})});
  const lowHan=record('b',3,70),highHan=record('a',4,30);
  assert.equal(selectScoredWinCandidate([highHan,lowHan]),lowHan);
  const highFu=record('d',2,40),lowFu=record('c',2,30);
  assert.equal(selectScoredWinCandidate([lowFu,highFu]),highFu);
  const same=record('a',3,70);assert.equal(selectScoredWinCandidate([lowHan,same]),same);
  assert.equal(selectScoredWinCandidate([same,lowHan]),same);
  const yakuman=record('z',0,30,1);assert.equal(selectScoredWinCandidate([lowHan,yakuman]),yakuman);
  const counted=record('a',13,30);assert.equal(selectScoredWinCandidate([counted,yakuman]),yakuman);
  assert.equal(selectScoredWinCandidate([]),null);
});
test('legacy selector remains supported and reset drops scoring',()=>{
  const game=tsumoGame();const won=declareTsumo(game,0);if(won.winResult?.winMethod!=='tsumo')throw Error();
  assert.ok(selectWinCandidate(won.winResult.analysis));
  const reset=startGame(seeded(42));assert.equal(reset.winResult,null);assert.equal(reset.ronWindow,null);
});

for (const [name, fu, tier, points] of [
  ['haneman',60,'haneman',18000],['baiman',60,'baiman',24000],
  ['sanbaiman',60,'sanbaiman',36000],['seven-pairs-ron',25,'normal',1600],
] as const) test(`browser fixed-wall scoring fixture ${name}`, () => {
  const initial = scoringGame(name); freeze(initial); inventory(initial, initial);
  const won = initial.phase === 'awaiting-ron' ? declareRon(initial,0) : declareTsumo(initial,0);
  inventory(won, initial);
  const win = won.winResult!.winMethod === 'ron' ? won.winResult!.winners[0] : won.winResult!;
  assertConsistent(win);
  assert.deepEqual([win.fu,win.scoreTier,win.totalPoints],[fu,tier,points]);
});
