import os
"""Kan acceptance using full 136-tile fixtures, routed only in the test browser."""
import json,pathlib,shutil,re
from playwright.sync_api import sync_playwright
out=pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', 'docs/verification/step13.5.2/screenshots')) / 'browser-step13-5';out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724),(430,844)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {ronGame} from '/heibon-mahjong/tests/ron-fixture.ts';
import {kanGame,ankanGame,kakanGame} from '/heibon-mahjong/tests/kan-fixture.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {declareKan,getKanOptions} from '/heibon-mahjong/src/game/kan.ts';
"""+response.text()+"""
window.kanCheck=()=>controller.match;
window.startRobbery=()=>{controller.game=declareKan(controller.game,controller.game.turnPlayerId,getKanOptions(controller.game,controller.game.turnPlayerId)[0].id);render();};
window.loadKan=(mode)=>{controller.newGame();let g;
if(mode==='ron')g=ronGame(1,[0]);
if(mode==='ankan')g=ankanGame();
if(mode==='kakan')g=kakanGame();
if(mode==='choices')g=kanGame({hands:{0:['1111z','5550m','234p','67s']},draw:'sou-8',rinshan:['west']});
if(mode==='daiminkan'){g=kanGame({hands:{0:['111z','234m','456p','678s','2z']},turn:3,draw:'east',rinshan:['south']});g=discardTile(g,3,g.players[3].drawnTile.id);}
if(mode.startsWith('robbery')){const id=Number(mode.at(-1))||1;g=kanGame({turn:id,draw:'man-1',melds:{[id]:[{type:'pon',group:'111m'}]},hands:{[id]:['234p','678s','22z','45s'],0:['23m','456p','789s','333z','66s']}});}
if(mode==='seats')g=kanGame({hands:{0:['234m','456p','678s','2z']},draw:'south',melds:{0:[{type:'ankan',group:'1111z'}],1:[{type:'daiminkan',group:'3333z'}],2:[{type:'kakan',group:'4444z'}],3:[{type:'ankan',group:'5555z'}]}});
if(mode==='seats')g={...g,phase:'wall-exhausted',abortiveDraw:'four-kans'};
controller.match=startMatch(g);render();};
"""
   source,count=re.subn(r'new GameController\((?:undefined|void 0), \{ onChange: render \}\)', 'new GameController(undefined, { onChange: render, wait: (_ms,signal)=>new Promise(resolve=>signal.addEventListener("abort",resolve,{once:true})) })',source)
   assert count==1
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:4173/heibon-mahjong/');page.wait_for_function('typeof loadKan === "function"')
  def shot(name):page.screenshot(path=str(out/f'{width}x{height}-{name}.png'),full_page=True)
  def check():
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.evaluate('kanCheck().points.reduce((a,b)=>a+b,0)+kanCheck().depositSticks*1000')==100000
   assert page.evaluate("(()=>{const s=kanCheck().game;const tiles=[...s.liveWall,...s.deadWall,...s.players.flatMap(p=>[...p.hand,...p.river,...p.melds.flatMap(m=>m.tiles),...(p.drawnTile?[p.drawnTile]:[])])];return tiles.length===136&&new Set(tiles.map(t=>t.id)).size===136;})()")
   assert page.evaluate("document.querySelector('.discard-controls').getBoundingClientRect().top>=document.querySelector('.table').getBoundingClientRect().bottom")
   if page.evaluate('kanCheck().game.phase')!='won':
    html=page.locator('main').inner_html()
    for player in page.evaluate('kanCheck().game.players.slice(1)'):
     for tile in player['hand']: assert tile['id'] not in html
    state=page.evaluate('kanCheck().game')
    for i,t in enumerate(state['deadWall']):
     if i in [5,7,9,11,13] or i>4+2*state['kanCount']:assert t['id'] not in html
   for sel in ['#kan','#kan-options button','#cancel-kan','#call-options button','#ron','#pass-ron']:
    for e in page.locator(sel).all():
     if e.is_visible():assert e.bounding_box()['height']>=44 and e.bounding_box()['width']>=44
  page.evaluate("loadKan('choices')");page.locator('#kan').click();assert page.locator('#kan-options button').count()==2;check();shot('choices')
  page.locator('#cancel-kan').click();assert page.locator('#kan-controls').is_hidden();assert page.evaluate('kanCheck().game.kanCount')==0
  page.locator('#kan').click();page.locator('#kan-options button').filter(has_text='暗カン').last.click();check();assert page.evaluate('kanCheck().game.kanCount')==1
  # Discard after rinshan without winning, using actual selection controls.
  tile=page.evaluate('kanCheck().game.players[0].drawnTile.id');page.locator(f'#player-hand button[data-tile-id="{tile}"]').click();page.locator('#discard').click();assert page.evaluate('kanCheck().game.players[0].drawnTile') is None
  for mode,kind in [('ankan','ankan'),('kakan','kakan'),('daiminkan','daiminkan')]:
   page.evaluate('loadKan',mode)
   if mode=='daiminkan':page.locator('#call-options button').filter(has_text='大明カン').click()
   else:page.locator('#kan').click();page.locator('#kan-options button').click()
   assert page.evaluate('kanCheck().game.players[0].melds[0].type')==kind
   assert page.evaluate('kanCheck().game.players[0].drawnTileSource')=='rinshan';check();shot(mode)
   assert page.locator('.dora-slot[data-tile-id]').count()==2
   if mode=='ankan':assert page.locator('.concealed-kan-back').count()==2
   if mode=='kakan':assert page.locator('.added-kan-tile').count()==1
   page.locator('#tsumo').click();text=page.locator('#win-result').inner_text();assert '嶺上開花 1翻' in text,text;check();shot(mode+'-result')
   assert page.locator('.result-dora-slot').count()>=5
   assert page.locator('#result-body').evaluate('e=>e.scrollHeight>=e.clientHeight')
   page.locator('#next-round').click();assert page.evaluate('kanCheck().game.kanCount')==0
  page.evaluate("loadKan('ron')");assert page.locator('#ron-target svg').count()==1
  assert page.locator('#ron-target svg').get_attribute('aria-hidden')=='true'
  assert page.locator('#ron-status').inner_text()=='CPU1が赤5索を捨てました'
  assert page.locator('#ron-target svg title').text_content()=='赤5索'
  check();shot('normal-ron');page.locator('#pass-ron').click();assert page.locator('#ron-target svg').count()==0
  page.evaluate("loadKan('ron')");page.locator('#ron').click();assert page.evaluate('kanCheck().game.phase')=='won'
  page.locator('#view-table').click()
  page.evaluate("loadKan('robbery');startRobbery()");assert page.locator('#ron').is_enabled();assert page.locator('#ron-target svg').count()==1;assert page.locator('.pending-kan-tile svg').count()==1;check();shot('chankan-pending')
  page.locator('#pass-ron').click();assert page.evaluate('kanCheck().game.players[1].melds[0].type')=='kakan'
  page.evaluate("loadKan('robbery');startRobbery()");page.locator('#ron').click();assert '槍槓 1翻' in page.locator('#win-result').inner_text();check();shot('chankan-result')
  page.locator('#view-table').click()
  for seat in [2,3]:
   page.evaluate(f"loadKan('robbery{seat}');startRobbery()")
   preview=page.locator('.pending-kan-tile');box=preview.bounding_box();seatbox=preview.locator('xpath=ancestor::*[contains(@class,"seat-")]').first.bounding_box()
   assert box['x']>=seatbox['x']-1 and box['x']+box['width']<=seatbox['x']+seatbox['width']+1
   check();shot(f'chankan-seat{seat}')
   page.locator('#pass-ron').click();assert page.locator('.pending-kan-tile').count()==0
  page.evaluate("loadKan('seats')");page.locator('#view-table').click();check();assert page.locator('.open-meld').count()==4;assert page.locator('.dora-slot[data-tile-id]').count()==5;shot('four-seats')
  page.evaluate("loadKan('choices')");page.locator('#kan').click()
  page.evaluate("""()=>{window.nativeViewport=window.visualViewport;window.testViewport=new EventTarget();Object.assign(testViewport,{height:380,offsetTop:24});Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});nativeViewport.dispatchEvent(new Event('resize'));}""")
  page.wait_for_function("""()=>{const v=visualViewport;return [...document.querySelectorAll('#kan-options button,#cancel-kan')].every(e=>{const r=e.getBoundingClientRect();return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height;});}""")
  check();shot('visual-viewport');page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>nativeViewport})")
  assert not errors,errors
  reports.append({'width':width,'height':height,'passed':True,'jsErrors':errors});print(f'{width}x{height}: passed',flush=True);page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
