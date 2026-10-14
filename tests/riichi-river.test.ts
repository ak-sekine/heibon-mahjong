import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable } from '../src/rendering/table.ts';
import { declareRiichi } from '../src/game/riichi.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { passRon, declareRon } from '../src/game/ron.ts';
import { cpuRiichiStart } from './cpu-riichi-fixture.ts';
import { inventory } from './helpers.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
class Node {
  children:Node[]=[];dataset:Record<string,string>={};style={};className='';textContent='';innerHTML='';hidden=false;
  attributes:Record<string,string>={};content={firstElementChild:this};title={textContent:''};
  append(...nodes:Node[]){this.children.push(...nodes);} replaceChildren(...nodes:Node[]){this.children=nodes;}
  setAttribute(k:string,v:string){this.attributes[k]=v;}querySelector(){return this.title;}
}
function withDom(run:(nodes:Map<string,Node>)=>void){
  const nodes=new Map<string,Node>();for(const id of [0,1,2,3]){nodes.set(`#label-${id}`,new Node());nodes.set(`.river[data-player-id="${id}"]`,new Node());}
  for(const key of ['#player-hand','#wall-count','#win-result','#dora-indicators'])nodes.set(key,new Node());
  const original=globalThis.document;globalThis.document={querySelector:(s:string)=>nodes.get(s),createElement:()=>new Node(),createTextNode:()=>new Node()} as unknown as Document;
  try{run(nodes);}finally{globalThis.document=original;}
}
for(const seat of [0,1,2,3] as const)for(const position of [1,6,7,12,13])test(`seat ${seat}, river ${position}: exact ID, accessible declaration, other tiles normal, reset clears`,()=>withDom(nodes=>{
  const initial=cpuRiichiStart(seat);const players=[...initial.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[seat]={...players[seat],river:initial.liveWall.slice(0,position-1)};
  const game={...initial,players,liveWall:initial.liveWall.slice(position-1)};
  const match=declareRiichi(startMatch(game),seat,game.players[seat].drawnTile!.id);inventory(match.game,initial);
  renderTable(match.game,match.points);const river=nodes.get(`.river[data-player-id="${seat}"]`)!;
  assert.equal(river.children.length,position);assert.equal(river.children.filter(c=>c.dataset.riichiDeclaration==='true').length,1);
  const declared=river.children[position-1];assert.equal(declared.dataset.tileId,game.players[seat].drawnTile!.id);
  assert.match(declared.children[0].attributes['aria-label'],/リーチ宣言牌/);assert.match(declared.children[0].title.textContent,/リーチ宣言牌/);
  assert.ok(river.children.slice(0,-1).every(c=>c.dataset.riichiDeclaration==='false'));
  renderTable({...match.game,liveWall:[...match.game.liveWall]});assert.equal(river.children[position-1].dataset.tileId,declared.dataset.tileId);
  renderTable(cpuRiichiStart(seat));assert.equal(river.children.length,0);
}));
for(const action of ['pending','pass','ron'] as const)test(`river declaration marker follows ${action} resolution`,()=>withDom(nodes=>{
  const initial=cpuRiichiStart(1,[0]);const pending=declareRiichi(startMatch(initial),1,initial.players[1].drawnTile!.id);
  const match=action==='pending'?pending:updateMatchGame(pending,action==='pass'?passRon(pending.game,0):declareRon(pending.game,0));
  renderTable(match.game);const tile=nodes.get('.river[data-player-id="1"]')!.children[0];
  assert.equal(tile.dataset.riichiDeclaration,String(action==='pass'));
  if(action!=='pass')assert.equal(tile.children[0].attributes['aria-label'],undefined);
}));
test('declaration marker uses physical identity rather than face',()=>withDom(nodes=>{
  const initial=cpuRiichiStart();let match=declareRiichi(startMatch(initial),1,initial.players[1].drawnTile!.id);
  const other=match.game.liveWall.find(t=>t.tile.category==='honor'&&t.tile.honor==='north')!;
  const players=[...match.game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];players[1]={...players[1],river:[...players[1].river,other]};
  const game={...match.game,players,liveWall:match.game.liveWall.filter(t=>t.id!==other.id)};renderTable(game);inventory(game,initial);
  const tiles=nodes.get('.river[data-player-id="1"]')!.children;assert.deepEqual(tiles.map(t=>t.dataset.riichiDeclaration),['true','false']);
}));
