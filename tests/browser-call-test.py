"""Exercise the public pon/kan fixture page using the real local controls."""
import os
from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
BASE_URL = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
VIEWPORTS = [(320, 568), (375, 634), (390, 844), (430, 932), (768, 1024),
             (1024, 768), (1280, 720), (1366, 768), (1440, 900), (1660, 825), (1920, 1080)]


def assert_integrity(page, expected_meld=None, expected_kan_count=None):
    state = page.evaluate('''()=>{
      const g=window.readGame(),m=window.testController.match;
      const tiles=[...g.liveWall,...g.deadWall,...g.players.flatMap(p=>[
        ...p.hand,...(p.drawnTile?[p.drawnTile]:[]),...p.river,...p.melds.flatMap(meld=>meld.tiles)
      ])];
      return {
        tileCount:tiles.length,uniqueTileCount:new Set(tiles.map(tile=>tile.id)).size,
        points:m.points.reduce((sum,value)=>sum+value,0)+m.depositSticks*1000,
        melds:g.players[0].melds.map(meld=>({type:meld.type,size:meld.tiles.length})),
        kanCount:g.kanCount??0,phase:g.phase,turn:g.turnPlayerId,
        drawSource:g.players[0].drawnTileSource,liveWall:g.liveWall.length,
        dora:document.querySelectorAll('#local-table .dora-slot[data-tile-id]').length,
        cpuRiver:g.players[3].river.length,
        cpuRivers:g.players.slice(1).map(player=>player.river.length),
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth
      };
    }''')
    assert state['tileCount'] == 136 and state['uniqueTileCount'] == 136, f'136 physical tiles must remain unique: {state}'
    assert state['points'] == 100000, f'starting points changed: {state}'
    assert not state['horizontalOverflow'], f'page has horizontal overflow: {state}'
    if expected_meld is not None:
        assert state['melds'][-1] == expected_meld, f'incorrect public meld: {state}'
    if expected_kan_count is not None:
        assert state['kanCount'] == expected_kan_count, f'incorrect kan count: {state}'
    return state


def table_rect(page):
    return page.locator('#local-table').evaluate('''e=>{
      const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom};
    }''')


def assert_same_table(before, after, label):
    for key in ('left', 'top', 'width', 'height'):
        assert abs(before[key]-after[key]) < 1, f'{label}: table {key} changed: {before} -> {after}'


def control_rects(page):
    return page.evaluate('''()=> {
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom}};
      return {controls:rect(document.querySelector('#local-game-controls')),
        actions:rect(document.querySelector('#local-game-controls .action-buttons')),
        kanToggle:rect(document.querySelector('#kan'))};
    }''')


def assert_same_rect(before, after, label):
    for area in before:
        for key in ('left', 'top', 'width', 'height', 'bottom'):
            assert abs(before[area][key]-after[area][key]) < 1, f'{label}: {area} {key} changed: {before} -> {after}'


def assert_action_row_in_initial_view(page, label):
    buttons = page.evaluate('''()=>[...document.querySelectorAll('#local-game-controls .action-buttons .control-action-button')]
      .filter(button=>!button.hidden&&getComputedStyle(button).display!=='none'&&getComputedStyle(button).visibility!=='hidden')
      .map(button=>{const r=button.getBoundingClientRect();return {id:button.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}})''')
    assert buttons, f'{label}: no ordinary action buttons are visible'
    for button in buttons:
        assert button['left'] >= -0.5 and button['right'] <= page.viewport_size['width'] + 0.5, f'{label}: action button is outside the viewport horizontally: {button}'
        assert button['top'] >= -0.5 and button['bottom'] <= page.viewport_size['height'] + 0.5, f'{label}: kan panel pushed an action button out of the initial viewport: {button}'
        assert button['width'] >= 44 and button['height'] >= 44, f'{label}: action button is below 44px: {button}'


