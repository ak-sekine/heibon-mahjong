"""Step 13.2: deterministic legal-wall scenarios, seven Chromium viewports.
The module route adds test controls only; no test hooks ship in the application.
"""
import json,pathlib,shutil
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/screenshots/step13.3/regression');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import { cpuRiichiStart } from '/heibon-mahjong/tests/cpu-riichi-fixture.ts';
import { riichiStart } from '/heibon-mahjong/tests/riichi-fixture.ts';
import { startMatch, updateMatchGame } from '/heibon-mahjong/src/game/match.ts';
import { declareRiichi } from '/heibon-mahjong/src/game/riichi.ts';
import { discardTile } from '/heibon-mahjong/src/game/discard.ts';
import { drawTile } from '/heibon-mahjong/src/game/draw.ts';
import { declareTsumo } from '/heibon-mahjong/src/game/tsumo.ts';
import { ronStart } from '/heibon-mahjong/tests/ron-fixture.ts';
import { canDeclareRon } from '/heibon-mahjong/src/game/ron.ts';
const stepWaits=[];
"""+response.text()+"""
window.stepCheck=()=>controller.match;
window.stepLoad=(mode,seat=1)=>{controller.newGame();stepWaits.length=0;controller.match=startMatch(mode==='human'?riichiStart('furiten'):mode==='pending'?cpuRiichiStart(1,[0],'sou-5',['123m','456p','789s','22p','46m']):cpuRiichiStart(seat));render();};
window.stepRun=()=>{void controller.runner.runMatch(()=>controller.match,m=>{controller.match=m;render();},render);};
window.stepRelease=()=>stepWaits.shift()?.();
window.stepStop=()=>{controller.runner.cancel();stepWaits.length=0;render();};
window.stepDeclare=()=>{const g=controller.game;controller.match=declareRiichi(controller.match,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile.id);render();};
window.stepDraw=()=>{controller.game=drawTile(controller.game,controller.game.turnPlayerId);render();};
window.stepDiscard=()=>{const g=controller.game;controller.game=discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile.id);render();};
window.stepTsumo=()=>{const g=controller.game;controller.game=declareTsumo(g,g.turnPlayerId);render();};
window.stepMulti=(winners)=>{controller.newGame();let g=ronStart(1,winners);let liveWall=[...g.liveWall];const players=[...g.players];for(const id of winners){const index=liveWall.findIndex(t=>t.tile.category==='honor');const tile=liveWall.splice(index,1)[0];players[id]={...players[id],river:[tile],riichi:{declarationTileId:tile.id,passedRon:false}};}g={...g,players,liveWall};controller.match={...startMatch(g),points:[0,1,2,3].map(id=>winners.includes(id)?24000:25000),depositSticks:winners.length};controller.game=discardTile(g,1,g.players[1].drawnTile.id);render();};
window.stepRows=(position)=>{controller.newGame();const g=riichiStart('tsumo');const players=g.players.map((p,id)=>({...p,river:g.liveWall.slice(id*13,id*13+13),riichi:{declarationTileId:g.liveWall[id*13+position-1].id,passedRon:false}}));controller.match={...startMatch(g),game:{...g,players,liveWall:g.liveWall.slice(52)},points:[24000,24000,24000,24000],depositSticks:4};render();};
"""
   source=source.replace('new GameController(void 0, { onChange: render })','new GameController(undefined, { onChange: render, wait: (_ms, signal) => new Promise(resolve => {stepWaits.push(resolve);signal.addEventListener("abort",resolve,{once:true});}) })')
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:4173/heibon-mahjong/');page.wait_for_function('typeof stepCheck === "function"')
  measurements=[];shot_states=[]
  def conservation():assert page.evaluate('stepCheck().points.reduce((a,b)=>a+b,0)+stepCheck().depositSticks*1000')==100000
  def shot(name):
   state=page.evaluate('({points:stepCheck().points,deposits:stepCheck().depositSticks,phase:stepCheck().game.phase,labels:[0,1,2,3].map(id=>document.querySelector("#label-"+id).textContent)})')
   shot_states.append({'name':name,**state})
   page.screenshot(path=str(out/f'{width}x{height}-{name}.png'))
  def geometry():
   # Enlarged tiles use normal vertical scrolling.
   page.locator('#local-game-controls').scroll_into_view_if_needed()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   boxes=page.locator('#player-hand li').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
   assert len(set(round(b['y'],1) for b in boxes))==1
   assert all(b['x']>=0 and b['x']+b['w']<=width for b in boxes)
   assert page.locator('.dora-slot').count()==5
   assert page.locator('#dora-indicators').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==5
   if not page.locator('#ron').is_visible() and not page.locator('#show-result').is_visible():
    actions=page.locator('#discard,#riichi,#tsumo').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,w:r.width,h:r.height,bg:s.backgroundColor,disabled:e.disabled}})')
    assert max(a['w'] for a in actions)-min(a['w'] for a in actions)<.1
    assert all(a['h']==44 and a['y']+a['h']<=height and a['bg']==('rgb(212, 229, 219)' if a['disabled'] else 'rgb(255, 218, 125)') for a in actions),actions
    assert boxes[-1]['y']+boxes[-1]['h']<=page.locator('#local-game-controls').bounding_box()['y']
    if measurements:
     assert all(abs(a['x']-b['x'])<.1 and abs(a['w']-b['w'])<.1 for a,b in zip(actions,measurements[0]))
    measurements.append(actions)
   html=page.locator('main').inner_html();g=page.evaluate('stepCheck().game')
   winner_ids=[] if not g['winResult'] else [w['winnerId'] for w in g['winResult']['winners']] if g['winResult']['winMethod']=='ron' else [g['winResult']['winnerId']]
   for player in g['players'][1:]:
    if player['id'] not in winner_ids:
     for tile in player['hand']+([player['drawnTile']] if player['drawnTile'] else []):assert tile['id'] not in html
   for index,tile in enumerate(g['deadWall']):
    if index!=4:assert tile['id'] not in html
   conservation()
  def declaration_boxes():
   values=page.locator('.river-tile').evaluate_all('els=>els.map(e=>{const c=e.getBoundingClientRect(),s=e.querySelector("svg").getBoundingClientRect();return {seat:e.parentElement.dataset.playerId,declaration:e.dataset.riichiDeclaration,cell:{x:c.x,y:c.y,w:c.width,h:c.height},svg:{x:s.x,y:s.y,w:s.width,h:s.height},transform:getComputedStyle(e.querySelector("svg")).transform}})')
   declared=[v for v in values if v['declaration']=='true'];assert len(declared)==4
   for v in declared:
    c,s=v['cell'],v['svg'];assert s['x']>=c['x']-.05 and s['y']>=c['y']-.05 and s['x']+s['w']<=c['x']+c['w']+.05 and s['y']+s['h']<=c['y']+c['h']+.05,v
    for other in values:
     if other==v:continue
     r=other['svg'];assert min(s['x']+s['w'],r['x']+r['w'])-max(s['x'],r['x'])<=.05 or min(s['y']+s['h'],r['y']+r['h'])-max(s['y'],r['y'])<=.05,(v,other)
   for seat in range(4):
    label=page.locator(f'.river[data-player-id="{seat}"] [data-riichi-declaration="true"] svg').get_attribute('aria-label');assert 'リーチ宣言牌' in label
   return declared
  # Real CPU strategy and scheduler: one waited action establishes CPU1/2/3.
  for seat in [1,2,3]:
   page.evaluate(f"stepLoad('cpu',{seat});stepRun();stepRelease()")
   page.wait_for_function(f'stepCheck().game.players[{seat}].riichi!==null')
   assert page.evaluate(f'stepCheck().points[{seat}]')==24000;assert page.evaluate('stepCheck().depositSticks')==1
   assert 'リーチ' in page.locator(f'#label-{seat}').inner_text();assert '24,000点' in page.locator(f'#label-{seat}').inner_text()
   assert page.locator(f'.river[data-player-id="{seat}"] [data-riichi-declaration="true"]').count()==1
   geometry();shot(f'cpu{seat}-established');page.evaluate('stepStop()')
  # CPU1 declaration pending: no sideways marker and no deposit; human ron cancels.
  page.evaluate("stepLoad('pending');stepRun();stepRelease()")
  page.wait_for_function('stepCheck().game.phase==="awaiting-ron"');geometry();shot('cpu-pending')
  assert page.evaluate('stepCheck().game.pendingRiichi.playerId')==1;assert page.evaluate('stepCheck().points[1]')==25000;assert page.evaluate('stepCheck().depositSticks')==0
  assert page.locator('[data-riichi-declaration="true"]').count()==0
  page.locator('#ron').click();assert page.locator('#result-dialog').is_visible();assert page.evaluate('stepCheck().game.players[1].riichi') is None
  assert page.evaluate('stepCheck().lastSettlement.before[1]')==25000;assert page.evaluate('stepCheck().depositSticks')==0;assert '立直' not in page.locator('#win-result').inner_text()
  conservation();shot('human-ron');page.locator('#view-table').click();assert page.locator('[data-riichi-declaration="true"]').count()==0
  # Human pass establishes atomically and resumes the next CPU.
  page.evaluate("stepLoad('pending');stepRun();stepRelease()")
  page.wait_for_function('stepCheck().game.phase==="awaiting-ron"');page.locator('#pass-ron').click()
  page.wait_for_function('stepCheck().game.players[1].riichi!==null');assert page.evaluate('stepCheck().points[1]')==24000;assert page.evaluate('stepCheck().depositSticks')==1
  assert page.evaluate('stepCheck().game.turnPlayerId')==2;assert page.evaluate('stepCheck().game.players[2].drawnTile!==null');assert page.locator('[data-riichi-declaration="true"]').count()==1
  geometry();shot('passed-established');page.evaluate('stepStop()')
  # CPU riichi forced tsumogiri then tsumo: score window and deposit transfer.
  page.evaluate("stepLoad('cpu');stepDeclare()")
  for _ in range(3):page.evaluate('stepDraw();stepDiscard()')
  page.evaluate('stepDraw()');draw=page.evaluate('stepCheck().game.players[1].drawnTile.id');page.evaluate('stepDiscard()')
  assert page.evaluate('stepCheck().game.players[1].river.at(-1).id')==draw
  for _ in range(3):page.evaluate('stepDraw();stepDiscard()')
  page.evaluate('stepDraw();stepTsumo()');assert page.locator('#result-dialog').is_visible();assert 'ダブル立直 2翻' in page.locator('#win-result').inner_text();assert page.evaluate('stepCheck().lastSettlement.deposits.recipientId')==1
  conservation();shot('cpu-riichi-result');before=page.evaluate('JSON.stringify(stepCheck())');page.locator('#view-table').click();shot('cpu-result-table');page.locator('#show-result').click();assert page.evaluate('JSON.stringify(stepCheck())')==before
  # Human riichi pass: permanent furiten survives draw and still permits tsumo.
  page.evaluate("stepLoad('human');stepDeclare();stepDraw();stepDiscard()")
  assert page.locator('#ron').is_enabled();page.locator('#pass-ron').click();page.evaluate('stepStop()')
  assert page.evaluate('stepCheck().game.players[0].riichi.passedRon');geometry();shot('permanent-furiten')
  page.evaluate('stepDiscard();stepDraw();stepDiscard();stepDraw()')
  assert page.evaluate('stepCheck().game.players[0].riichi.passedRon');assert not page.evaluate('stepCheck().game.players[0].temporaryFuriten');assert page.locator('#tsumo').is_disabled()
  assert page.locator('#tsumo').is_disabled();page.evaluate('stepDiscard();stepDraw();stepDiscard();stepDraw();stepDiscard()')
  assert page.evaluate('stepCheck().game.phase')=='awaiting-draw';assert page.locator('#ron').is_hidden()
  page.evaluate('stepDraw();stepDiscard();stepDraw()');assert page.locator('#tsumo').is_enabled()
  geometry();shot('furiten-tsumo-available');page.locator('#tsumo').click();assert page.locator('#result-dialog').is_visible();conservation()
  for winners in [[2],[2,3],[0,2,3]]:
   page.evaluate('stepMulti('+json.dumps(winners)+')')
   if 0 in winners:page.locator('#ron').click()
   assert page.locator('#result-dialog').is_visible()
   for winner in winners:assert '立直 1翻' in page.locator(f'#win-result [data-winner-id="{winner}"]').inner_text()
   assert page.evaluate('stepCheck().lastSettlement.deposits.recipientId')==2
   conservation();shot('riichi-ron-'+str(len(winners)))
  # All four seat coordinate systems at every requested row boundary.
  row_measurements=[]
  for position in [1,6,7,12,13]:
   page.evaluate(f'stepRows({position})');geometry();row_measurements.append({'position':position,'declarations':declaration_boxes()});shot(f'four-rivers-position-{position}')
  # Next-round/reset UI clears state, preserves layout and balances.
  page.evaluate("stepLoad('cpu');stepDeclare()")
  for _ in range(3):page.evaluate('stepDraw();stepDiscard()')
  page.evaluate('stepDraw();stepDiscard()')
  for _ in range(3):page.evaluate('stepDraw();stepDiscard()')
  page.evaluate('stepDraw();stepTsumo()');page.locator('#next-round').click();page.evaluate('stepStop()');assert page.evaluate('stepCheck().game.players.every(p=>p.riichi===null)');assert page.evaluate('stepCheck().game.pendingRiichi') is None;conservation()
  page.locator('#new-game').click();page.locator('#confirm-new-game').click();assert page.evaluate('stepCheck().points')==[25000]*4;assert page.evaluate('stepCheck().depositSticks')==0;geometry()
  assert not errors,errors
  reports.append({'width':width,'height':height,'result':'passed','screenshots':shot_states,'actionMeasurements':measurements,'riverMeasurements':row_measurements,'checks':['CPU1-3-auto-riichi','pending-no-deposit','human-ron-no-deposit','pass-establish-and-resume','CPU-tsumogiri','CPU-riichi-tsumo-result','CPU-riichi-ron-double-triple-result','permanent-furiten','furiten-tsumo','four-seat-row-boundaries','svg-contained-no-overlap','accessibility','points-conservation','CPU-and-dead-wall-private','one-row-hand','fixed-equal-44px-controls-colors','dora-3+2','next-round','result-table-toggle','reset','no-horizontal-scroll']})
  print(f'{width}x{height}: passed',flush=True);page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
