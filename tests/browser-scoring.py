"""Step 11: score display and result-only geometry with actual fixed walls."""
import argparse, json, pathlib, re, shutil
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4173/heibon-mahjong/')
parser.add_argument('--screenshots',default='docs/screenshots/ui-step11/scoring')
args=parser.parse_args()
out=pathlib.Path(args.screenshots);out.mkdir(parents=True,exist_ok=True)
scenarios={
 'pinfu-parent':(20,'normal',2100), 'pinfu-child':(20,'normal',1500),
 'seven-pairs':(25,'normal',4800), 'triplets':(30,'normal',3000),
 'shanpon-tsumo':(30,'normal',3000), 'shanpon-ron':(40,'normal',1300),
 'mangan-parent':(20,'mangan',12000), 'mangan-child':(20,'mangan',8000),
 'yakuman-parent':(None,'yakuman',48000), 'yakuman-child':(None,'yakuman',32000),
 'ron-child':(30,'normal',3900),'ron-parent':(30,'normal',5800),
 'haneman':(60,'haneman',18000), 'baiman':(60,'baiman',24000), 'sanbaiman':(60,'sanbaiman',36000),
 'seven-pairs-ron':(25,'normal',1600),
 'double':(30,'normal',3900),'triple':(30,'normal',3900),
}
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800)]:
  for name,(fu,tier,points) in scenarios.items():
   page=browser.new_page(viewport={'width':width,'height':height});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   def inject(route):
    response=route.fetch();source,count=re.subn(r'new GameController\((?:undefined|void 0),',f'new GameController(() => starts++ === 0 ? scoringGame("{name}") : scoringGame("reset"),',response.text());assert count==1
    source='import { scoringGame } from "/heibon-mahjong/tests/scoring-fixture.ts"; let starts=0;\n'+source
    source+='\nwindow.scoreCheck = () => controller.game;'
    route.fulfill(response=response,body=source)
   page.route('**/src/main.ts',inject);page.goto(args.url)
   page.wait_for_function('typeof scoreCheck === "function"')
   original=page.evaluate('scoreCheck()')
   river_height=page.locator('.river-top').bounding_box()['height'];indicator=page.locator('#dora-indicators').inner_html()
   if original['phase']!='won':
    button='#ron' if original['phase']=='awaiting-ron' else '#tsumo'
    assert page.locator(button).is_enabled();page.locator(button).click()
   game=page.evaluate('scoreCheck()');win=game['winResult'];results=win.get('winners',[win])
   expected_count=3 if name=='triple' else 2 if name=='double' else 1
   assert len(results)==expected_count
   assert page.locator('.winner-result').count()==expected_count
   assert game['phase']=='won'
   for result in results:
    assert (result['fu'],result['scoreTier'],result['totalPoints'])==(fu,tier,points),(name,result)
    assert sum(pay['points'] for pay in result['payments'])==points
    section=page.locator(f'.winner-result[data-winner-id="{result["winnerId"]}"]')
    text=section.inner_text();assert f'{points}点' in text
    assert '支払い：' in text
    assert section.locator('.win-payments li').count()==len(result['payments'])
    for payment in result['payments']:
     assert f'{payment["points"]}点' in section.locator('.win-payments').inner_text()
    if fu is None:
     assert '符：' not in text and section.locator('details').count()==0
     assert '役満' in text and section.locator('.win-bonuses').count()==0
    else:
     assert f'符：{fu}符' in text
     details=section.locator('details');assert details.get_attribute('open') is None
     summary=details.locator('summary');summary.click();assert details.get_attribute('open') is not None
     assert f'切り上げ前：{result["rawFu"]}符' in details.inner_text()
     if result['fuMode'] in ['seven-pairs','pinfu-tsumo']:assert '固定' in details.inner_text()
     else:assert '基本符：20符' in details.inner_text()
     summary.click();assert details.get_attribute('open') is None
     if width in [375,390] and result==results[0]:summary.click()
    # Score and payment text is present in the accessibility tree.
    accessible=section.aria_snapshot();assert f'{points}点' in accessible and '支払い' in accessible
   if name.startswith('mangan'):assert '満貫' in page.locator('.win-score').inner_text()
   if name=='pinfu-child':assert sorted(p['points'] for p in results[0]['payments'])==[400,400,700]
   if name=='mangan-parent':
    assert results[0]['doraHan']==1 and results[0]['redDoraHan']==2
    assert '合計：5翻' in page.locator('#win-result').inner_text()
   # Concealed CPU IDs/faces remain absent except for the winning players.
   html=page.locator('main').inner_html();winners=[r['winnerId'] for r in results]
   for player in game['players'][1:]:
    if player['id'] not in winners:
     for tile in player['hand']:assert tile['id'] not in html
   for tile in game['deadWall']:
    if tile['id']!=game['deadWall'][4]['id']:assert tile['id'] not in html
   assert page.locator('.river-top').bounding_box()['height']==river_height
   assert page.locator('#dora-indicators').inner_html()==indicator
   assert page.locator('.dora-slot').count()==5
   assert page.locator('#dora-indicators').evaluate('el=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==3
   for selector in ['#player-hand','.winning-hand']:
    for hand in page.locator(selector).all():
     boxes=hand.locator('li').evaluate_all('els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}})')
     assert len(set(round(b['y'],1) for b in boxes))==1
     assert all(b['x']>=0 and b['x']+b['w']<=width for b in boxes)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(out/f'{width}-{name}.png'),full_page=True)
   if width in [375,390]:
    page.set_viewport_size({'width':width,'height':height-120})
    page.locator('.win-payments').last.scroll_into_view_if_needed()
    page.locator('#result-body').evaluate('e=>e.scrollTop=e.scrollHeight')
    assert page.locator('#result-body').evaluate('e=>e.scrollTop>0')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out/f'{width}-{name}-short.png'))
   assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
   page.locator('#view-table').click();page.locator('#new-game').click();page.locator('#confirm-new-game').click();assert page.locator('#win-result').is_hidden()
   assert page.evaluate('scoreCheck().winResult===null')
   assert page.locator('#player-hand li').count()==14
   assert not errors,errors
   reports.append({'scenario':name,'viewport':[width,height],'fu':fu,'tier':tier,'totalPoints':points,'winners':expected_count,'shortHeight':height-120 if width in [375,390] else None,'result':'pass'})
   print(json.dumps(reports[-1]),flush=True);page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n')
