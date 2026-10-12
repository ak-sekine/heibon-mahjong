import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFu } from '../src/analysis/fu.ts';
import { analyzeYaku, type WinningContext } from '../src/analysis/yaku.ts';
import { TILE_KINDS, ordinaryTile } from '../src/model/tile.ts';
import { freeze } from './helpers.ts';

export function hand(groups: readonly string[]) {
  return groups.flatMap(g => [...g.slice(0, -1)].map(n => ordinaryTile(TILE_KINDS[
    ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1])));
}
const pinfu = ['123m', '456p', '789s', '234s', '22p'];
const chiitoi = ['11m', '33m', '55p', '77p', '22s', '44s', '77z'];
for (const [name, groups, winning, method, wait, raw, fu, mode] of [
  ['pinfu tsumo', pinfu, '4s', 'tsumo', 'ryanmen', 20, 20, 'pinfu-tsumo'],
  ['pinfu ron', pinfu, '4s', 'ron', 'ryanmen', 30, 30, 'standard'],
  ['seven pairs tsumo', chiitoi, '7z', 'tsumo', 'tanki', 25, 25, 'seven-pairs'],
  ['seven pairs ron', chiitoi, '7z', 'ron', 'tanki', 25, 25, 'seven-pairs'],
  ['simple shanpon ron', ['222m','345p','678s','123s','66p'], '2m','ron','shanpon',32,40,'standard'],
  ['simple shanpon tsumo', ['222m','345p','678s','123s','66p'], '2m','tsumo','shanpon',26,30,'standard'],
  ['terminal shanpon ron', ['111m','345p','678s','123s','66p'], '1m','ron','shanpon',34,40,'standard'],
  ['terminal shanpon tsumo', ['111m','345p','678s','123s','66p'], '1m','tsumo','shanpon',30,30,'standard'],
  ['honor shanpon ron', ['777z','345p','678s','123s','66p'], '7z','ron','shanpon',34,40,'standard'],
  ['honor shanpon tsumo', ['777z','345p','678s','123s','66p'], '7z','tsumo','shanpon',30,30,'standard'],
  ['other triplet stays concealed', ['222m','345p','678s','123s','66p'], '6p','ron','tanki',36,40,'standard'],
  ['kanchan', ['123m','456p','789s','234s','22p'],'3s','ron','kanchan',32,40,'standard'],
  ['penchan', ['123m','456p','789s','234s','22p'],'3m','ron','penchan',32,40,'standard'],
  ['tanki',pinfu,'2p','ron','tanki',32,40,'standard'],
  ['dragon pair', ['123m','456p','789s','234s','77z'],'4s','ron','ryanmen',32,40,'standard'],
  ['east double wind pair', ['123m','456p','789s','234s','11z'],'4s','ron','ryanmen',34,40,'standard'],
  ['38 rounds to 40', ['222m','345p','678s','123s','77z'],'7z','ron','tanki',38,40,'standard'],
  ['42 rounds to 50', ['111m','345p','678s','123s','77z'],'7z','ron','tanki',42,50,'standard'],
  ['kokushi', ['19m','19p','19s','12345677z'],'7z','ron',null,null,null,'yakuman'],
] as const) test(`fu: ${name}`, () => {
  const context: WinningContext = { winMethod: method, winningTile: hand([winning])[0], seatWind: 'east', roundWind: 'east' };
  const analysis = analyzeYaku(hand(groups), context);
  const candidate = analysis.candidates.find(c => c.wait === wait && (mode !== 'seven-pairs' || c.shape === 'seven-pairs'))!;
  assert.ok(candidate); freeze(candidate); freeze(context);
  const result = calculateFu(candidate, context);
  assert.deepEqual([result.rawFu, result.fu, result.fuMode], [raw, fu, mode]);
  if (raw !== null) assert.equal(result.fuBreakdown.reduce((sum,e)=>sum+e.fu,0), raw);
  if (mode === 'standard') {
    assert.deepEqual(result.fuBreakdown.slice(0,2), [{type:'base',fu:20},method === 'ron' ? {type:'menzen-ron',fu:10}:{type:'tsumo',fu:2}]);
    assert.equal(result.fuBreakdown.find(e=>e.type==='wait')!.fu, ['kanchan','penchan','tanki'].includes(wait!) ? 2 : 0);
  }
});
for (const [pair, seat, expected] of [['11z','south',2],['22z','south',2],['33z','south',0],['66p','south',0],['55z','south',2]] as const) test(`pair ${pair} seat ${seat}`,()=>{
  const context: WinningContext = {winMethod:'ron',winningTile:hand(['4s'])[0],seatWind:seat,roundWind:'east'};
  const candidate=analyzeYaku(hand(['123m','456p','789s','234s',pair]),context).candidates.find(c=>c.wait==='ryanmen')!;
  assert.equal(calculateFu(candidate,context).fuBreakdown.find(e=>e.type==='pair')!.fu,expected);
});