def assert_click_target(page, selector, label, *, below_table=False, in_initial_view=True):
    target = page.evaluate('''selector=>{
      const e=document.querySelector(selector);
      if(!e)return null;
      const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      const t=document.querySelector('#local-table').getBoundingClientRect();
      return {hidden:e.hidden||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden',
        x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,
        tableBottom:t.bottom,panelTop:document.querySelector('#local-game-controls').getBoundingClientRect().top,
        scrollY,viewportHeight:innerHeight,
        receivesPointer:hit===e||e.contains(hit)};
    }''', selector)
    assert target is not None and not target['hidden'], f'{label}: button is not visible: {target}'
    assert target['width'] >= 44 and target['height'] >= 44, f'{label}: button is smaller than 44px: {target}'
    assert target['x'] >= -0.5 and target['right'] <= page.viewport_size['width'] + 0.5, f'{label}: button is outside the viewport horizontally: {target}'
    if in_initial_view:
        assert target['y'] >= -0.5 and target['bottom'] <= target['viewportHeight'] + 0.5, f'{label}: button is outside the initial viewport: {target}'
    else:
        assert target['y'] >= -0.5 and target['bottom'] <= target['viewportHeight'] + 0.5, f'{label}: button is outside the scrolled viewport: {target}'
    assert target['receivesPointer'], f'{label}: another element covers the button center: {target}'
    if below_table:
        assert 0 <= target['panelTop']-target['tableBottom'] <= 8.5, f'{label}: operation panel must be directly below the table: {target}'
    return target


def start_scenario(page, mode):
    settings = page.locator('#call-test-settings')
    if not settings.evaluate('e=>e.open'):
        page.locator('#toggle-call-test-settings').click()
    page.select_option('#scenario', mode)
    page.locator('#load-scenario').click()
    page.wait_for_function('''()=>!document.querySelector('#call-test-settings').open''')
    page.wait_for_selector('#local-game-controls')
    assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{mode}: initial-view check started after scrolling'
    if mode in ('pon', 'pon-multiple', 'daiminkan'):
        page.wait_for_function("()=>!document.querySelector('#call-controls').hidden")
    else:
        page.wait_for_function("()=>!document.querySelector('#kan').hidden")
    assert_integrity(page)


