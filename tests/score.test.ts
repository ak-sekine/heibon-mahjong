import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore, calculateBasePoints } from '../src/analysis/score.ts';
import type { PlayerId } from '../src/model/game.ts';
import { freeze } from './helpers.ts';
for (const [han,fu,child,dealer] of [
  [1,30,1000,1500],[2,25,1600,2400],[2,30,2000,2900],[3,30,3900,5800],
  [3,60,7700,11600],[3,70,8000,12000],[4,30,7700,11600],[4,40,8000,12000],
  [5,30,8000,12000],[6,30,12000,18000],[7,30,12000,18000],
  [8,30,16000,24000],[10,30,16000,24000],[11,30,24000,36000],
  [12,30,24000,36000],[13,30,32000,48000],[26,30,32000,48000],
] as const) for (const winnerId of [0,1] as const) test(`ron ${han}han ${fu}fu ${winnerId===0?'dealer':'child'}`,()=>{
  const context={totalHanIncludingDora:han,fu,yakumanCount:0,winnerId,dealerId:0 as const,discarderId:2 as const,winMethod:'ron' as const};
  freeze(context); const result=calculateScore(context);
  assert.equal(result.totalPoints,winnerId===0?dealer:child);
  assert.deepEqual(result.payments,[{playerId:2,points:result.totalPoints}]);
});
for (const [han,fu,tier,base] of [[4,30,'normal',1920],[3,60,'normal',1920],[3,70,'mangan',2000],[5,20,'mangan',2000],[6,20,'haneman',3000],[8,20,'baiman',4000],[11,20,'sanbaiman',6000],[13,20,'kazoe-yakuman',8000]] as const) test(`base tier ${han}/${fu}`,()=>assert.deepEqual(calculateBasePoints(han,fu),{scoreTier:tier,basePoints:base}));
for (const count of [1,2,3]) for (const winnerId of [0,1] as const) test(`yakuman ${count} ron ${winnerId}`,()=>{
  const result=calculateScore({totalHanIncludingDora:0,fu:null,yakumanCount:count,winnerId,dealerId:0,discarderId:2,winMethod:'ron'});
  assert.equal(result.totalPoints,count*(winnerId===0?48000:32000));assert.equal(result.scoreTier,'yakuman');
});
for (const [name,han,fu,yakuman,childPayment,dealerPayment] of [
  ['mangan',5,30,0,2000,4000],['yakuman',0,null,1,8000,16000],
  ['pinfu',2,20,0,400,700],['double yakuman',0,null,2,16000,32000],
] as const) for (const winnerId of [0,1,2,3] as const) test(`tsumo ${name} winner ${winnerId}`,()=>{
  const result=calculateScore({totalHanIncludingDora:han,fu,yakumanCount:yakuman,winnerId,dealerId:0,winMethod:'tsumo'});
  assert.equal(result.payments.length,3);
  for (const payment of result.payments) {
    assert.notEqual(payment.playerId,winnerId);
    assert.equal(payment.points,winnerId===0||payment.playerId===0?dealerPayment:childPayment);
  }
  assert.equal(result.totalPoints,result.payments.reduce((s,p)=>s+p.points,0));
  if(name==='pinfu'&&winnerId!==0)assert.equal(result.totalPoints,1500);
});
for (const dealerId of [1,2,3] as PlayerId[]) test(`dealer identity ${dealerId}`,()=>{
  const result=calculateScore({totalHanIncludingDora:5,fu:30,yakumanCount:0,winnerId:0,dealerId,winMethod:'tsumo'});
  assert.equal(result.payments.find(p=>p.playerId===dealerId)!.points,4000);
});
test('han caps precede fu validation, and yakuman ignores han bonuses',()=>{
  assert.deepEqual(calculateBasePoints(13,null),{scoreTier:'kazoe-yakuman',basePoints:8000});
  assert.deepEqual(calculateBasePoints(100,null,2),{scoreTier:'yakuman',basePoints:16000});
});
for(const [han,fu,count] of [[0,30,0],[1,null,0],[2,22,0],[-1,30,0],[1,30,-1],[1.5,30,0]] as const)test(`invalid score ${han}/${fu}/${count}`,()=>assert.throws(()=>calculateBasePoints(han,fu,count),RangeError));
test('ron requires a different payer',()=>assert.throws(()=>calculateScore({totalHanIncludingDora:1,fu:30,yakumanCount:0,winnerId:0,dealerId:0,winMethod:'ron',discarderId:0}),RangeError));
