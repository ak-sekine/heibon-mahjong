import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeYaku} from '../src/analysis/yaku.ts';
import {calculateFu} from '../src/analysis/fu.ts';
import {calculateScore} from '../src/analysis/score.ts';
import {evaluateWin,selectScoredWinCandidate} from '../src/game/win.ts';
import {getRonCandidates} from '../src/game/ron.ts';
import {ronGame} from './ron-fixture.ts';
import {tsumoGame} from './tsumo-fixture.ts';
import {freeze,inventory} from './helpers.ts';

for(const rank of ['1','2','3','4','5','6','7']) test(`riichi scores every real ambiguous decomposition, winning man-${rank}`,()=>{
 const ranks='11223344556677'.split('');ranks.splice(ranks.indexOf(rank),1);
 const original=ronGame(1,[0],[[ranks.join('')+'m']],`man-${rank}`,false,'sou-9');
 const game={...original,players:original.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:'past'}}:p) as unknown as typeof original.players};
 const result=getRonCandidates(game).find(w=>w.winnerId===0)!;assert.ok(result);inventory(game,original);
 const scored=result.analysis.candidates.map(candidate=>{
  assert.ok(candidate.yaku.some(y=>y.id==='riichi'));const fu=calculateFu(candidate,{winMethod:'ron',seatWind:'north',roundWind:'east'});
  const totalHanIncludingDora=candidate.totalHan+result.doraHan+result.uraDoraHan+result.redDoraHan;
  return {...result,candidate,yakuHan:candidate.totalHan,totalHan:candidate.totalHan,totalHanIncludingDora,...fu,
   ...calculateScore({totalHanIncludingDora,fu:fu.fu,yakumanCount:candidate.yakumanCount,winnerId:0,dealerId:1,discarderId:1,winMethod:'ron'})};
 });freeze(scored);assert.equal(result.totalPoints,Math.max(...scored.map(s=>s.totalPoints)));
 assert.equal(selectScoredWinCandidate(scored)!.candidate.id,result.candidate.id);assert.equal(selectScoredWinCandidate([...scored].reverse())!.candidate.id,result.candidate.id);
});

test('adding riichi han recomputes the maximum score rather than retaining a previous selection',()=>{
 const g=tsumoGame();const base=evaluateWin(g,0,g.players[0].drawnTile!,'tsumo')!;
 // Selector contract: 3 han 70 fu beats 4 han 30 fu. Adding riichi makes
 // both mangan, and the existing han tie-breaker selects the other record.
 const record=(id:string,han:number,fu:number)=>({...base,candidate:{...base.candidate,id},yakuHan:han,fu,
  ...calculateScore({totalHanIncludingDora:han,fu,yakumanCount:0,winnerId:1,dealerId:0,discarderId:2,winMethod:'ron'})});
 const before=[record('a',3,70),record('b',4,30)];const after=[record('a',4,70),record('b',5,30)];
 assert.equal(selectScoredWinCandidate(before)!.candidate.id,'a');assert.equal(selectScoredWinCandidate(after)!.candidate.id,'b');
});

test('optional riichi context preserves old analyzeYaku results and validates its boolean',()=>{
 const g=tsumoGame();const tiles=[...g.players[0].hand,g.players[0].drawnTile!].map(t=>t.tile);
 const context={winMethod:'tsumo' as const,winningTile:g.players[0].drawnTile!.tile,seatWind:'east' as const,roundWind:'east' as const};
 assert.deepEqual(analyzeYaku(tiles,context),analyzeYaku(tiles,{...context,riichi:false}));
 assert.throws(()=>analyzeYaku(tiles,{...context,riichi:1 as unknown as boolean}),RangeError);
});
