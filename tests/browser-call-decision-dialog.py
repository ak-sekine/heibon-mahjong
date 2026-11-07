"""Inline call selection, responsive candidate grids and upward expansion regression."""
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

    for width, height in [(375, 634), (320, 568), (375, 844), (844, 390), (1280, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0,0)')
        page.evaluate("loadCalls('max')")
        page.wait_for_function("document.querySelector('#call-controls').hidden === false")
        assert page.locator('#call-decision-dialog').count() == 0, 'call modal remains in the page'
        assert page.locator('dialog[open]').count() == 0, 'call decision unexpectedly opened a modal'
        assert page.locator('#call-options button').count() == 0, 'candidates appeared before a type was selected'
        call_position = page.locator('#call-controls').evaluate('node=>getComputedStyle(node).position')
        assert call_position == ('absolute' if width >= 960 else 'static'), (width, call_position)
        for selector in ['#call-pon', '#call-kan', '#call-chi', '#pass-calls']:
            box = page.locator(selector).bounding_box()
            assert box and box['width'] >= 44 and box['height'] >= 44, (width, height, selector, box)

        panel_before = page.locator('#call-controls').bounding_box()
        page.locator('#call-chi').click()
        candidates = page.locator('#call-options button[data-action-choice="call"]')
        assert candidates.count() == 5, f'{width}x{height}: expected five chi candidates'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text="";while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest("svg"))text+=walker.currentNode.textContent;}return text.trim()===""})'), 'call kind text is duplicated outside the tile artwork'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>Boolean(node.getAttribute("aria-label")))'), 'candidate accessible names were removed'
        assert candidates.evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth})'), 'candidate hit target is clipped or too small'
        assert page.locator('#call-options .tile-svg').evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>=22&&r.height>=31})'), 'candidate tile art became too small'
        assert page.locator('#call-back').inner_text() == '戻る' and page.locator('#call-back').is_visible()
        assert page.locator('#pass-calls').is_visible(), 'pass disappeared while choosing a candidate'
        grid = page.locator('#call-options').evaluate("node=>({columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,top:node.getBoundingClientRect().top})")
        if width >= 375:
            assert grid['columns'] >= 3, (width, grid)
        panel_candidates = page.locator('#call-controls').bounding_box()
        assert panel_before and panel_candidates and panel_candidates['bottom'] <= panel_before['bottom'] + 1, (panel_before, panel_candidates)
        if width <= 375 or width == 1280:
            assert panel_candidates['top'] < panel_before['top'], (width, panel_before, panel_candidates)
        assert page.evaluate('scrollY') == 0, 'rendering call candidates scrolled the page'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight'), 'call panel caused page overflow'

        if (width, height) == (375, 634):
            actions_before = page.evaluate('callState().phase')
            page.keyboard.press('Escape')
            assert page.locator('#call-options button').count() == 0
            assert page.locator('#call-chi').is_visible() and page.locator('#call-back').is_hidden()
            assert page.evaluate('callState().phase') == actions_before, 'Escape answered the call decision'
            page.locator('#call-chi').click()
            page.locator('#call-back').click()
            assert page.evaluate('callState().phase') == actions_before, 'back answered the call decision'
            page.locator('#pass-calls').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate("loadCalls('max')")
            page.locator('#call-kan').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate("loadCalls('red')")
            page.locator('#call-chi').click()
            red_options = page.locator('#call-options button[data-action-choice="call"]')
            assert red_options.count() == 2
            reds = red_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(reds) == [False, True], reds
            red_options.locator(':has(path[d="M48 4h7v7Z"])').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'red chi candidate lost its physical red tile'

            page.evaluate("loadCalls('pon-red')")
            page.locator('#call-pon').click()
            pon_options = page.locator('#call-options button[data-action-choice="call"]')
            assert pon_options.count() == 2
            pon_reds = pon_options.evaluate_all("nodes=>nodes.map(n=>[...n.querySelectorAll('svg path')].some(p=>p.getAttribute('d')==='M48 4h7v7Z'))")
            assert sorted(pon_reds) == [False, True], pon_reds
            pon_options.locator(':has(path[d="M48 4h7v7Z"])').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")
            assert page.evaluate("callState().players[0].melds[0].tiles.some(t=>t.tile.isRed)"), 'red pon candidate lost its physical red tile'

            page.evaluate("loadCalls('one')")
            page.locator('#call-chi').click()
            assert page.locator('#call-options button[data-action-choice="call"]').count() == 1
            assert page.evaluate("callState().phase==='awaiting-call'"), 'a single candidate was selected before it was displayed'
            page.locator('#call-options button[data-action-choice="call"]').click()
            page.wait_for_function("callState().phase!=='awaiting-call'")

            page.evaluate('loadTurn()')
            assert page.locator('#call-controls').is_hidden(), 'call controls were shown for a ron decision'
            assert page.locator('#ron-controls').is_visible(), 'ron controls were lost during call UI changes'

        print(f'{browser_name} call UI at {width}x{height}: {grid["columns"]} candidate columns')

    assert not errors, errors
    page.close()
    browser.close()
