"""Type-specific call buttons, filtered dialogs, and compact layout regression.

Run against npm run dev -- --host 127.0.0.1 --port 4173.
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
   mode==='pon-red'?{0:['550m','234p','678s','9p','123z']}:
   mode==='max'?{0:['23m','444m','50m','6m','789p','12z']}:
   {0:['445567m','234p','19p','12z']};
 const called=mode==='max'?'man-4':mode==='red'?'man-6':'man-5';
 const game=callStart(3,hands,called);
 controller.match=startMatch(discardTile(game,3,game.players[3].drawnTile.id));render();
};
window.callState=()=>controller.game;
window.loadTurn=()=>{
 controller.newGame();
 const game=callStart(3,{0:['55z','234m','456p','678s','19p']},'white');
 controller.match=startMatch(game);render();
};
"""
        route.fulfill(response=response, body=fixed_seat_fixture(source))

    page.route('**/src/main.ts', inject)
    page.goto('http://127.0.0.1:4173/heibon-mahjong/')
    page.wait_for_function('typeof loadCalls === "function"')

    def rect(element):
        return element.evaluate('(node)=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}')

    def layout_snapshot():
        return page.evaluate("""()=>Object.fromEntries(['.app-header','#local-table-summary','.score-strip','#local-table','#player-hand','.rivers','.center-info']
          .map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,[r.x,r.y,r.width,r.height]]}))""")

    def assert_type_buttons():
        page.wait_for_function("!document.querySelector('#call-decision-dialog').open")
        assert page.locator('#call-controls').is_visible()
        assert page.locator('#call-pon').is_visible()
        assert page.locator('#call-chi').is_visible()
        assert page.locator('#call-kan').is_visible()
        assert page.locator('#pass-calls').is_visible()
        assert page.locator('#call-options button').count() == 0, 'candidates were rendered before a type was selected'
        boxes = [rect(page.locator(selector)) for selector in ['#call-pon','#call-kan','#call-chi','#pass-calls']]
        for box in boxes:
            assert box['width'] >= 44 and box['height'] >= 44 and box['left'] >= 0 and box['right'] <= page.viewport_size['width'], box
        fit = page.evaluate("""()=>{
          const controls=document.querySelector('#call-controls').getBoundingClientRect();
          const table=document.querySelector('#local-table').getBoundingClientRect();
          return {scrollY,scrollHeight:document.documentElement.scrollHeight,innerHeight,
            controls:{top:controls.top,bottom:controls.bottom},table:{top:table.top,bottom:table.bottom},
            buttons:[...document.querySelectorAll('#call-controls .call-type-buttons button')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})};
        }""")
        assert fit['scrollY'] == 0 and fit['scrollHeight'] <= fit['innerHeight'], fit
        assert fit['controls']['top'] >= fit['table']['bottom'], fit
        assert all(button['left'] >= 0 and button['right'] <= page.viewport_size['width'] for button in fit['buttons']), fit
        return fit

    def open_kind(kind, expected):
        before = layout_snapshot()
        page.locator(f'#call-{kind}').click()
        page.wait_for_function("document.querySelector('#call-decision-dialog').open")
        assert page.locator('#call-decision-title').inner_text() == {'pon':'ポンの選択','chi':'チーの選択','kan':'カンの選択'}[kind]
        options = page.locator('#call-decision-options-host button[data-action-choice="call"]')
        assert options.count() == expected
        expected_label = {'pon':'ポン','chi':'チー','kan':'大明カン'}[kind]
        assert options.evaluate_all("nodes=>nodes.map(n=>n.childNodes[0]?.textContent.trim())") == [expected_label] * expected
        assert page.locator('#call-decision-options-host .tile-svg').count() > 0
        assert options.evaluate_all("nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44})")
        assert page.locator('#call-decision-options-host .tile-svg').evaluate_all("nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=22&&r.height>=31})")
        assert page.locator('#call-decision-options-host [data-panel-part="pass-call"]').count() == 0
        assert page.locator('#pass-calls').is_visible(), 'the normal pass button disappeared while choosing a candidate'
        assert page.locator('#call-decision-view-table').inner_text() == '卓に戻る'
        dialog_fit = page.evaluate("""()=>{
          const vv=visualViewport, top=vv?.offsetTop??0, bottom=top+(vv?.height??innerHeight);
          const dialog=document.querySelector('#call-decision-dialog').getBoundingClientRect();
          const targets=[...document.querySelectorAll('#call-decision-title,#call-decision-status,.call-decision-target,#call-decision-options-host button,#call-decision-view-table')]
            .filter(node=>node.id!=='call-decision-status'||node.textContent.trim());
          const visible=targets.every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=top&&r.bottom<=bottom&&
            (node.tagName!=='BUTTON'||(!node.disabled&&document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)?.closest('button')===node))});
          return {fit:dialog.left>=0&&dialog.right<=innerWidth&&dialog.top>=top&&dialog.bottom<=bottom&&visible,
            dialog:{left:dialog.left,right:dialog.right,top:dialog.top,bottom:dialog.bottom},top,bottom,
            controls:targets.map(node=>{const r=node.getBoundingClientRect();return {name:node.id||node.className,left:r.left,right:r.right,top:r.top,bottom:r.bottom}}),
            scrollY,scrollWidth:document.documentElement.scrollWidth,innerWidth};
        }""")
        assert dialog_fit['fit'] and dialog_fit['scrollWidth'] <= dialog_fit['innerWidth'] and dialog_fit['scrollY'] == 0, dialog_fit
        assert layout_snapshot() == before, {'before':before,'after':layout_snapshot()}
        print(f'{browser_name} call dialog at {page.viewport_size}: {dialog_fit["dialog"]}')
        return options

    for width, height in [(375, 634), (375, 667), (320, 568), (375, 568)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0,0)')
        page.evaluate('loadTurn()')
        before_call = layout_snapshot()
        page.evaluate("loadCalls('max')")
        page.wait_for_function("document.querySelector('#call-controls').hidden === false")
        assert layout_snapshot() == before_call, {'beforeCall':before_call,'duringCall':layout_snapshot()}
        fit = assert_type_buttons()
        assert page.locator('#call-pon').is_visible() and page.locator('#call-kan').is_visible() and page.locator('#call-chi').is_visible()
        print(f'{browser_name} {width}x{height} four call buttons fit: {fit}')

        if width == 375 and height == 634:
            # Different call types are independent. One candidate executes without a dialog.
            page.locator('#call-pon').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

            page.evaluate("loadCalls('max')")
            before_escape = layout_snapshot()
            open_kind('chi', 5)
            page.keyboard.press('Escape')
            assert layout_snapshot() == before_escape, {'beforeEscape':before_escape,'afterEscape':layout_snapshot()}
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
            assert page.evaluate("callState().phase==='awaiting-call'")
            assert page.locator('#call-chi').is_visible(), 'Escape ended the call decision'
            before_return = layout_snapshot()
            open_kind('chi', 5)
            page.locator('#call-decision-view-table').click()
            assert layout_snapshot() == before_return, {'beforeTableReturn':before_return,'afterTableReturn':layout_snapshot()}
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
            assert page.evaluate("callState().phase==='awaiting-call'")
            assert page.locator('#call-chi').is_visible(), 'returning to the table ended the call decision'
            assert page.locator('#pass-calls').is_visible(), 'the normal pass button was not restored on the table'
            open_kind('chi', 5).first.click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

            page.evaluate("loadCalls('max')")
            page.locator('#call-kan').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

            page.evaluate("loadCalls('red')")
            red_options = open_kind('chi', 2)
            reds = red_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(reds) == [False,True], reds
            page.locator('#call-decision-options-host button:not(:has(path[d="M48 4h7v7Z"]))').first.click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'the non-red chi option claimed the red five'

            page.evaluate("loadCalls('pon-red')")
            pon_options = open_kind('pon', 2)
            pon_reds = pon_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(pon_reds) == [False,True], pon_reds
            page.locator('#call-decision-options-host button:has(path[d="M48 4h7v7Z"])').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'the red pon option lost its red physical tile'

            page.evaluate("loadCalls('max')")
            open_kind('chi', 5)
            page.locator('#call-decision-view-table').click()
            assert page.evaluate("callState().phase==='awaiting-call'")
            page.locator('#pass-calls').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

        if not (width == 375 and height == 634):
            # Verify a maximum type specific list fits every requested viewport.
            page.evaluate("loadCalls('max')")
            before_escape = layout_snapshot()
            open_kind('chi', 5)
            page.keyboard.press('Escape')
            assert layout_snapshot() == before_escape, {'beforeEscape':before_escape,'afterEscape':layout_snapshot()}
            assert page.evaluate("callState().phase==='awaiting-call'")

    # A unique chi uses the existing select-call path immediately.
    page.set_viewport_size({'width':375,'height':634})
    page.evaluate("loadCalls('one')")
    unique_count = page.evaluate("document.querySelectorAll('#call-chi').length && document.querySelectorAll('#call-options button').length")
    assert unique_count == 0
    page.locator('#call-chi').click()
    page.wait_for_function("callState().phase!=='awaiting-call'")
    assert not page.locator('#call-decision-dialog').evaluate('(node)=>node.open')

    # Exercise the controls and modal inside the viewport-sized iframe used by itch.io.
    page.set_content('''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100vw;height:100vh;border:0}
    </style></head><body><iframe id="call-decision-frame" name="call-decision-frame" src="http://127.0.0.1:4173/heibon-mahjong/"></iframe></body></html>''')
    frame = page.frame(name='call-decision-frame')
    page.frame_locator('#call-decision-frame').locator('#call-decision-dialog').wait_for(state='attached')
    assert frame is not None
    frame.wait_for_function('typeof loadCalls === "function"')
    frame.evaluate("loadCalls('max')")
    iframe_metrics = frame.evaluate("""()=>({viewport:{width:innerWidth,height:innerHeight},
      scrollY,scrollHeight:document.documentElement.scrollHeight,
      buttons:[...document.querySelectorAll('#call-controls .call-type-buttons button')].map(e=>{const r=e.getBoundingClientRect();return {visible:r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth,top:r.top,bottom:r.bottom}})})""")
    assert iframe_metrics['viewport'] == {'width':375,'height':634}, iframe_metrics
    assert iframe_metrics['scrollY'] == 0 and iframe_metrics['scrollHeight'] <= 634, iframe_metrics
    assert len(iframe_metrics['buttons']) == 4 and all(button['visible'] for button in iframe_metrics['buttons']), iframe_metrics
    frame.locator('#call-chi').click()
    assert frame.locator('#call-decision-dialog').evaluate('(node)=>node.open')
    assert frame.locator('#call-decision-options-host button[data-action-choice="call"]').count() == 5
    assert frame.locator('#call-decision-options-host [data-panel-part="pass-call"]').count() == 0
    assert frame.locator('#pass-calls').is_visible()
    frame.locator('#call-decision-view-table').click()
    assert not frame.locator('#call-decision-dialog').evaluate('(node)=>node.open')
    print(f'{browser_name} itch-style iframe four-button and filtered-dialog fit: {iframe_metrics}')
    assert not errors, errors
    page.close()
    browser.close()
