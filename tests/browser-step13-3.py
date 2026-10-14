"""Step 13.3: legal physical walls, result accessibility and hidden-information checks."""
import json,pathlib,shutil
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/screenshots/step13.3');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {riichiStart} from '/heibon-mahjong/tests/riichi-fixture.ts';
import {cpuRiichiStart} from '/heibon-mahjong/tests/cpu-riichi-fixture.ts';
import {ronStart,withRiverTile} from '/heibon-mahjong/tests/ron-fixture.ts';
import {fixedRound} from '/heibon-mahjong/tests/match-fixture.ts';
import {startMatch,updateMatchGame} from '/heibon-mahjong/src/game/match.ts';
import {declareRiichi} from '/heibon-mahjong/src/game/riichi.ts';
import {drawTile} from '/heibon-mahjong/src/game/draw.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {declareRon,passRon} from '/heibon-mahjong/src/game/ron.ts';
import {declareTsumo} from '/heibon-mahjong/src/game/tsumo.ts';
import {tileKindKey} from '/heibon-mahjong/src/model/tile.ts';
"""+response.text()+"""
window.check=()=>controller.match;
window.load=(mode)=>{controller.newGame();let g=mode==='pending'?cpuRiichiStart(1,[0],'sou-5',['123m','456p','789s','22p','46m']):mode==='draw'?fixedRound(0,[0]):mode==='multi'?ronStart(1,[0,2,3]):riichiStart('tsumo');
if(mode==='ordinary')g=withRiverTile(g,0,'white');
if(mode==='ordinary'||mode==='double'){const deadWall=[...g.deadWall],liveWall=[...g.liveWall],i=liveWall.findIndex(t=>tileKindKey(t.tile)==='man-4');[deadWall[5],liveWall[i]]=[liveWall[i],deadWall[5]];g={...g,deadWall,liveWall};}
if(mode==='multi'){const deadWall=[...g.deadWall];[deadWall[4],deadWall[5]]=[deadWall[5],deadWall[4]];g={...g,deadWall};g=withRiverTile(g,0,'north');g={...g,players:g.players.map(p=>p.id===0?{...p,riichi:{declarationTileId:p.river.at(-1).id,ippatsuEligible:true,doubleRiichi:false}}:p)};}
controller.match={...startMatch(g),...(mode==='multi'?{points:[24000,25000,25000,25000],depositSticks:1}:{})};render();};
window.establish=()=>{const g=controller.game;controller.match=declareRiichi(controller.match,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile.id);render();};
window.move=()=>{let g=drawTile(controller.game,controller.game.turnPlayerId);g=discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile.id);controller.match=updateMatchGame(controller.match,g);render();};
window.draw=()=>{controller.game=drawTile(controller.game,controller.game.turnPlayerId);render();};
window.win=()=>{controller.game=declareTsumo(controller.game,0);render();};
window.multi=()=>{let g=controller.game;g=discardTile(g,1,g.players[1].drawnTile.id);controller.game=declareRon(g,0);render();};
window.pass=()=>{controller.match=updateMatchGame(controller.match,passRon(controller.game,0));render();};
window.finishDraw=()=>{controller.match=updateMatchGame(controller.match,controller.game);render();};
"""
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:4173/heibon-mahjong/');page.wait_for_function('typeof check==="function"')
  results=[]
  def conservation():assert page.evaluate('check().points.reduce((a,b)=>a+b,0)+check().depositSticks*1000')==100000
  def private():
   g=page.evaluate('check().game');html=page.locator('main').inner_html()
   for index,t in enumerate(g['deadWall']):
    if index!=4:assert t['id'] not in html
   assert page.locator('.ura-dora-result').count()==0
   assert '裏ドラ表示牌' not in page.locator('main').inner_text()
  def geometry(result=False):
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('.dora-slot').count()==5
   assert page.locator('#dora-indicators').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==3
   if result:
    assert page.locator('#result-dialog').is_visible()
    assert page.locator('#result-body').evaluate('e=>["auto","scroll"].includes(getComputedStyle(e).overflowY)')
    for selector in ['#view-table','#next-round']:
     if page.locator(selector).is_visible():
      b=page.locator(selector).bounding_box();assert b['y']>=0 and b['y']+b['height']<=height
    for b in page.locator('.ura-dora-result svg').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,w:r.width}})'):
     assert b['x']>=0 and b['x']+b['w']<=width
    assert page.locator('#result-body').evaluate('e=>e.scrollWidth<=e.clientWidth')
   else:
    boxes=page.locator('#player-hand li').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}})')
    if len(boxes)==14:assert len(set(round(b['y'],1) for b in boxes))==1
    controls=page.locator('#discard,#riichi,#tsumo').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}})')
    if not page.locator('#ron').is_visible() and not page.locator('#show-result').is_visible():assert all(c['h']==44 for c in controls) and max(c['w'] for c in controls)-min(c['w'] for c in controls)<.1
   conservation()
  def shot(name):page.screenshot(path=str(out/f'{width}x{height}-{name}.png'))
  for mode in ['ordinary','double']:
   page.evaluate(f'load("{mode}")');private();geometry();page.evaluate('establish()');private();geometry();shot(mode+'-established')
   assert page.evaluate('check().game.players[0].riichi.ippatsuEligible')
   for _ in range(3):page.evaluate('move()');private()
   page.evaluate('draw()');private();geometry();assert page.evaluate('check().game.players[0].riichi.ippatsuEligible')
   page.evaluate('win()');geometry(True);text=page.locator('#win-result').inner_text()
   assert ('立直 1翻' if mode=='ordinary' else 'ダブル立直 2翻') in text
   if mode=='double':assert '立直 1翻' not in text
   for term in ['一発 1翻','門前清自摸和 1翻','通常ドラ：','裏ドラ：1枚（1翻）','赤ドラ：1枚（1翻）','合計：','獲得点数：','支払い：']:assert term in text,term
   assert page.locator('.ura-dora-result svg').count()==1
   assert '裏ドラ表示牌' in page.locator('.ura-dora-result svg').get_attribute('aria-label')
   assert '裏ドラ：' in page.locator('.ura-dora-result').inner_text()
   r=page.evaluate('check().game.winResult');results.append({'mode':mode,'yakuHan':r['yakuHan'],'dora':r['doraCount'],'ura':r['uraDoraCount'],'red':r['redDoraCount'],'totalHan':r['totalHanIncludingDora'],'points':r['totalPoints'],'payments':r['payments'],'scroll':page.locator('#result-body').evaluate('e=>({client:e.clientHeight,scroll:e.scrollHeight})')})
   shot(mode+'-result');page.locator('.ura-dora-result').scroll_into_view_if_needed();geometry(True);shot(mode+'-ura');page.locator('#result-body').evaluate('e=>e.scrollTop=e.scrollHeight');geometry(True);shot(mode+'-result-bottom')
   before=page.evaluate('JSON.stringify(check())');page.locator('#view-table').click()
   assert page.locator('#dora-indicators').locator('svg').count()==1
   assert '裏ドラ' not in page.locator('#dora-indicators').inner_text();geometry();shot(mode+'-table')
   page.locator('#show-result').click();assert page.evaluate('JSON.stringify(check())')==before
  page.evaluate('load("multi");multi()');geometry(True)
  assert page.evaluate('check().game.winResult.winners.find(w=>w.winnerId===0).uraDoraCount')==1
  assert page.evaluate('check().game.winResult.winners.filter(w=>w.winnerId!==0).every(w=>w.uraDoraCount===0)')
  for id in [0,2,3]:assert page.locator(f'.winner-result[data-winner-id="{id}"] .ura-dora-result').count()==(1 if id==0 else 0)
  results.append({'mode':'mixed-triple-ron','winners':page.evaluate('check().game.winResult.winners.map(w=>({id:w.winnerId,ura:w.uraDoraCount,han:w.totalHanIncludingDora,points:w.totalPoints}))')});shot('mixed-triple-ron')
  page.evaluate('load("pending");establish()');private();assert page.evaluate('check().game.players[1].riichi') is None;shot('pending')
  # Resolve directly to avoid scheduling CPU tasks in these deterministic checks.
  page.evaluate('pass()');private();assert page.evaluate('check().game.players[1].riichi.ippatsuEligible');assert page.evaluate('check().game.players[1].riichi.doubleRiichi');conservation()
  page.evaluate('load("pending");establish()');page.locator('#ron').click();geometry(True);assert page.locator('.ura-dora-result').count()==0;assert page.evaluate('check().game.players[1].riichi') is None;shot('declaration-ron')
  page.evaluate('load("draw");finishDraw()');geometry(True);assert page.locator('.ura-dora-result').count()==0;shot('draw')
  assert not errors,errors
  reports.append({'width':width,'height':height,'result':'passed','results':results,'checks':['ordinary/double/ippatsu-yaku','bonuses-and-payments','ura-svg-accessibility','pending/pass/declaration-ron','mixed-triple-ron','draw-private','private-live-DOM','result-scroll/buttons/width','one-row-hand/equal-44px-controls','dora-3+2','view-table-central-private','100000-point-conservation'],'errors':errors});print(f'{width}x{height}: passed',flush=True);page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
