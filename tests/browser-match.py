"""Step 12 Chromium checks. Fixtures are injected only by Playwright routes."""
import json,pathlib,re,shutil
from playwright.sync_api import sync_playwright
out=pathlib.Path('docs/screenshots/ui-step12-4');out.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800),(375,547),(390,724)]:
  page=browser.new_page(viewport={'width':width,'height':height});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def inject(route):
   response=route.fetch();source=response.text()
   source+='''
window.matchCheck = () => controller.match;
window.matchRerender = () => render();
window.matchFixture = async (name) => {
 controller.newGame();
 if(name==='ron') { controller.match = startMatch(scoringGame('ron-parent')); }
 if(name==='cpu') { controller.match = startMatch(cpuTsumoStart(1)); }
 if(name==='draw') { controller.match = startMatch(fixedRound(0,[0,2])); }
 if(name==='honba') { controller.match = settleRound({...startMatch(),game:fixedRon(0,[0,2]),honba:1}); }
 if(name==='change') { controller.match = startMatch(fixedRon(0,[1])); }
 if(name==='end') { controller.match = settleRound({...startMatch(),game:fixedRon(3,[0],2),roundNumber:4,dealerId:3,honba:1}); }
 render();
};
'''
   source='''import { startMatch, settleRound } from '/heibon-mahjong/src/game/match.ts';
import { fixedRound, fixedRon } from '/heibon-mahjong/tests/match-fixture.ts';
import { scoringGame } from '/heibon-mahjong/tests/scoring-fixture.ts';
import { cpuTsumoStart } from '/heibon-mahjong/tests/cpu-tsumo-fixture.ts';
'''+source
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject);page.goto('http://127.0.0.1:4173/heibon-mahjong/')
  page.wait_for_function('typeof matchCheck === "function"')
  def modal():
   assert page.locator('#result-dialog').is_visible()
   box=page.locator('#result-dialog').bounding_box()
   assert box['x']>=0 and box['x']+box['width']<=width
   assert box['y']>=12 and box['y']+box['height']<=height-12+1,box
   assert abs(box['y']+box['height']/2-height/2)<=2,box
   assert page.evaluate('document.activeElement.id')=='view-table'
   for selector in ['#view-table','#next-round' if page.evaluate('matchCheck().status')=='round-ended' else '#result-new-game']:
    b=page.locator(selector).bounding_box();assert b['height']>=44 and b['y']>=0 and b['y']+b['height']<=height
   assert page.locator('.result-header #view-table').count()==0
   left=page.locator('#view-table').bounding_box()
   right=page.locator('#next-round' if page.evaluate('matchCheck().status')=='round-ended' else '#result-new-game').bounding_box()
   behind=page.locator('#new-game').bounding_box()
   assert left['x']+left['width']+15<=right['x'] and abs(left['y']-right['y'])<=1
   assert left['y']>=behind['y']+behind['height'] or left['x']+left['width']<=behind['x']
   assert page.locator('.result-footer #view-table').count()==1
   assert page.locator('#result-body').evaluate('e=>e.scrollHeight>e.clientHeight')
   page.locator('#result-body').evaluate('e=>e.scrollTop=e.scrollHeight')
   assert page.locator('#result-body').evaluate('e=>e.scrollTop>0')
   assert page.locator('#view-table').bounding_box()==left
   page.locator('#result-body').evaluate('e=>e.scrollTop=0')
   page.locator('#new-game').evaluate('e=>e.focus()')
   assert page.evaluate('document.activeElement===document.body || document.activeElement.closest("dialog")!==null')
   for _ in range(12):
    page.keyboard.press('Tab');assert page.evaluate('document.activeElement===document.body || document.activeElement.closest("dialog")!==null')
   page.locator('#view-table').focus();page.locator('#result-body').evaluate('e=>e.scrollTop=0')
  def confirmation(trigger, label):
   before=page.evaluate('JSON.stringify(matchCheck())');html=page.locator('#result-body').inner_html()
   page.locator(trigger).click()
   assert page.evaluate('JSON.stringify(matchCheck())')==before
   assert page.locator('#new-game-dialog').is_visible()
   assert page.evaluate('document.activeElement.id')=='cancel-new-game'
   for selector in ['#cancel-new-game','#confirm-new-game']:
    b=page.locator(selector).bounding_box();assert b['height']>=44 and b['x']>=0 and b['x']+b['width']<=width and b['y']>=0 and b['y']+b['height']<=height
   page.screenshot(path=str(out/f'{width}x{height}-{label}-confirmation.png'))
   page.locator('#new-game').evaluate('e=>e.focus()')
   assert page.evaluate('document.activeElement.closest("#new-game-dialog")!==null')
   for _ in range(6):
    page.keyboard.press('Tab');assert page.evaluate('document.activeElement===document.body || document.activeElement.closest("#new-game-dialog")!==null')
   page.locator('#cancel-new-game').click()
   assert page.evaluate('document.activeElement.id')==trigger[1:]
   assert page.evaluate('JSON.stringify(matchCheck())')==before
   assert page.locator('#result-body').inner_html()==html
   page.locator(trigger).click();page.keyboard.press('Escape')
   assert page.evaluate('document.activeElement.id')==trigger[1:]
   assert page.evaluate('JSON.stringify(matchCheck())')==before
  def toggle():
   before=page.evaluate('JSON.stringify(matchCheck())');html=page.locator('#result-body').inner_html()
   table=page.locator('.table').inner_html()
   for _ in range(10):
    page.locator('#view-table').click();assert not page.locator('#result-dialog').is_visible()
    assert page.evaluate('document.activeElement.id')=='show-result'
    b=page.locator('#show-result').bounding_box();assert b['y']>=0 and b['y']+b['height']<=height
    assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
    page.evaluate('matchRerender()');assert not page.locator('#result-dialog').is_visible()
    assert page.locator('.table').inner_html()==table
    page.locator('#show-result').click();assert page.locator('#result-body').inner_html()==html
   page.keyboard.press('Escape');assert page.evaluate('document.activeElement.id')=='show-result'
   page.screenshot(path=str(out/f'{width}x{height}-table.png'))
   page.locator('#show-result').click()
   page.wait_for_timeout(700)
   assert page.evaluate('JSON.stringify(matchCheck())')==before
  def geometry(initial=False):
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
   boxes=page.locator('#player-hand li').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
   assert len(set(round(b['y'],1) for b in boxes))==1
   assert all(b['x']>=0 and b['x']+b['w']<=width for b in boxes)
   assert page.locator('.dora-slot').count()==5
   assert page.locator('#dora-indicators').evaluate('el=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==3
   if initial:
    assert len(boxes)==14
    controls=page.locator('.discard-controls').bounding_box()
    assert all(b['y']+b['h']<=controls['y'] for b in boxes),(width,height,boxes[-1],controls)
    assert all(b['y']>=0 and b['y']+b['h']<=height for b in boxes), (width,height,boxes[-1])
    for selector in ['#discard','#tsumo']:
     b=page.locator(selector).bounding_box();assert b['y']>=0 and b['y']+b['height']<=height,(width,height,selector,b)
    html=page.locator('main').inner_html()
    for player in page.evaluate('matchCheck().game.players.slice(1)'):
     for tile in player['hand']:assert tile['id'] not in html
  match=page.evaluate('matchCheck()');assert match['points']==[25000]*4
  assert '東1局 0本場' in page.locator('#match-info').inner_text()
  for i in range(4):assert '25,000点' in page.locator(f'#label-{i}').inner_text()
  confirmation('#new-game','playing')
  geometry(True);page.screenshot(path=str(out/f'{width}x{height}-initial.png'))
  page.evaluate("matchFixture('ron')");assert page.locator('#ron').is_enabled();page.locator('#ron').click()
  assert page.evaluate('matchCheck().points')==[30800,19200,25000,25000]
  assert '＋5,800点' in page.locator('#match-result').inner_text()
  assert '東1局 1本場' in page.locator('#match-result').inner_text()
  modal();toggle();geometry();page.screenshot(path=str(out/f'{width}x{height}-round-result.png'))
  page.locator('#view-table').click();confirmation('#new-game','round');page.locator('#show-result').click()
  page.locator('#next-round').click();assert not page.locator('#result-dialog').is_visible();assert page.evaluate('scrollY')==0
  assert '東1局 1本場' in page.locator('#match-info').inner_text();assert page.evaluate('matchCheck().points')==[30800,19200,25000,25000]
  geometry(True);page.screenshot(path=str(out/f'{width}x{height}-next-round.png'))
  page.evaluate("matchFixture('change')");page.locator('#next-round').click();page.evaluate('scrollTo(0,0)')
  assert '自分（北）' in page.locator('#label-0').inner_text();assert 'CPU1（東）' in page.locator('#label-1').inner_text()
  page.evaluate("matchFixture('cpu')");page.evaluate('scrollTo(0,0)')
  tile_id=page.evaluate('matchCheck().game.players[0].drawnTile.id')
  page.locator(f'#player-hand button[data-tile-id="{tile_id}"]').click();page.locator('#discard').click()
  page.wait_for_function('matchCheck().status === "round-ended"')
  assert page.evaluate('matchCheck().points')==[21000,33000,23000,23000]
  assert 'CPU1がツモ和了' in page.locator('#selection-status').inner_text()
  page.evaluate("matchFixture('draw')")
  assert page.evaluate('matchCheck().points')==[26500,23500,26500,23500]
  text=page.locator('#match-result').inner_text();assert '流局！' in text and '自分：テンパイ' in text and 'CPU1：ノーテン' in text and '＋1,500点' in text
  modal();toggle();geometry();page.screenshot(path=str(out/f'{width}x{height}-draw.png'))
  page.evaluate("matchFixture('honba')");assert page.evaluate('matchCheck().lastSettlement.payments.reduce((s,p)=>s+p.honbaPoints,0)')==600
  page.evaluate("matchFixture('end')");assert page.evaluate('matchCheck().status')=='match-ended';assert not page.locator('#next-round').is_visible();assert '東風戦終了' in page.locator('#match-result').inner_text()
  ranking=page.evaluate('matchCheck().points.map((points,playerId)=>({points,playerId})).sort((a,b)=>b.points-a.points||a.playerId-b.playerId)')
  for rank,player in enumerate(ranking,1):assert f'{rank}位' in page.locator('#match-result ol').inner_text()
  modal();toggle();geometry();page.screenshot(path=str(out/f'{width}x{height}-match-result.png'))
  confirmation('#result-new-game','match')
  page.locator('#view-table').click();confirmation('#new-game','match-table');page.locator('#show-result').click()
  page.locator('#result-new-game').click();page.locator('#confirm-new-game').click();page.evaluate('scrollTo(0,0)');assert page.evaluate('matchCheck().points')==[25000]*4;assert page.evaluate('matchCheck().lastSettlement') is None
  geometry(True);assert not errors,errors
  reports.append({'width':width,'height':height,'result':'passed','checks':['initial','ron','points','cpu-tsumo','repeat','next-round','dealer-winds','draw','noten','honba-double','final-rank','reset','geometry','dora','cpu-hidden','modal-center','internal-scroll','touch-44','background-inert','focus','escape','toggle-10','state-unchanged','rerender-stays-closed','footer-left-right','header-title-only','no-reset-overlap','footer-fixed','confirm-playing-round-match','cancel-escape-unchanged','confirm-focus-inert','confirmed-reset-only']})
  page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
print(json.dumps(reports,ensure_ascii=False))
