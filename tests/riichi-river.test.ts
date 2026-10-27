import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable } from '../src/rendering/table.ts';
import { declareRiichi } from '../src/game/riichi.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { passRon, declareRon } from '../src/game/ron.ts';
import { cpuRiichiStart } from './cpu-riichi-fixture.ts';
import { inventory } from './helpers.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { NO_YAKU_WAIT } from './riichi-fixture.ts';
import { AutomaticTurnRunner } from '../src/game/automatic-turns.ts';
import { createLocalActionPanelState } from '../src/rendering/local-action-panel-state.ts';
import { diagnosticLog } from '../src/online/diagnostics.ts';
import { callStart } from './calls-fixture.ts';
import { getCallOptions, declareCall } from '../src/game/calls.ts';
import { canDeclareRiichi } from '../src/game/riichi.ts';
import { kanGame } from '../src/verification/kan-fixture.ts';
import { riichiRiverReference } from '../src/rendering/riichi-river-reference.ts';
import { createPlayerGameView, type OnlineGameSession } from '../src/online/game-view.ts';
import { calculateRiverLayout, riverPositionFor } from '../src/rendering/river-layout.ts';
class Node {
  children:Node[]=[];dataset:Record<string,string>={};style=Object.assign({} as Record<string,string>,{setProperty(name:string,value:string){this[name]=value;},removeProperty(name:string){delete this[name];}});className='';textContent='';innerHTML='';hidden=false;
  attributes:Record<string,string>={};content={firstElementChild:this};title={textContent:''};
  append(...nodes:Node[]){this.children.push(...nodes);} replaceChildren(...nodes:Node[]){this.children=nodes;}
  setAttribute(k:string,v:string){this.attributes[k]=v;}querySelector(){return this.title;}
}
function riverFace(tile:Node):Node {
  const child=tile.children[0];
  return child.className==='river-tile-face'?child.children[0]:child;
}
async function withDom(run:(nodes:Map<string,Node>)=>void|Promise<void>){
  const nodes=new Map<string,Node>();for(const id of [0,1,2,3]){nodes.set(`#label-${id}`,new Node());nodes.set(`.river[data-player-id="${id}"]`,new Node());}
  for(const key of ['#player-hand','#wall-count','#win-result','#dora-indicators'])nodes.set(key,new Node());
  const original=globalThis.document;globalThis.document={querySelector:(s:string)=>nodes.get(s),createElement:()=>new Node(),createTextNode:()=>new Node()} as unknown as Document;
  try{await run(nodes);}finally{globalThis.document=original;}
}
for(const seat of [0,1,2,3] as const)for(const position of [1,6,7,12,13])test(`seat ${seat}, river ${position}: exact ID, accessible declaration, other tiles normal, reset clears`,()=>withDom(nodes=>{
  const initial=cpuRiichiStart(seat);const players=[...initial.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[seat]={...players[seat],river:initial.liveWall.slice(0,position-1)};
  const game={...initial,players,liveWall:initial.liveWall.slice(position-1)};
  const match=declareRiichi(startMatch(game),seat,game.players[seat].drawnTile!.id);inventory(match.game,initial);
  renderTable(match.game,match.points);const river=nodes.get(`.river[data-player-id="${seat}"]`)!;
  assert.equal(river.children.length,position);assert.equal(river.children.filter(c=>c.dataset.riichiDeclaration==='true').length,1);
  const declared=river.children[position-1];assert.equal(declared.dataset.tileId,game.players[seat].drawnTile!.id);
  assert.match(riverFace(declared).attributes['aria-label'],/リーチ宣言牌/);assert.match(riverFace(declared).title.textContent,/リーチ宣言牌/);
  assert.ok(river.children.slice(0,-1).every(c=>c.dataset.riichiDeclaration==='false'));
  renderTable({...match.game,liveWall:[...match.game.liveWall]});assert.equal(river.children[position-1].dataset.tileId,declared.dataset.tileId);
  renderTable(cpuRiichiStart(seat));assert.equal(river.children.length,0);
}));
for(const action of ['pending','pass','ron'] as const)test(`river declaration marker follows ${action} resolution`,()=>withDom(nodes=>{
  const initial=cpuRiichiStart(1,[0]);const pending=declareRiichi(startMatch(initial),1,initial.players[1].drawnTile!.id);
  const match=action==='pending'?pending:updateMatchGame(pending,action==='pass'?passRon(pending.game,0):declareRon(pending.game,0));
  renderTable(match.game);const tile=nodes.get('.river[data-player-id="1"]')!.children[0];
  assert.equal(tile.dataset.riichiDeclaration,String(action==='pass'));
  if(action!=='pass')assert.equal(riverFace(tile).attributes['aria-label'],undefined);
}));
test('declaration marker uses physical identity rather than face',()=>withDom(nodes=>{
  const initial=cpuRiichiStart();let match=declareRiichi(startMatch(initial),1,initial.players[1].drawnTile!.id);
  const other=match.game.liveWall.find(t=>t.tile.category==='honor'&&t.tile.honor==='north')!;
  const players=[...match.game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];players[1]={...players[1],river:[...players[1].river,other]};
  const game={...match.game,players,liveWall:match.game.liveWall.filter(t=>t.id!==other.id)};renderTable(game);inventory(game,initial);
  const tiles=nodes.get('.river[data-player-id="1"]')!.children;assert.deepEqual(tiles.map(t=>t.dataset.riichiDeclaration),['true','false']);
}));

test('CPU2 riichi declaration claimed by CPU1 pon renders and advances the offline runner',async()=>withDom(async nodes=>{
  diagnosticLog.clear();
  const dealt=callStart(2,{0:['111p','789m','234s','77z','19s'],1:['55m','222z','333z','55z','66z','1z'],2:NO_YAKU_WAIT,3:['999p','123s','789s','77z','68m']},'man-5');
  const safeDraw=dealt.liveWall.findIndex(tile=>tile.tile.category==='honor'&&tile.tile.honor==='north');
  const liveWall=[...dealt.liveWall];[liveWall[0],liveWall[safeDraw]]=[liveWall[safeDraw]!,liveWall[0]!];
  const initial={...dealt,liveWall};
  const declarationId=initial.players[2].drawnTile!.id;
  let match=declareRiichi(startMatch(initial),2,declarationId);
  assert.equal(match.game.players[2].riichi?.declarationTileId,declarationId);
  assert.equal(match.game.players[1].melds?.[0]?.type,'pon');
  assert.equal(match.game.players[1].melds?.[0]?.calledTileId,declarationId);
  assert.equal(match.game.players[2].river.some(tile=>tile.id===declarationId),false);
  assert.equal(match.game.players[2].discardHistory?.some(tile=>tile.id===declarationId),true);
  assert.equal(match.depositSticks,1);assert.equal(match.points[2],24000);
  assert.equal(match.game.turnPlayerId,1);assert.equal(match.game.phase,'awaiting-discard');
  inventory(match.game,initial);

  renderTable(match.game,match.points);
  const river=nodes.get('.river[data-player-id="2"]')!;
  assert.equal(river.children.some(tile=>tile.dataset.tileId===declarationId),false);
  assert.equal(nodes.get('#label-1')!.dataset.active,'true');

  const runner=new AutomaticTurnRunner({wait:async()=>{},chooseDiscard:player=>player.drawnTile?.id ?? player.hand.at(-1)!.id});
  await runner.runMatch(()=>match,next=>{match=next;});
  assert.equal(runner.running,false);
  assert.equal(match.game.turnPlayerId,3);assert.equal(match.game.phase,'awaiting-call');
  assert.equal(match.game.players[1].river.length,1);
  assert.equal(match.game.players[2].river.length,1);
  renderTable(match.game,match.points);
  assert.equal(nodes.get('.river[data-player-id="3"]')!.children.length,1);
  assert.equal(nodes.get('#label-3')!.dataset.active,'true');
  const panel=createLocalActionPanelState(match,null,false,false);
  assert.equal(panel.actionStatus,'鳴き判断を待っています。');
  assert.equal(panel.callGroup.visible,true);
  assert.equal(panel.buttons.discard.visible,false);
  assert.ok(diagnosticLog.all().some(entry=>entry.event==='local_cpu_turn_completed'));
  assert.ok(diagnosticLog.all().some(entry=>entry.event==='local_cpu_to_human_wait'&&entry.details.phase==='awaiting-call'&&entry.details.decisionPending===true));
  assert.ok(!diagnosticLog.all().some(entry=>entry.event==='local_game_render_failed'));
}));

test('riichi declaration called by chi or daiminkan is omitted from the river without changing riichi payment',()=>withDom(nodes=>{
  const chiHand=['3467m','234p','678s','19p','1z'];
  const chiStart=callStart(3,{0:chiHand,3:NO_YAKU_WAIT},'man-5');
  const chiDeclaration=chiStart.players[3].drawnTile!.id;
  assert.ok(canDeclareRiichi(chiStart,3,chiDeclaration,25000));
  let chiMatch=declareRiichi(startMatch(chiStart),3,chiDeclaration);
  const chiOption=getCallOptions(chiMatch.game,0).find(option=>option.type==='chi');
  assert.ok(chiOption);
  chiMatch=updateMatchGame(chiMatch,declareCall(chiMatch.game,0,chiOption.id));
  assert.equal(chiMatch.game.players[3].riichi?.declarationTileId,chiDeclaration);
  assert.equal(chiMatch.game.players[3].river.some(tile=>tile.id===chiDeclaration),false);
  assert.equal(chiMatch.game.players[3].discardHistory?.some(tile=>tile.id===chiDeclaration),true);
  assert.equal(chiMatch.depositSticks,1);assert.equal(chiMatch.points[3],24000);
  renderTable(chiMatch.game,chiMatch.points);
  assert.equal(nodes.get('.river[data-player-id="3"]')!.children.some(tile=>tile.dataset.tileId===chiDeclaration),false);
  inventory(chiMatch.game,chiStart);

  const kanBase=kanGame({hands:{1:['111z','234m','456p','678s','2z'],2:NO_YAKU_WAIT},turn:2,draw:'east',rinshan:['north']});
  const kanPlayers=[...kanBase.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  kanPlayers[1]={...kanPlayers[1],control:'human'};
  const kanStart={...kanBase,players:kanPlayers};
  const kanDeclaration=kanStart.players[2].drawnTile!.id;
  assert.ok(canDeclareRiichi(kanStart,2,kanDeclaration,25000));
  let kanMatch=declareRiichi(startMatch(kanStart),2,kanDeclaration);
  const kanOption=getCallOptions(kanMatch.game,1).find(option=>option.type==='daiminkan');
  assert.ok(kanOption);
  kanMatch=updateMatchGame(kanMatch,declareCall(kanMatch.game,1,kanOption.id));
  assert.equal(kanMatch.game.players[2].riichi?.declarationTileId,kanDeclaration);
  assert.equal(kanMatch.game.players[2].river.some(tile=>tile.id===kanDeclaration),false);
  assert.equal(kanMatch.depositSticks,1);assert.equal(kanMatch.points[2],24000);
  renderTable(kanMatch.game,kanMatch.points);
  assert.equal(nodes.get('.river[data-player-id="2"]')!.children.some(tile=>tile.dataset.tileId===kanDeclaration),false);
  inventory(kanMatch.game,kanStart);
}));

test('missing declaration is identified only when a public call proves it was claimed',()=>{
  const initial=cpuRiichiStart(2);
  const tile=initial.players[2].drawnTile!;
  const declared={...initial,players:initial.players.map(player=>player.id===2
    ? {...player,riichi:{declarationTileId:tile.id},river:[],discardHistory:[tile]}
    : player) as unknown as GameState['players']};
  const publicPon={ownerSeat:1 as const,type:'pon' as const,calledTileId:tile.id,fromPlayerId:2 as const,tiles:[tile]};
  assert.equal(riichiRiverReference(2,[],tile.id,[publicPon],[tile]).state,'claimed');
  assert.equal(riichiRiverReference(2,[],tile.id,[],[tile]).state,'inconsistent');
  assert.equal(riichiRiverReference(2,[],tile.id,[publicPon],[]).state,'inconsistent');
  assert.equal(riichiRiverReference(2,[tile],tile.id,[],[tile]).state,'present');
  assert.equal(riichiRiverReference(2,[tile],tile.id,[publicPon],[tile]).state,'inconsistent');
  assert.throws(()=>renderTable(declared),RangeError);
});

test('online public seat data carries the called declaration proof into shared river layout',()=>{
  const base=callStart(2,{0:['111p','789m','234s','77z','19s'],1:['55m','222z','333z','55z','66z','1z'],2:NO_YAKU_WAIT,3:['999p','123s','789s','77z','68m']},'man-5');
  const sessionMatch=declareRiichi(startMatch(base),2,base.players[2].drawnTile!.id);
  const identities=[0,1,2,3].map(seat=>({seat:seat as 0|1|2|3,name:`seat-${seat}`,control:seat===0?'human' as const:'cpu' as const,connected:seat===0})) as unknown as OnlineGameSession['identities'];
  const session:OnlineGameSession={schemaVersion:1,gameRevision:5,match:sessionMatch,status:'playing',identities,hostSeat:0,decision:null};
  const view=createPlayerGameView(session,0,'A2CDEF',new Set([0]));
  const source=view.seats[2];
  const melds=view.seats.flatMap(owner=>owner.melds.map(meld=>({
    ownerSeat:owner.seat,type:meld.type,calledTileId:meld.calledTileId,fromPlayerId:meld.fromPlayerId,tiles:meld.tiles,
  })));
  const reference=riichiRiverReference(source.seat,source.river,source.riichiDeclarationTileId,melds);
  assert.equal(reference.state,'claimed');
  assert.doesNotThrow(()=>calculateRiverLayout(riverPositionFor(view.viewerSeat,source.seat),source.river.length,reference.index));
  assert.equal(source.river.some(tile=>tile.id===source.riichiDeclarationTileId),false);
});
