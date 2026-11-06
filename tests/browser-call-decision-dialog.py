"""Call decision dialog fit, controls, and unchanged table geometry regressions.

Run against npm run dev -- --host 127.0.0.1 --port 4173. WebKit automation is
not a substitute for testing iPhone Safari hardware.
"""
import os
import shutil

from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture


browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
with sync_playwright() as p:
    browser_type = getattr(p, browser_name)
    launch = {'args': ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter']} if browser_name == 'chromium' else {}
    if browser_name == 'chromium':
        launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
    browser = browser_type.launch(**launch)
    page = browser.new_page(viewport={'width': 375, 'height': 634}, has_touch=True, is_mobile=browser_name != 'webkit')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def inject(route):
        response = route.fetch()
        source = """import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
""" + response.text() + """
window.loadCalls=(mode)=>{
 controller.newGame();
 const hands=mode==='one'?{0:['345m','234p','678s','19p','12z']}:
   mode==='two'?{0:['3456m','234p','678s','19p','1z']}:
   mode==='three'?{0:['3467m','234p','678s','19p','1z']}:
   mode==='red'?{0:['4450m','234p','678s','19p','1z']}:
   mode==='max'?{0:['23m','444m','50m','6m','789p','12z']}:
   {0:['445567m','234p','19p','12z']};
 const called=mode==='max'?'man-4':mode==='red'?'man-6':'man-5';
 const game=callStart(3,hands,called);
 controller.match=startMatch(discardTile(game,3,game.players[3].drawnTile.id));render();
};
window.callState=()=>controller.game;
"""
        route.fulfill(response=response, body=fixed_seat_fixture(source))

    page.route('**/src/main.ts', inject)
    page.goto('http://127.0.0.1:4173/heibon-mahjong/')
    page.wait_for_function('typeof loadCalls === "function"')

    def rect(element):
        return element.evaluate('(node)=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}')

    def layout_snapshot():
        return page.evaluate("""()=>Object.fromEntries(['.app-header','#local-score-strip-host','#local-table','#player-hand','.rivers','.center-info']
          .map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,[r.x,r.y,r.width,r.height]]}))""")

    def assert_dialog_fit(expected):
        page.wait_for_function("document.querySelector('#call-decision-dialog').open")
        assert page.locator('#call-options button').count() == expected
        assert page.locator('#pass-calls').is_visible()
        assert page.locator('#call-decision-view-table').is_visible()
        assert page.locator('.call-decision-target .tile-svg').count() == 1
        assert '鳴き対象の捨て牌' in page.locator('.call-decision-target').get_attribute('aria-label')
        assert page.evaluate("""()=>{
          const d=document.querySelector('#call-decision-dialog').getBoundingClientRect();
          const viewport=visualViewport;
          const top=viewport?.offsetTop??0, bottom=top+(viewport?.height??innerHeight);
          const visible=node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=top&&r.bottom<=bottom};
          const candidates=[...document.querySelectorAll('#call-options button')];
          return d.left>=0&&d.right<=innerWidth&&d.top>=top&&d.bottom<=bottom&&
            candidates.every(visible)&&visible(document.querySelector('#pass-calls'))&&
            visible(document.querySelector('#call-decision-view-table'))&&
            candidates.every(button=>[...button.querySelectorAll('.tile-svg')].every(tile=>{const r=tile.getBoundingClientRect();return r.width>=22&&r.height>=31}))&&
            candidates.filter(button=>button.textContent.includes('大明カン')).every(button=>{const b=button.getBoundingClientRect();return [...button.querySelectorAll('.tile-svg')].every(tile=>{const t=tile.getBoundingClientRect();return t.left>=b.left&&t.right<=b.right})})&&
            document.documentElement.scrollWidth<=innerWidth;
        }"""), {'viewport': page.viewport_size, 'dialog': rect(page.locator('#call-decision-dialog'))}
        for selector in ['#call-options button', '#pass-calls', '#call-decision-view-table']:
            box = rect(page.locator(selector).first)
            assert box['height'] >= 44, (selector, box)
            assert box['left'] >= 0 and box['right'] <= page.viewport_size['width'], (selector, box)
        return page.evaluate("""()=>({dialog:(()=>{const r=document.querySelector('#call-decision-dialog').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
          candidates:[...document.querySelectorAll('#call-options button')].map(e=>{const r=e.getBoundingClientRect();return {label:e.firstChild.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height}}),
          pass:(()=>{const r=document.querySelector('#pass-calls').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})(),
          view:(()=>{const r=document.querySelector('#call-decision-view-table').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()})""")

    for width, height in [(375, 634), (375, 667), (320, 568), (375, 568)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate("window.scrollTo(0,0)")
        page.evaluate("loadCalls('max')")
        metrics = assert_dialog_fit(7)
        assert page.locator('#call-options button').filter(has_text='チー').count() == 5
        assert page.locator('#call-options button').filter(has_text='ポン').count() == 1
        assert page.locator('#call-options button').filter(has_text='大明カン').count() == 1
        assert page.evaluate('scrollY') == 0
        print(f'{browser_name} {width}x{height} maximum seven-candidate dialog: {metrics}')

        if width == 375 and height == 634:
            page.keyboard.press('Escape')
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
            assert page.evaluate("callState().phase==='awaiting-call'")
            assert page.locator('#local-game-controls [data-panel-part="return-call-decision"]').is_visible()
            page.locator('#local-game-controls [data-panel-part="return-call-decision"]').click()
            assert page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

        page.locator('#call-decision-view-table').click()
        assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
        assert page.evaluate("callState().phase==='awaiting-call'")
        reopen = page.locator('#local-game-controls [data-panel-part="return-call-decision"]')
        assert reopen.is_visible()
        assert reopen.is_enabled(), 'the table-return button was not enabled'
        page.wait_for_function("document.activeElement===document.querySelector('#local-game-controls [data-panel-part=return-call-decision]')")
        before = layout_snapshot()
        rb = rect(reopen)
        assert rb['height'] >= 44 and rb['top'] >= 0 and rb['bottom'] <= height, rb
        assert page.evaluate("""()=>{
          const b=document.querySelector('#local-game-controls [data-panel-part="return-call-decision"]').getBoundingClientRect();
          const table=document.querySelector('#local-table').getBoundingClientRect();
          return b.top>=table.bottom;
        }"""), {'button': rb, 'table': rect(page.locator('#local-table'))}
        reopen.click()
        assert page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
        assert page.locator('#call-options button').count() == 7
        assert layout_snapshot() == before, {'before': before, 'after': layout_snapshot()}
        page.locator('#pass-calls').click()
        page.wait_for_function("callState().phase!=='awaiting-call'")
        assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
        assert page.locator('#local-game-controls [data-panel-part="return-call-decision"]').is_hidden()
        page.wait_for_function("document.activeElement===document.querySelector('#local-game-controls [data-panel-part=action-status]')")

        for mode, count in [('one', 1), ('three', 3), ('mixed', 3), ('red', 2)]:
            page.evaluate(f"loadCalls('{mode}')")
            assert_dialog_fit(count)
            page.locator('#call-options button').first.click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
            assert page.locator('[data-panel-part="return-call-decision"]').is_hidden()
            page.wait_for_function("document.activeElement===document.querySelector('#local-game-controls [data-panel-part=action-status]')")
        assert not errors, errors
    page.close()
    browser.close()
