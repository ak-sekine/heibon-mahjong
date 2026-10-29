"""In-flow call UI: no Playwright auto-scroll before visibility assertions.
Chromium viewport resize models browser chrome; physical Safari remains manual.
Run against npm run dev -- --host 127.0.0.1 --port 4173.
"""
import shutil
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

with sync_playwright() as p:
 browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
 for width in [320,375,390,430]:
  page = browser.new_page(viewport={'width':width,'height':844})
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
"""+response.text()+"""
window.loadCalls=(mode)=>{controller.newGame();let g=callStart(3,
 mode==='chi'?{0:['334467m','234p','19p','12z']}:
 mode==='red'?{0:['4450m','234p','678s','19p','1z']}:
 {0:['555m','234p','678s','19p','12z']},mode==='pon'?'red:man-5':mode==='red'?'man-6':'man-5');
 controller.match=startMatch(discardTile(g,3,g.players[3].drawnTile.id));render();};
window.callState=()=>controller.game;
"""
   source=fixed_seat_fixture(source)
   route.fulfill(response=response,body=source)
  page.route('**/src/main.ts',inject)
  page.goto('http://127.0.0.1:4173/heibon-mahjong/')
  page.wait_for_function('typeof loadCalls === "function"')
  def visible():
   page.wait_for_function('''()=>{
    const v=visualViewport;const top=v?.offsetTop??0,bottom=top+(v?.height??innerHeight);
    return [...document.querySelectorAll('#call-options button,#pass-calls')].every(e=>{
     const r=e.getBoundingClientRect();return r.top>=top&&r.bottom<=bottom&&r.left>=0&&r.right<=innerWidth&&r.height>=44;
    });}''')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.evaluate('''()=>document.querySelector('#local-game-controls').getBoundingClientRect().top>=document.querySelector('.table').getBoundingClientRect().bottom''')
  for height in [844,564,448]:
   page.set_viewport_size({'width':width,'height':height})
   for mode,count in [('chi',3),('red',2),('pon',2)]:
    page.evaluate('window.scrollTo(0,0)')
    page.evaluate('loadCalls',mode)
    visible()
    assert page.locator('#call-options button').count()==count
    # Chrome expanding/collapsing while the decision is already open.
    for resized in [height-80,height]:
     page.set_viewport_size({'width':width,'height':resized});visible()
    if mode=='pon':
     page.locator('#pass-calls').click()
     page.wait_for_function('callState().phase!=="awaiting-call"')
    else:
     page.locator('#call-options button').last.click()
     page.wait_for_function('callState().players[0].melds?.length===1')
     assert page.evaluate('callState().players[0].hand.length')==11
  # Keep the layout viewport unchanged while visualViewport shrinks/offsets,
  # modelling Safari chrome independently of CSS viewport units.
  page.set_viewport_size({'width':width,'height':844})
  page.evaluate("""()=>{
   window.nativeViewport=window.visualViewport;
   window.testViewport=new EventTarget();
   Object.assign(testViewport,{height:484,offsetTop:24});
   Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});
  }""")
  page.evaluate('window.scrollTo(0,0);loadCalls("chi")')
  visible()
  for viewport_height,offset in [(404,40),(700,0),(484,24)]:
   page.evaluate("""([height,offsetTop])=>{Object.assign(testViewport,{height,offsetTop});
    nativeViewport.dispatchEvent(new Event('resize'));}""",[viewport_height,offset])
   visible()
  page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>nativeViewport})")
  assert not errors,errors
  page.close()
  print(f'{width}px: candidates/pass visible on entry and viewport resize; no overlap; selection passed')
 browser.close()
