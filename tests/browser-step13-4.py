import os
"""Step 13.4 Chromium acceptance: complete legal physical-wall fixtures."""
import json,pathlib,shutil
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture
out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', 'docs/verification/step13.5.2/screenshots')) / 'browser-step13-4';out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {callStart,openWinGame} from '/heibon-mahjong/tests/calls-fixture.ts';
import {getCallOptions,declareCall} from '/heibon-mahjong/src/game/calls.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {declareRon} from '/heibon-mahjong/src/game/ron.ts';
import {declareTsumo} from '/heibon-mahjong/src/game/tsumo.ts';
import {createWall} from '/heibon-mahjong/src/game/wall.ts';
import {tileKindKey} from '/heibon-mahjong/src/model/tile.ts';
"""+response.text()+"""
window.check=()=>controller.match;
window.load=(mode)=>{controller.newGame();let g;
if(mode==='chi')g=callStart(3,{0:['3467m','234p','678s','19p','1z']},'man-5');
else if(mode==='red')g=callStart(3,{0:['450m','234p','678s','19p','12z']},'man-6');
else if(mode==='ron'||mode==='tsumo')g=openWinGame(['345p','678s','222p','66m'],['406m'],mode,'man-4');
else g=callStart(3);
if(!['ron','tsumo'].includes(mode))g=discardTile(g,g.turnPlayerId,g.players[g.turnPlayerId].drawnTile.id);
controller.match=startMatch(g);render();};
window.displayMelds=()=>{controller.newGame();let g=callStart();const pool=createWall();
const take=(key,red=false)=>{const i=pool.findIndex(t=>tileKindKey(t.tile)===key&&t.tile.isRed===red);return pool.splice(i,1)[0];};
const groups=[['man-4','man-5','man-6'],['white','white','white'],['pin-4','pin-5','pin-6'],['sou-7','sou-8','sou-9']];
const melds=groups.map((ks,i)=>{const tiles=ks.map(k=>take(k,k.endsWith('-5')));return {type:i===1?'pon':'chi',tiles,calledTileId:tiles[i%3].id,fromPlayerId:(i+3)%4};});
const players=g.players.map((p,i)=>({...p,melds:[melds[i]],hand:pool.splice(0,10),drawnTile:null,drawnTileSource:null,river:[],discardHistory:[],callDiscard:null}));
const extra=pool.shift();players[0]={...players[0],drawnTile:extra,drawnTileSource:'live-wall'};
g={...g,players,deadWall:pool.splice(-14),liveWall:pool,phase:'awaiting-discard',turnPlayerId:0,ronWindow:null,callsMade:true};controller.match=startMatch(g);render();};
"""
   source=fixed_seat_fixture(source)
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject)
  page.goto('http://127.0.0.1:4173/heibon-mahjong/');page.wait_for_function('typeof load==="function"')
  def geometry(result=False):
   assert page.evaluate('''()=>{const a=document.querySelector('.table').getBoundingClientRect(),b=document.querySelector('#local-game-controls').getBoundingClientRect();return b.top>=a.bottom;}'''), 'controls overlap table'
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal page overflow'
   if result:
    assert page.locator('#result-dialog').is_visible()
    assert page.locator('#result-body').evaluate('e=>e.scrollWidth<=e.clientWidth')
    assert page.locator('#result-body').evaluate('e=>getComputedStyle(e).overflowY==="auto"')
    b=page.locator('#next-round').bounding_box();assert b['y']+b['height']<=height
   else:
    for b in page.locator('#player-hand li').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,w:r.width}})'):
     assert b['x']>=0 and b['x']+b['w']<=width
  def inventory():
   assert page.evaluate('''()=>{const g=check().game;const all=[...g.liveWall,...g.deadWall,...g.players.flatMap(p=>[...p.hand,...p.river,...(p.melds||[]).flatMap(m=>m.tiles),...(p.drawnTile?[p.drawnTile]:[])])];return all.length===136&&new Set(all.map(t=>t.id)).size===136;}''')
  def private():
   snapshot=page.evaluate('({g:check().game,html:document.querySelector("main").innerHTML})');g=snapshot['g'];html=snapshot['html']
   for seat in [1,2,3]:
    for t in g['players'][seat]['hand']:assert t['id'] not in html
   for i,t in enumerate(g['deadWall']):
    if i!=4:assert t['id'] not in html
  for mode in ['chi','red','pon']:
   page.evaluate('load',mode);geometry();inventory();private()
   options=page.locator('#call-options button');assert options.count()==(3 if mode=='chi' else 2 if mode=='red' else 1)
   assert all(options.nth(i).get_attribute('aria-label') for i in range(options.count()))
   assert options.first.bounding_box()['height']>=44
   page.screenshot(path=str(out/f'{width}x{height}-{mode}-options.png'),full_page=True)
   if mode=='red':assert page.locator('#call-options .tile-svg').count()==6
   g=page.evaluate('check().game');called=g['ronWindow']['tileId'];wall=len(g['liveWall'])
   options.last.click();page.wait_for_function('check().game.phase==="awaiting-discard"')
   assert page.evaluate('check().game.players[0].hand.length')==11
   assert page.evaluate('check().game.players[0].drawnTile') is None
   assert page.evaluate('check().game.liveWall.length')==wall
   assert page.locator(f'.river [data-tile-id="{called}"]').count()==0
   assert page.locator('.seat-bottom .open-meld span').count()==3
   geometry();inventory();private()
   page.screenshot(path=str(out/f'{width}x{height}-{mode}-called.png'),full_page=True)
   choices=page.locator('#player-hand button:enabled');assert choices.count()>0
   choices.first.click();page.locator('#discard').click()
   page.wait_for_function('!controllerDummy',timeout=1) if False else None
   page.wait_for_timeout(1300);geometry();inventory();private()
  page.evaluate('displayMelds()');geometry();inventory();private()
  assert page.locator('.seat .open-meld').count()==4
  # Meld boxes stay outside all river rectangles and the controls.
  assert page.evaluate('''()=>{const a=[...document.querySelectorAll('.seat .open-meld')].map(e=>e.getBoundingClientRect());const b=[...document.querySelectorAll('.river,#local-game-controls')].map(e=>e.getBoundingClientRect());return a.every(x=>b.every(y=>x.right<=y.left||x.left>=y.right||x.bottom<=y.top||x.top>=y.bottom));}''')
  page.screenshot(path=str(out/f'{width}x{height}-four-seats.png'),full_page=True)
  for method in ['ron','tsumo']:
   page.evaluate('load',method)
   if method=='ron':page.locator('#ron').click()
   else:page.locator('#tsumo').click()
   geometry(True);inventory()
   assert page.locator('#win-result .result-melds .open-meld').count()==1
   assert '断么九' in page.locator('#win-result').inner_text()
   assert '赤ドラ：1枚' in page.locator('#win-result').inner_text()
   assert page.evaluate('check().points.reduce((a,b)=>a+b,0)+check().depositSticks*1000')==100000
   page.screenshot(path=str(out/f'{width}x{height}-open-{method}.png'),full_page=True)
  assert not errors,errors
  reports.append({'width':width,'height':height,'passed':True,'jsErrors':errors,'scenes':['chi-options','red-choice','pon','after-call-discard-cpu','four-seats','open-ron','open-tsumo']})
  page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
print(json.dumps(reports,ensure_ascii=False))