with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def expose_page_controller(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + '\nwindow.testController=controller;')

        page.route('**/src/verification/page.ts', expose_page_controller)
        page.goto(BASE_URL + 'call-test.html')
        page.wait_for_selector('#scenario-help:not(:empty)')
        assert page.title().startswith('ポン・カン実機検証')
        assert page.locator('meta[name="robots"]').get_attribute('content') == 'noindex, nofollow'
        assert page.locator('#scenario option').evaluate_all('nodes=>nodes.map(node=>node.value)') == ['pon', 'pon-multiple', 'daiminkan', 'opening', 'ankan', 'kakan']
        settings_geometry = page.evaluate('''()=>{
          const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
          const targets=['#scenario','#load-scenario'].map(selector=>{
            const node=document.querySelector(selector),r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
            return {selector,...rect(node),receivesPointer:hit===node||node.contains(hit)};
          });
          return {lab:rect(document.querySelector('#call-test-lab')),targets,scrollY:document.scrollingElement.scrollTop};
        }''')
        assert settings_geometry['scrollY'] <= 1 and settings_geometry['lab']['top'] >= -0.5 and settings_geometry['lab']['bottom'] <= height + 0.5, f'{width}x{height}: scenario controls are outside the initial viewport: {settings_geometry}'
        for target in settings_geometry['targets']:
            assert target['top'] >= -0.5 and target['bottom'] <= height + 0.5 and target['height'] >= 44 and target['receivesPointer'], f'{width}x{height}: scenario control is not initially clickable: {settings_geometry}'
        page.evaluate('window.readGame=()=>window.testController.game')

        for mode, call_selector, meld_type, meld_size, dora_count in [
            ('pon', '#call-pon', 'pon', 3, 1),
            ('daiminkan', '#call-kan', 'daiminkan', 4, 2),
        ]:
            start_scenario(page, mode)
            before = table_rect(page)
            assert_click_target(page, call_selector, f'{width}x{height} {mode} call', below_table=True)
            assert_click_target(page, '#pass-calls', f'{width}x{height} {mode} pass', below_table=True)

            # Passing keeps the game legal and lets ordinary turn progression resume.
            page.locator('#pass-calls').click()
            page.wait_for_function("()=>document.querySelector('#call-controls').hidden && window.readGame().ronWindow===null")
            passed = assert_integrity(page)
            assert passed['melds'] == [], f'{mode}: passing must not open a meld: {passed}'
            assert passed['phase'] in ('awaiting-draw', 'awaiting-discard') and passed['turn'] == 0, f'{mode}: passing must advance to the next ordinary turn: {passed}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} call decision hide')

            # The visible repeat control rebuilds exactly the same pending call window.
            page.locator('#repeat-scenario').click()
            page.wait_for_function("()=>!document.querySelector('#call-controls').hidden")
            repeated = assert_integrity(page)
            assert repeated['phase'] == 'awaiting-call' and repeated['turn'] == 3 and repeated['cpuRiver'] == 1, f'{mode}: repeat must restore the pending CPU discard: {repeated}'
            assert repeated['melds'] == [], f'{mode}: repeat must remove any previous call: {repeated}'
            before = table_rect(page)
            assert_click_target(page, call_selector, f'{width}x{height} {mode} call after repeat', below_table=True)
            page.locator(call_selector).click()
            if mode == 'pon':
                assert page.locator('#candidate-options button').count() == 0, 'a single Pon choice must execute immediately without opening candidate selection'
            page.wait_for_function('''type=>!window.testController.progressing && window.readGame().players[0].melds.some(m=>m.type===type)''', arg=meld_type)
            called = assert_integrity(page, {'type': meld_type, 'size': meld_size}, 1 if mode == 'daiminkan' else 0)
            assert called['cpuRiver'] == 0, f'{mode}: the called discard must leave the river: {called}'
            assert called['dora'] == dora_count, f'{mode}: dora indicators must match the kan state: {called}'
            if mode == 'pon':
                assert called['drawSource'] is None, f'pon must lead to a discard turn: {called}'
            else:
                assert called['drawSource'] == 'rinshan', f'daiminkan must draw from the dead wall: {called}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} call completion')

        start_scenario(page, 'pon-multiple')
        before = table_rect(page)
        legal_pon = page.evaluate('''async()=>{
          const [{getCallOptions},{uniqueCallOptionsByDisplay},{tileKindKey}]=await Promise.all([
            import('/heibon-mahjong/src/game/calls.ts'),
            import('/heibon-mahjong/src/ui/call-options.ts'),
            import('/heibon-mahjong/src/model/tile.ts')
          ]);
          const options=getCallOptions(readGame(),0).filter(option=>option.type==='pon');
          const displayed=uniqueCallOptionsByDisplay(options,()=> 'ポン');
          const signature=option=>JSON.stringify(option.tiles.map(tile=>tileKindKey(tile.tile)+':'+tile.tile.isRed).sort());
          return {legalCount:options.length,displayCount:displayed.length,
            displaySignatures:displayed.map(signature),uniqueSignatures:new Set(displayed.map(signature)).size,
            options:displayed.map(option=>({id:option.id,handTileIds:option.handTileIds,calledTileId:option.calledTileId,hasRed:option.tiles.some(tile=>tile.tile.isRed)}))};
        }''')
        assert legal_pon['legalCount'] == 3, f'{width}x{height}: fixture must have three legal physical Pon pairings: {legal_pon}'
        assert legal_pon['displayCount'] == 2 and legal_pon['uniqueSignatures'] == 2, f'{width}x{height}: uniqueCallOptionsByDisplay must leave two distinct choices: {legal_pon}'
        assert sorted(item['hasRed'] for item in legal_pon['options']) == [False, True], f'{width}x{height}: choices must differ by the red five: {legal_pon}'
        original_hand = page.evaluate('readGame().players[0].hand.map(tile=>tile.id).sort()')
        assert_click_target(page, '#call-pon', f'{width}x{height} multi-Pon action', below_table=True)
        page.locator('#call-pon').click()
        page.wait_for_function("document.querySelectorAll('#candidate-options button[data-action-choice=call]').length===2")
        candidate_data = page.locator('#candidate-options button[data-action-choice="call"]').evaluate_all('''nodes=>nodes.map(node=>({
          id:node.dataset.candidateId,label:node.getAttribute('aria-label'),
          nonImageChildren:[...node.children].filter(child=>!child.classList.contains('tile-svg')).map(child=>child.outerHTML),
          directText:[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent.trim()).join(''),
          faces:[...node.querySelectorAll('.tile-svg')].map(tile=>tile.getAttribute('aria-label')),
          hasRed:[...node.querySelectorAll('.tile-svg')].some(tile=>(tile.getAttribute('aria-label')||'').includes('赤5萬')),
          rect:(()=>{const r=node.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,receivesPointer:hit===node||node.contains(hit)}})()
        }))''')
        assert len(candidate_data) == 2, f'{width}x{height}: expected two visible Pon choices: {candidate_data}'
        assert len({item['label'] for item in candidate_data}) == 2, f'{width}x{height}: candidates must show different tiles: {candidate_data}'
        assert all('ポン：' in item['label'] and not item['nonImageChildren'] and not item['directText'] for item in candidate_data), f'{width}x{height}: candidates must expose operation and tiles accessibly while containing only tile images: {candidate_data}'
        assert sum(any('赤5萬' in (face or '') for face in item['faces']) for item in candidate_data) == 1, f'{width}x{height}: exactly one candidate must show a red five: {candidate_data}'
        assert_integrity(page)
        for index, _ in enumerate(candidate_data):
            assert_click_target(page, f'#candidate-options button[data-action-choice="call"]:nth-child({index + 1})', f'{width}x{height} multi-Pon candidate {index + 1}')
        assert_same_table(before, table_rect(page), f'{width}x{height} multi-Pon candidates open')
        assert_click_target(page, '#candidate-back', f'{width}x{height} multi-Pon back')
        page.locator('#candidate-back').click()
        page.wait_for_function("document.querySelector('#candidate-options').children.length===0 && !document.querySelector('#call-pon').hidden")
        assert_integrity(page)
        assert_same_table(before, table_rect(page), f'{width}x{height} multi-Pon back')
        assert_click_target(page, '#call-pon', f'{width}x{height} multi-Pon action after back', below_table=True)
        page.locator('#call-pon').click()
        page.wait_for_function("document.querySelectorAll('#candidate-options button[data-action-choice=call]').length===2")
        red_index = next(index for index, item in enumerate(candidate_data) if any('赤5萬' in (face or '') for face in item['faces']))
        chosen = page.locator('#candidate-options button[data-action-choice="call"]').nth(red_index)
        selected_option = next(option for option in legal_pon['options'] if option['hasRed'] == candidate_data[red_index]['hasRed'])
        assert selected_option['hasRed'], f'{width}x{height}: the red-five candidate was not selected: {selected_option}'
        assert_click_target(page, f'#candidate-options button[data-action-choice="call"]:nth-child({red_index + 1})', f'{width}x{height} red Pon candidate')
        chosen.click()
        page.wait_for_function("()=>!window.testController.progressing && window.readGame().players[0].melds.some(m=>m.type==='pon')")
        called = assert_integrity(page, {'type': 'pon', 'size': 3}, 0)
        after_hand = page.evaluate('readGame().players[0].hand.map(tile=>tile.id).sort()')
        removed = sorted(tile_id for tile_id in original_hand if tile_id not in after_hand)
        assert removed == sorted(selected_option['handTileIds']), f'{width}x{height}: Pon must remove exactly the chosen two hand tiles: expected {selected_option["handTileIds"]}, removed {removed}'
        meld_ids = page.evaluate('readGame().players[0].melds.at(-1).tiles.map(tile=>tile.id).sort()')
        assert meld_ids == sorted(selected_option['handTileIds'] + [selected_option['calledTileId']]), f'{width}x{height}: selected choice does not match the completed meld: {meld_ids}'
        assert page.evaluate('readGame().players[0].melds.at(-1).tiles.some(tile=>tile.tile.isRed)'), f'{width}x{height}: chosen red five is absent from the completed meld'
        assert called['cpuRivers'][0] == 0 and called['drawSource'] is None, f'{width}x{height}: Pon must remove the CPU1 discard and resume discard turn: {called}'
        assert_same_table(before, table_rect(page), f'{width}x{height} multi-Pon completion')

        for mode, meld_type in [('opening', 'ankan'), ('ankan', 'ankan'), ('kakan', 'kakan')]:
            start_scenario(page, mode)
            original = page.evaluate('''()=>{
              const g=readGame();return {kanCount:g.kanCount??0,liveWall:g.liveWall.length,
                hand:[...g.players[0].hand.map(t=>t.id),...(g.players[0].drawnTile?[g.players[0].drawnTile.id]:[])].sort(),
                melds:g.players[0].melds.map(m=>({type:m.type,ids:m.tiles.map(t=>t.id).sort()}))};
            }''')
            before = table_rect(page)
            controls_before = control_rects(page)
            assert_click_target(page, '#kan', f'{width}x{height} {mode} kan toggle', below_table=True)
            page.locator('#kan').click()
            if mode == 'opening':
                page.wait_for_function("()=>!document.querySelector('#candidate-controls').hidden && document.querySelectorAll('#candidate-options button').length>0")
                assert_same_table(before, table_rect(page), f'{width}x{height} {mode} candidates open')
                panel_geometry = page.evaluate('''()=>({
                  controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),
                  actions:document.querySelector('#local-game-controls .action-buttons').getBoundingClientRect().toJSON(),
                  panel:document.querySelector('#candidate-controls').getBoundingClientRect().toJSON(),
                  list:document.querySelector('#candidate-options').getBoundingClientRect().toJSON(),
                  listOverflow:getComputedStyle(document.querySelector('#candidate-options')).overflowY,
                  listMaxHeight:getComputedStyle(document.querySelector('#candidate-options')).maxHeight,
                  position:getComputedStyle(document.querySelector('#candidate-controls')).position,
                  normalHidden:document.querySelector('#normal-controls').hidden,
                  panelText:(()=>{const node=document.querySelector('#candidate-controls'),walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text='';while(walker.nextNode()){if(!walker.currentNode.parentElement?.closest('svg'))text+=walker.currentNode.textContent;}return text.trim()})(),
                  visibleNormalButtons:[...document.querySelectorAll('#normal-controls button')].filter(button=>button.getClientRects().length>0).map(button=>button.id),
                  scrollY:document.scrollingElement.scrollTop
                })''')
                assert panel_geometry['scrollY'] <= 1, f'{width}x{height} {mode}: opening candidates scrolled the page: {panel_geometry}'
                assert panel_geometry['position'] == 'fixed', f'{width}x{height} {mode}: shared candidate panel is not viewport anchored: {panel_geometry}'
                assert panel_geometry['panel']['top'] < panel_geometry['panel']['bottom'] and panel_geometry['panel']['bottom'] <= height + 0.5, f'{width}x{height} {mode}: panel did not expand upward inside the viewport: {panel_geometry}'
                anchor_bottom = controls_before['controls']['bottom']
                assert abs(panel_geometry['panel']['bottom']-anchor_bottom) <= 2, f'{width}x{height} {mode}: panel bottom did not stay at the control-panel baseline: {panel_geometry}, before={controls_before}'
                assert panel_geometry['panel']['top'] < controls_before['kanToggle']['top'], f'{width}x{height} {mode}: candidate panel did not expand above its original Kan trigger: {panel_geometry}, before={controls_before}'
                assert panel_geometry['listOverflow'] == 'auto' and panel_geometry['listMaxHeight'] != 'none', f'{width}x{height} {mode}: candidate list is not internally scrollable: {panel_geometry}'
                assert panel_geometry['normalHidden'] and panel_geometry['panelText'] == '戻る' and not panel_geometry['visibleNormalButtons'], f'{width}x{height} {mode}: candidate mode exposed ordinary operations: {panel_geometry}'
                candidate_count = page.locator('#candidate-options button').count()
                if mode == 'opening':
                    assert candidate_count == 2, f'{width}x{height}: opening ankan must expose two candidates'
                expected_operation = '加カン：' if mode == 'kakan' else '暗カン：'
                assert page.locator('#candidate-options button').evaluate_all("(nodes,prefix)=>nodes.every(node=>node.getAttribute('aria-label')?.startsWith(prefix) && [...node.childNodes].every(child=>child.nodeType!==Node.TEXT_NODE || !child.textContent.trim()))", expected_operation), f'{width}x{height} {mode}: candidate must expose operation and tile names accessibly while displaying tile art only'
                assert page.locator('#candidate-back').inner_text().strip() == '戻る'
                assert_integrity(page)
                for index in range(candidate_count):
                    assert_click_target(page, f'#candidate-options button:nth-child({index + 1})', f'{width}x{height} {mode} candidate {index + 1}')
                if mode == 'opening':
                    page.locator('#candidate-back').focus()
                    page.keyboard.press('Shift+Tab')
                    candidate_focus = page.evaluate('''()=>{const e=document.activeElement,s=getComputedStyle(e);return {
                      action:e.dataset.actionChoice,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth)
                    }}''')
                    assert candidate_focus['action'] == 'kan' and candidate_focus['visible'] and candidate_focus['outlineStyle'] != 'none' and candidate_focus['outlineWidth'] >= 2, f'{width}x{height}: keyboard focus indicator is missing on a candidate: {candidate_focus}'
                    page.keyboard.press('Tab')
                    focus = page.evaluate('''()=>{const e=document.activeElement,s=getComputedStyle(e);return {
                      id:e.id,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth)
                    }}''')
                    assert focus['id'] == 'candidate-back' and focus['visible'] and focus['outlineStyle'] != 'none' and focus['outlineWidth'] >= 2, f'{width}x{height}: keyboard focus indicator is missing: {focus}'
                    scroll_metrics = page.evaluate('''()=>{
                      const list=document.querySelector('#candidate-options'),template=list.querySelector('button');
                      for(let i=0;i<100;i++){const clone=template.cloneNode(true);clone.dataset.overflowTest='true';list.append(clone);}
                      list.scrollTop=list.scrollHeight;
                      const last=list.querySelector('button[data-overflow-test="true"]:last-child');
                      const r=last.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
                      const result={clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,scrollTop:list.scrollTop,
                        lastVisible:r.top>=0&&r.bottom<=innerHeight,lastReceivesPointer:hit===last||last.contains(hit),
                        pageScroll:document.scrollingElement.scrollTop,overflow:getComputedStyle(list).overflowY};
                      list.querySelectorAll('[data-overflow-test="true"]').forEach(node=>node.remove());
                      list.scrollTop=0;
                      return result;
                    }''')
                    assert scroll_metrics['overflow'] == 'auto' and scroll_metrics['scrollHeight'] > scroll_metrics['clientHeight'] and scroll_metrics['scrollTop'] > 0, f'{width}x{height}: many kan candidates did not scroll inside the list: {scroll_metrics}'
                    assert scroll_metrics['lastVisible'] and scroll_metrics['lastReceivesPointer'] and scroll_metrics['pageScroll'] <= 1, f'{width}x{height}: last kan candidate was not reachable without page scrolling: {scroll_metrics}'
                assert_click_target(page, '#candidate-back', f'{width}x{height} {mode} cancel')
                page.locator('#candidate-back').click()
                page.wait_for_function("()=>document.querySelector('#candidate-controls').hidden")
                after_cancel = page.evaluate('''()=>{
                  const g=readGame();return {kanCount:g.kanCount??0,liveWall:g.liveWall.length,
                    hand:[...g.players[0].hand.map(t=>t.id),...(g.players[0].drawnTile?[g.players[0].drawnTile.id]:[])].sort(),
                    melds:g.players[0].melds.map(m=>({type:m.type,ids:m.tiles.map(t=>t.id).sort()}))};
                }''')
                assert after_cancel == original, f'{mode}: cancellation changed the game: {original} -> {after_cancel}'
                assert_integrity(page)
                assert_same_table(before, table_rect(page), f'{width}x{height} {mode} candidate cancel')
                assert not page.locator('#normal-controls').evaluate('e=>e.hidden'), f'{width}x{height} {mode}: normal operation state did not return after Back'

                page.locator('#kan').click()
                page.wait_for_function("()=>!document.querySelector('#candidate-controls').hidden")
                assert page.locator('#candidate-options button').count() >= 1
                assert_click_target(page, '#candidate-options button', f'{width}x{height} {mode} candidate')
                page.locator('#candidate-options button').first.click()
            else:
                assert page.locator('#candidate-controls').is_hidden(), f'{mode}: single kan opened candidates'
                assert page.locator('#candidate-back').is_hidden()
                assert page.locator('#candidate-options button').count() == 0
            page.wait_for_function('''()=>!window.testController.progressing && window.readGame().kanCount===1''')
            completed = assert_integrity(page, {'type': meld_type, 'size': 4}, 1)
            assert completed['phase'] == 'awaiting-discard' and completed['turn'] == 0, f'{mode}: kan must return to the normal discard turn: {completed}'
            assert completed['drawSource'] == 'rinshan', f'{mode}: a confirmed kan must take a rinshan tile: {completed}'
            assert completed['dora'] == 2, f'{mode}: a confirmed kan must expose one additional dora indicator: {completed}'
            assert page.locator('#discard').is_visible(), f'{mode}: ordinary discard control did not return after kan'
            page.locator('#player-hand button[data-tile-id]').first.click()
            page.wait_for_function("()=>{const button=document.querySelector('#discard');return button&&!button.hidden&&!button.disabled}")
            assert_click_target(page, '#discard', f'{width}x{height} {mode} ordinary discard after kan', below_table=True)
            assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{width}x{height} {mode}: normal PC kan operation required page scrolling'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} confirmation')

            page.locator('#repeat-scenario').click()
            page.wait_for_function("()=>!window.testController.progressing && window.readGame().kanCount===0 && !document.querySelector('#kan').hidden")
            repeated = assert_integrity(page, {'type': 'pon', 'size': 3} if mode == 'kakan' else None, 0)
            repeated_melds = page.evaluate('()=>readGame().players[0].melds.map(m=>({type:m.type,ids:m.tiles.map(t=>t.id).sort()}))')
            assert repeated_melds == original['melds'], f'{mode}: repeat must restore the same initial melds: {original["melds"]} -> {repeated_melds}'
            assert_same_table(before, table_rect(page), f'{width}x{height} {mode} repeat')

        assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{width}x{height}: PC verification required a scroll before action checks'
        assert not errors, f'{width}x{height}: page errors: {errors}'
        print(f'{ENGINE} {width}x{height}: pon, daiminkan, ankan, kakan passed', flush=True)
        page.close()

    # A short PC window can scroll to and operate the same game control panel.
    page = browser.new_page(viewport={'width': 1280, 'height': 550})
    page.route('**/src/verification/page.ts', expose_page_controller)
    page.goto(BASE_URL + 'call-test.html')
    page.wait_for_selector('#scenario-help:not(:empty)')
    page.evaluate('window.readGame=()=>window.testController.game')
    start_scenario(page, 'opening')
    assert page.evaluate('document.documentElement.scrollHeight>innerHeight'), 'short window should allow page scrolling'
    page.locator('#kan').scroll_into_view_if_needed()
    scrolled = assert_click_target(page, '#kan', '1280x550 ankan toggle after scrolling', below_table=False, in_initial_view=False)
    assert scrolled['scrollY'] > 0, 'short window should scroll before the control is operated'
    page.locator('#kan').click()
    assert_click_target(page, '#candidate-back', '1280x550 cancel after scrolling')
    page.locator('#candidate-back').click()
    page.wait_for_function("()=>document.querySelector('#candidate-controls').hidden")
    assert_integrity(page)
    print(f'{ENGINE} 1280x550: scrollable kan controls passed', flush=True)
    page.close()

    # The common candidate UI stays viewport anchored below the desktop breakpoint.
    page = browser.new_page(viewport={'width': 959, 'height': 900})
    page.route('**/src/verification/page.ts', expose_page_controller)
    page.goto(BASE_URL + 'call-test.html')
    page.wait_for_selector('#scenario-help:not(:empty)')
    page.evaluate('window.readGame=()=>window.testController.game')
    start_scenario(page, 'opening')
    # This exceptional scrollable layout starts with part of the ordinary
    # panel below the viewport. Manually reveal its complete baseline first;
    # the 11 normal-size profiles above never scroll before measuring.
    if page.locator('#local-game-controls').evaluate('''e=>{const r=e.getBoundingClientRect();return r.top<0||r.bottom>innerHeight}'''):
        page.locator('#local-game-controls').scroll_into_view_if_needed()
    scroll_before_candidates = page.evaluate('''()=>{
      const controls=document.querySelector('#local-game-controls');
      const bounds=controls.getBoundingClientRect();
      window.__issue32ScrollTrace=[];
      window.addEventListener('scroll',()=>window.__issue32ScrollTrace.push({type:'scroll',top:document.scrollingElement.scrollTop,time:performance.now()}),{passive:true});
      document.addEventListener('focusin',event=>window.__issue32ScrollTrace.push({type:'focusin',target:event.target.id||event.target.className||event.target.tagName,top:document.scrollingElement.scrollTop,time:performance.now()}),true);
      return {top:document.scrollingElement.scrollTop,scrollHeight:document.scrollingElement.scrollHeight,controlsHeight:bounds.height,
        controlsMinHeight:getComputedStyle(controls).minHeight,normalHidden:document.querySelector('#normal-controls').hidden,
        activeElement:document.activeElement.id||document.activeElement.tagName};
    }''')
    before = table_rect(page)
    assert_click_target(page, '#kan', '959x900 opening ankan toggle', in_initial_view=False)
    page.locator('#kan').click()
    page.wait_for_function("!document.querySelector('#candidate-controls').hidden && document.querySelectorAll('#candidate-options button').length===2")
    assert page.locator('#candidate-controls').evaluate('e=>getComputedStyle(e).position') == 'fixed', 'candidate controls below 960px must use the shared viewport layout'
    scroll_after_candidates = page.evaluate('''()=>({top:document.scrollingElement.scrollTop,scrollHeight:document.scrollingElement.scrollHeight,
      controlsHeight:document.querySelector('#local-game-controls').getBoundingClientRect().height,
      controlsMinHeight:getComputedStyle(document.querySelector('#local-game-controls')).minHeight,
      normalHidden:document.querySelector('#normal-controls').hidden,activeElement:document.activeElement.id||document.activeElement.tagName,
      events:window.__issue32ScrollTrace})''')
    assert scroll_after_candidates['top'] == scroll_before_candidates['top'], f'959x900 opening ankan candidates: candidate mode moved page scroll: before={scroll_before_candidates}, after={scroll_after_candidates}'
    assert_same_table(before, table_rect(page), '959x900 opening ankan candidates')
    assert_click_target(page, '#candidate-back', '959x900 opening ankan cancel')
    page.locator('#candidate-back').click()
    page.wait_for_function("document.querySelector('#candidate-controls').hidden")
    assert_integrity(page)
    print(f'{ENGINE} 959x900: existing in-flow kan controls passed', flush=True)
    page.close()

    browser.close()
