"""Call choices and Safari visual viewport regressions.

Run against npm run dev -- --host 127.0.0.1 --port 4173. Select chromium or
webkit with HEIBON_BROWSER. WebKit automation is not iPhone Safari hardware.
"""
import os
import shutil
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
 browser_type = getattr(p, browser_name)
 launch = {'args': ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter']} if browser_name == 'chromium' else {}
 if browser_name == 'chromium': launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
 browser = browser_type.launch(**launch)
 for width in [320,375,390,430,844]:
  page = browser.new_page(viewport={'width':width,'height':844}, has_touch=True, is_mobile=True)
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def inject(route):
   response=route.fetch()
   source="""import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {ronGame} from '/heibon-mahjong/tests/ron-fixture.ts';
import {ankanGame} from '/heibon-mahjong/tests/kan-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
"""+response.text()+"""
window.loadCalls=(mode)=>{controller.newGame();let g=callStart(3,
 mode==='chi'?{0:['445567m','234p','19p','12z']}:
 mode==='red'?{0:['4450m','234p','678s','19p','1z']}:
 {0:['555m','234p','678s','19p','12z']},mode==='pon'?'red:man-5':mode==='red'?'man-6':'man-5');
window.callState=()=>controller.game;
controller.match=startMatch(discardTile(g,3,g.players[3].drawnTile.id));render();};
window.loadRon=()=>{controller.newGame();controller.match=startMatch(ronGame(3,[0]));render();};
window.loadKan=()=>{controller.newGame();controller.match=startMatch(ankanGame());render();};
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
  def load_call(height=844):
   page.set_viewport_size({'width':width,'height':height})
   page.evaluate("document.querySelector('#call-controls').hidden=true")
   page.wait_for_function("document.querySelector('#call-controls').hidden")
   page.evaluate('window.scrollTo(0,0);loadCalls("chi")')
   visible()
   assert page.locator('#call-options button').count()==3
   labels=page.locator('#call-options button').evaluate_all('buttons=>buttons.map(button=>button.dataset.diagnosticActionType)')
   assert labels.count('chi')==2 and labels.count('pon')==1,labels
  for height in [844,564,448]:
   load_call(height)
   # A user scroll followed by Safari visual viewport changes must retain the
   # chosen position; resizing does not run another scroll correction.
   page.evaluate('''()=>{
    window.scrollTo(0,0);
    const v=visualViewport;
    v?.dispatchEvent(new Event('scroll'));
    v?.dispatchEvent(new Event('resize'));
   }''')
   page.wait_for_timeout(50)
   assert page.evaluate('scrollY')==0
   # Confirm that the controls remain in normal flow and can be reached by
   # ordinary user scrolling after viewport events.
   page.locator('#pass-calls').scroll_into_view_if_needed()
   assert page.locator('#pass-calls').is_enabled()

  if width==375:
   for chi_index in [0,1]:
    load_call(844)
    page.locator('#call-options button').filter(has_text='チー').nth(chi_index).click()
    page.wait_for_function('callState().players[0].melds?.length===1')
    assert page.evaluate('callState().players[0].melds[0].type')=='chi'
    assert page.evaluate('callState().phase')=='awaiting-discard'
    if chi_index==0:
     page.wait_for_timeout(250)
     trace=page.evaluate('''()=>{
      const entries=JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]');
      const click=[...entries].reverse().find(e=>e.event==='action_panel_click_received'&&e.details.actionType==='chi');
      const success=entries.find(e=>e.event==='local_action_state_update_succeeded'&&e.details.operationId===click?.details.operationId);
      const rendered=entries.find(e=>e.event==='local_game_render_succeeded'&&e.details.operationId===click?.details.operationId);
      return {click,success,rendered,serialized:JSON.stringify(entries)};
     }''')
     assert trace['click'] and trace['success'] and trace['rendered'],trace
     assert trace['click']['details']['candidateId'].startswith('call-')
     assert 'man-' not in trace['serialized'] and 'sou-' not in trace['serialized']
   load_call(844)
   page.locator('#call-options button').filter(has_text='ポン').click()
   page.wait_for_function('callState().players[0].melds?.length===1')
   assert page.evaluate('callState().players[0].melds[0].type')=='pon'
   assert page.evaluate('callState().phase')=='awaiting-discard'
   load_call(844)
   page.locator('#pass-calls').click()
   page.wait_for_function('callState().phase!=="awaiting-call"')
   assert page.evaluate('callState().players[0].melds?.length??0')==0
   assert page.evaluate('callState().phase')!='awaiting-call'

   page.evaluate('window.scrollTo(0,0);loadRon()')
   page.wait_for_function("!document.querySelector('#ron-controls').hidden")
   assert page.locator('#ron').is_enabled() and page.locator('#pass-ron').is_enabled()
   page.evaluate('''()=>{
     window.scrollTo(0,0);visualViewport?.dispatchEvent(new Event('scroll'));visualViewport?.dispatchEvent(new Event('resize'));
   }''')
   assert page.evaluate('scrollY')==0
   page.locator('#pass-ron').click()
   page.wait_for_function("callState().phase==='awaiting-call'")

   page.evaluate('window.scrollTo(0,0);loadKan()')
   page.wait_for_function("!document.querySelector('#kan').hidden")
   page.locator('#kan').click()
   page.wait_for_function("!document.querySelector('#kan-controls').hidden")
   assert page.locator('#kan-options button').count()==1
   page.evaluate('''()=>{
     window.scrollTo(0,0);visualViewport?.dispatchEvent(new Event('scroll'));visualViewport?.dispatchEvent(new Event('resize'));
   }''')
   assert page.evaluate('scrollY')==0
   page.locator('#cancel-kan').click()
   assert page.locator('#kan-controls').is_hidden()

   # A touch gesture already in progress, and its immediate release window,
   # suppress the one-time correction when a panel becomes visible.
   page.set_viewport_size({'width':width,'height':448})
   page.evaluate('''()=>{
     const event=(name,touches)=>{const e=new Event(name);Object.defineProperty(e,'touches',{value:touches});window.dispatchEvent(e);};
     event('touchstart',[{clientX:10,clientY:200}]);
     loadCalls('chi');
     event('touchmove',[{clientX:10,clientY:130}]);
     event('touchend',[]);
   }''')
   page.wait_for_timeout(250)
   assert page.evaluate('''()=>{
     const entries=JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]');
     return entries.some(e=>e.event==='call_viewport_correction_suppressed'&&e.details.reason==='recent_manual_scroll');
   }''')
   assert page.locator('#call-options button').count()==3
   # Simulate address bar expansion/collapse while the viewport origin remains
   # unchanged. The panel remains scrollable and resize never forces a return.
   page.evaluate('''()=>{
     window.scrollTo(0,0);
     window.nativeViewport=visualViewport;
     window.testViewport=new EventTarget();Object.assign(testViewport,{height:404,offsetTop:24});
     Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>testViewport});
     for(const [height,offset] of [[404,24],[700,0],[484,24]]){
       Object.assign(testViewport,{height,offsetTop:offset});
       testViewport.dispatchEvent(new Event('resize'));
       testViewport.dispatchEvent(new Event('scroll'));
     }
   }''')
   page.wait_for_timeout(50)
   assert page.evaluate('scrollY')==0
   # A final fresh display performs the needed one-time alignment.
   page.evaluate("document.querySelector('#call-controls').hidden=true")
   page.wait_for_function("document.querySelector('#call-controls').hidden")
   page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>nativeViewport});window.scrollTo(0,0);loadCalls('chi')")
   visible()
   assert page.evaluate('''()=>{
     const entries=JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2')||'[]');
     return entries.some(e=>e.event==='call_viewport_correction_applied') || entries.some(e=>e.event==='call_viewport_correction_suppressed'&&e.details.reason==='already_in_viewport');
   }''')
  assert not errors,errors
  page.close()
  print(f'{browser_name} {width}px: two chi plus pon, each choice, pass, transition, manual scroll, viewport, correction passed')
 browser.close()
