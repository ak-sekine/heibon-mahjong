import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShanten } from '../src/analysis/shanten.ts';
import { TILE_KINDS, ordinaryTile, redFive } from '../src/model/tile.ts';
import { isWinningShape } from '../src/analysis/winning-shape.ts';
import { faces } from './shanten-fixture.ts';
// Complete blocks, then deliberately remove independent needed tiles. Expectations
// follow 8-2*melds-taatsu-head; honors prevent alternative sequence decompositions.
for (const [hand,expected] of [
 ['123m 456p 789s 11z 23s',0], ['123m 456p 11z 23s 45s 7z',1],
 ['123m 11z 23p 45s 67s 2z 3z',2], ['11z 23m 45p 67s 23s 2z 3z 4z',3],
 ['123m 456p 789s 11z 22z',0], ['1122334455667m',0],
 ['111222333m 11z 23p',0], ['123m 456p 789s 11z 24s',0],
 ['123m 456p 789s 11z 12s',0], ['11m 22p 33s 44z 55z 66z 7z',3],
] as const) test(`standard ${hand}: ${expected}`,()=>assert.equal(calculateShanten(faces(hand)).standard,expected));
for (const [hand,expected] of [
 ['11m 22p 33s 44z 55z 66z 7z',0], ['11m 22p 33s 44z 55z 6z 7z 9s',1],
 ['11m 22p 33s 44z 5z 6z 7z 9s 9m',2], ['1111m 22p 33s 44z 55z 6z',2],
] as const) test(`seven pairs ${hand}`,()=>assert.equal(calculateShanten(faces(hand)).sevenPairs,expected));
for (const [hand,expected] of [
 ['19m 19p 19s 1234567z',0], ['119m 19p 19s 123456z',0],
 ['119m 19p 19s 12345z 2m',1], ['119m 19p 19s 1234z 23m',2],
] as const) test(`orphans ${hand}`,()=>assert.equal(calculateShanten(faces(hand)).thirteenOrphans,expected));
test('red five shares its kind; frozen input is stable',()=>{
 const tiles=faces('123m 456p 789s 11z 23s');tiles[4]=redFive('pin');
 const before=structuredClone(tiles);Object.freeze(tiles);
 assert.deepEqual(calculateShanten(tiles),calculateShanten(before));assert.deepEqual(tiles,before);
});
for(const size of [0,12,14]) test(`reject size ${size}`,()=>assert.throws(()=>calculateShanten(Array.from({length:size},()=>ordinaryTile(TILE_KINDS[0]))),RangeError));
test('reject five copies and invalid faces',()=>{
 assert.throws(()=>calculateShanten(faces('11111m 123p 123s 12z')),RangeError);
 assert.throws(()=>calculateShanten([...faces('123m 456p 789s 11z 2s'),{category:'honor',honor:'bad',isRed:false}] as never),RangeError);
});
for(const hand of ['123m 456p 789s 11z 23s','123m 456p 789s 11z 24s','123m 456p 789s 11z 12s','1122334455667m','19m 19p 19s 1234567z','119m 19p 19s 123456z']) test(`tenpai agrees with independent winning checker ${hand}`,()=>{
 const tiles=faces(hand);assert.equal(calculateShanten(tiles).minimum,0);
 assert.ok(TILE_KINDS.some(k=>tiles.filter(t=>JSON.stringify({...t,isRed:false})===JSON.stringify(ordinaryTile(k))).length<4 && isWinningShape([...tiles,ordinaryTile(k)])));
});
