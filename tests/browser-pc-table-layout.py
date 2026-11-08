"""PC table fit, legibility, resize, and input checks for Chromium/WebKit."""
import json
import os
import pathlib
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
VIEWPORTS = [(1280, 720), (1366, 768), (1440, 900), (1660, 825), (1920, 1080)]
reports = []
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(parents=True, exist_ok=True)


def inspect_page(page, online=False):
    return page.evaluate('''online=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
      const prefix=online?'online':'local';
      const header=rect(document.querySelector('main > header'));
      const table=rect(document.querySelector(`#${prefix}-table`));
      const scoreStrip=rect(document.querySelector(`#${prefix}-table-summary`));
      const controls=document.querySelector(`#${prefix}-game-controls`);
      const buttons=[...controls.querySelectorAll('.control-action-button')].filter(visible).map(button=>{
        const r=rect(button),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {fontSize:parseFloat(getComputedStyle(button).fontSize),id:button.id,label:button.textContent.trim(),...r,enabled:!button.disabled,receivesPointer:hit===button||button.contains(hit)};
      });
      const scoreLabels=[...document.querySelectorAll('.score-strip .seat-label')].filter(visible).map(e=>parseFloat(getComputedStyle(e).fontSize));
      const center=document.querySelector(`#${prefix}-table .center-info`);
      const round=document.querySelector(`#${prefix}-table .round-summary`);
      const roundLabel=document.querySelector(`#${prefix}-table .round-label`);
      const wallCount=document.querySelector(`#${prefix}-table .wall-count`);
      const textNodes=[...document.querySelectorAll('.score-strip .seat-label,.table .seat-label,.table .center-info > .round-summary,.table .round-label,.table .wall-count')]
        .filter(e=>visible(e)&&e.textContent.trim());
      const tileNodes=[...document.querySelectorAll('.table .tile-svg,.table .tile-back')]
        .filter(visible);
      const overlaps=[];
      for(const text of textNodes){
        const a=rect(text);
        for(const tile of tileNodes){
          const b=rect(tile);
          if(a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5)
            overlaps.push({text:text.textContent.trim(),tile:tile.closest('.river-tile')?'river':tile.closest('.dora-slot')?'dora':tile.closest('.open-meld')?'meld':'hand'});
        }
      }
      const scroll=document.scrollingElement;
      return {
        viewport:{width:innerWidth,height:innerHeight},
        header,scoreStrip,controls:rect(controls),
        table,
        scoreFontSizes:scoreLabels,
        centerFontSize:parseFloat(getComputedStyle(center).fontSize),
        roundFontSize:parseFloat(getComputedStyle(round).fontSize),
        roundLabelFontSize:parseFloat(getComputedStyle(roundLabel).fontSize),
        wallCountFontSize:parseFloat(getComputedStyle(wallCount).fontSize),
        visibleActionButtons:buttons,
        textCount:textNodes.length,tileCount:tileNodes.length,overlaps,
        scroll:{top:scroll.scrollTop,width:scroll.scrollWidth,height:scroll.scrollHeight},
        meldCount:document.querySelectorAll('#local-table .seat-bottom .open-meld').length,
      };
    }''', online)


def assert_pc_layout(page, width, height, label, fit=True, online=False):
    result = inspect_page(page, online)
    for region in ('header', 'scoreStrip'):
        box = result[region]
        assert box['top'] >= -0.5 and box['bottom'] <= height + 0.5, f'{label}: {region} is outside the initial viewport: {result}'
    table = result['table']
    assert table['left'] >= -0.5 and table['right'] <= width + 0.5, f'{label}: table is outside viewport width: {result}'
    assert table['top'] >= -0.5 and (not fit or table['bottom'] <= height + 0.5), f'{label}: table is outside viewport height: {result}'
    assert result['scroll']['width'] <= width + 1, f'{label}: horizontal page overflow: {result}'
    assert not fit or result['scroll']['height'] <= height + 1, f'{label}: vertical page overflow before scrolling: {result}'
    assert result['scroll']['top'] <= 1, f'{label}: page scrolled before initial-view checks: {result}'
    assert result['scoreFontSizes'] and all(14 <= size <= 16 for size in result['scoreFontSizes']), f'{label}: player/score text is outside 14–16px: {result}'
    assert 14 <= result['centerFontSize'] <= 16, f'{label}: center information is outside 14–16px: {result}'
    assert 14 <= result['roundFontSize'] <= 16, f'{label}: round information is outside 14–16px: {result}'
    assert 14 <= result['roundLabelFontSize'] <= 16, f'{label}: round label is outside 14–16px: {result}'
    assert 14 <= result['wallCountFontSize'] <= 16, f'{label}: remaining-wall count is outside 14–16px: {result}'
    assert result['textCount'] >= 5 and result['tileCount'] > 0, f'{label}: expected visible seat, round, and tile content: {result}'
    assert not result['overlaps'], f'{label}: text overlaps a tile, river, dora, or meld: {result}'
    controls = result['controls']
    assert 0 <= controls['top'] - table['bottom'] <= 8.5, f'{label}: controls must follow table: {result}'
    assert abs(controls['width'] - table['width']) <= 1, f'{label}: panel width differs: {result}'
    assert abs((table['left'] + table['right']) / 2 - width / 2) <= 1, f'{label}: table is not centered: {result}'
    assert abs(controls['left'] - table['left']) <= 1, f'{label}: controls are not centered: {result}'
    assert abs(table['width'] - table['height']) <= 1, f'{label}: table must be square: {result}'
    assert result['scoreStrip']['bottom'] <= table['top'], f'{label}: scores must precede table: {result}'
    discard = next((button for button in result['visibleActionButtons'] if button['id'] == ('online-discard' if online else 'discard')), None)
    assert discard and discard['enabled'] and (not fit or discard['receivesPointer']), f'{label}: discard is not operable without scrolling: {result}'
    for button in result['visibleActionButtons']:
        assert button['top'] >= 0 and (not fit or button['bottom'] <= height), f'{label}: visible action button is outside initial viewport: {result}'
        assert button['fontSize'] >= 14, f'{label}: action font too small: {result}'
        assert button['width'] >= 44 and button['height'] >= 44, f'{label}: visible action button is too small: {result}'
        assert not fit or button['receivesPointer'], f'{label}: visible action button is covered: {result}'
    return result


def assert_same_table(expected, actual, label):
    expected_left = expected.get('x', expected.get('left'))
    expected_top = expected.get('y', expected.get('top'))
    actual_left = actual.get('x', actual.get('left'))
    actual_top = actual.get('y', actual.get('top'))
    assert all(abs(a-b) < 1 for a, b in (
        (expected_left, actual_left), (expected_top, actual_top),
        (expected['width'], actual['width']), (expected['height'], actual['height']),
    )), f'{label}: table position or size changed: expected={expected}, actual={actual}'


with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        def expose_app(route):
            response = route.fetch()
            source = """import {callStart} from '/heibon-mahjong/tests/calls-fixture.ts';
import {discardTile} from '/heibon-mahjong/src/game/discard.ts';
import {startMatch} from '/heibon-mahjong/src/game/match.ts';
import {fixedRound} from '/heibon-mahjong/tests/match-fixture.ts';
""" + response.text() + """
window.pcOnlineController=onlineGameController;
window.pcCallStart=callStart;
window.pcDiscardTile=discardTile;
window.pcLoadCalls=()=>{
  controller.newGame();
  const game=callStart(3,{0:['23m','444m','50m','6m','789p','12z']},'man-4');
  controller.match=startMatch(discardTile(game,3,game.players[3].drawnTile.id));
  render();
};
window.pcMakeDrawMatch=()=>startMatch(fixedRound(0,[0,2]));
window.pcShowDrawResult=()=>{controller.newGame();controller.match=pcMakeDrawMatch();render();};
"""
            route.fulfill(response=response, body=fixed_seat_fixture(source))
        page.route('**/src/main.ts', expose_app)
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.evaluate('window.scrollTo(0,0)')
        page.evaluate('''async()=>{
          const app=await import('/heibon-mahjong/src/main.ts');
          window.pcResponsiveApp=app;
          app.controller.random=()=>.999999;
          app.controller.newGame();
        }''')
        page.wait_for_selector('#player-hand button:enabled')
        page.locator('#player-hand button:enabled').first.evaluate('e=>e.click()')
        page.locator('#discard').wait_for(state='visible')
        initial = assert_pc_layout(page, width, height, f'{width}x{height} initial turn')
        page.screenshot(path=str(out / f'pc-table-{ENGINE}-{width}x{height}.png'))

        resized = {'width': width - 160, 'height': height - 80}
        page.set_viewport_size(resized)
        resized_result = assert_pc_layout(page, resized['width'], resized['height'], f'{width}x{height} resized to {resized}', fit=False)
        page.locator('#discard').scroll_into_view_if_needed()
        assert page.locator('#discard').evaluate('e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit)}'), 'discard must remain reachable in short windows'
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate('window.scrollTo(0,0)')
        restored = assert_pc_layout(page, width, height, f'{width}x{height} restored')

        page.evaluate('''async()=>{
          window.pcTableRenderer=await import('/heibon-mahjong/src/rendering/table.ts');
          window.pcTableBase=(await import('/heibon-mahjong/src/game/start.ts')).startGame();
          const base=pcTableBase;
          window.pcMeldFixtures=[1,4].map(meldCount=>{
            let tileIndex=0;
            const melds=Array.from({length:meldCount},(_,i)=>{
              const type=meldCount===4&&i===3?'daiminkan':'pon';
              const size=type==='daiminkan'?4:3;
              const tiles=base.liveWall.slice(tileIndex,tileIndex+size);tileIndex+=size;
              return {type,tiles,calledTileId:tiles[1].id,fromPlayerId:3};
            });
            const game={...base,liveWall:base.liveWall.slice(tileIndex)};
            game.players=base.players.map(player=>player.id===0?{...player,hand:player.hand.slice(0,13-3*meldCount),melds}:player);
            const pool=[...game.liveWall,...game.deadWall];
            return {...game,players:game.players.map((player,id)=>({...player,
              river:pool.slice(id*18,id*18+18),
              riichi:id===2?{declarationTileId:pool[id*18+5].id}:null
            }))};
          });
        }''')
        fixture_results=[]
        for fixture_index, expected_melds in enumerate((1, 4)):
            page.evaluate('''index=>pcTableRenderer.renderTable(pcMeldFixtures[index],[25000,25000,25000,25000])''', fixture_index)
            page.evaluate('''async()=>{
              const {renderTableRoundInfo}=await import('/heibon-mahjong/src/rendering/shared-table-components.ts');
              renderTableRoundInfo(document.querySelector('#local-table .round-label'),document.querySelector('#local-table .wall-count'),{format:'tonnan',roundWind:'south',roundNumber:4,honba:2,liveWallCount:12,deadWallCount:14});
            }''')
            result=inspect_page(page)
            for region in ('header', 'scoreStrip'):
                box=result[region]
                assert box['top'] >= -.5 and box['bottom'] <= height + .5, f'{width}x{height}: fixture {region} is outside viewport: {result}'
            assert result['table']['left'] >= -.5 and result['table']['right'] <= width + .5, f'{width}x{height}: fixture table exceeds viewport: {result}'
            assert result['table']['top'] >= -.5 and result['table']['bottom'] <= height + .5, f'{width}x{height}: fixture table exceeds viewport height: {result}'
            assert result['scoreFontSizes'] and all(14 <= size <= 16 for size in result['scoreFontSizes']), f'{width}x{height}: fixture score labels are too small: {result}'
            assert 14 <= result['centerFontSize'] <= 16 and 14 <= result['roundFontSize'] <= 16, f'{width}x{height}: fixture center text is too small: {result}'
            assert 14 <= result['roundLabelFontSize'] <= 16 and 14 <= result['wallCountFontSize'] <= 16, f'{width}x{height}: fixture center labels are too small: {result}'
            assert result['meldCount'] == expected_melds, f'{width}x{height}: expected {expected_melds} open melds: {result}'
            assert not result['overlaps'], f'{width}x{height}: text overlaps river, dora, meld, or hand tiles: {result}'
            fixture_results.append({'melds': expected_melds, 'tileCount': result['tileCount'], 'textCount': result['textCount'], 'overlaps': result['overlaps']})

        page.evaluate('''()=>{pcResponsiveApp.controller.random=()=>.999999;pcResponsiveApp.controller.newGame()}''')
        hand_tile=page.locator('#player-hand button:enabled').first
        hand_tile.click()
        discard=page.locator('#discard')
        assert discard.is_visible(), f'{width}x{height}: mouse tile selection did not enable discard'
        before_mouse=page.evaluate('''()=>pcResponsiveApp.controller.game.players[pcResponsiveApp.controller.playerSeat].river.length''')
        assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{width}x{height}: mouse flow required scrolling before discard'
        discard.click()
        page.wait_for_function('''previous=>pcResponsiveApp.controller.game.players[pcResponsiveApp.controller.playerSeat].river.length>previous''', arg=before_mouse)

        page.evaluate('''()=>{pcResponsiveApp.controller.random=()=>.999999;pcResponsiveApp.controller.newGame()}''')
        keyboard_tile=page.locator('#player-hand button:enabled').nth(1)
        keyboard_tile.focus()
        keyboard_tile.press('Enter')
        assert keyboard_tile.get_attribute('aria-pressed') == 'true', f'{width}x{height}: Enter did not select a hand tile'
        keyboard_discard=page.locator('#discard')
        focused_discard=False
        for _ in range(24):
            page.keyboard.press('Tab')
            if keyboard_discard.evaluate('element=>document.activeElement===element'):
                focused_discard=True
                break
        assert focused_discard, f'{width}x{height}: Tab did not reach the discard button'
        before_keyboard=page.evaluate('''()=>pcResponsiveApp.controller.game.players[pcResponsiveApp.controller.playerSeat].river.length''')
        page.keyboard.press('Space')
        page.wait_for_function('''previous=>pcResponsiveApp.controller.game.players[pcResponsiveApp.controller.playerSeat].river.length>previous''', arg=before_keyboard)
        assert page.evaluate('document.scrollingElement.scrollTop') <= 1, f'{width}x{height}: keyboard flow unexpectedly scrolled the page'

        normal_board = page.locator('#local-table').bounding_box()
        page.evaluate('pcLoadCalls()')
        page.wait_for_selector('#call-controls:not([hidden])')
        call_start = page.evaluate('''()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),
          panel:document.querySelector('#call-controls').getBoundingClientRect().toJSON(),
          scrollTop:document.scrollingElement.scrollTop,
          panelPosition:getComputedStyle(document.querySelector('#call-controls')).position})''')
        assert normal_board
        assert_same_table(normal_board, call_start['table'], f'{width}x{height} local call decision')
        assert call_start['panelPosition'] == 'relative', f'{width}x{height}: PC call panel is not in document flow: {call_start}'
        assert 0 <= call_start['controls']['top']-call_start['table']['bottom'] <= 8.5, f'{width}x{height}: call controls are not under the table: {call_start}'
        assert 0 <= call_start['panel']['top']-call_start['table']['bottom'] <= 16, f'{width}x{height}: call choices are far from the hand: {call_start}'
        assert call_start['scrollTop'] <= 1, f'{width}x{height}: opening the call panel moved the page: {call_start}'
        for selector in ('#call-chi', '#call-pon', '#pass-calls'):
            assert page.locator(selector).is_visible(), f'{width}x{height}: missing call action {selector}'
        page.locator('#call-chi').click()
        call_candidates = page.locator('#call-options button[data-action-choice="call"]')
        assert call_candidates.count() > 1, f'{width}x{height}: call candidate selection did not expand'
        candidate_metrics = page.evaluate('''()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),
          candidates:[...document.querySelectorAll('#call-options button[data-action-choice="call"]')].map(node=>node.getBoundingClientRect().toJSON()),
          back:document.querySelector('#call-back').getBoundingClientRect().toJSON(),
          scrollTop:document.scrollingElement.scrollTop,scrollHeight:document.scrollingElement.scrollHeight})''')
        assert_same_table(normal_board, candidate_metrics['table'], f'{width}x{height} local candidates')
        assert all(box['width'] >= 44 and box['height'] >= 44 for box in candidate_metrics['candidates']), f'{width}x{height}: a call candidate is too small: {candidate_metrics}'
        assert candidate_metrics['controls']['bottom'] >= candidate_metrics['back']['bottom'], f'{width}x{height}: candidate panel does not expand in flow: {candidate_metrics}'
        assert candidate_metrics['scrollTop'] <= 1, f'{width}x{height}: showing candidates moved the page: {candidate_metrics}'
        page.locator('#call-back').scroll_into_view_if_needed()
        back_hit = page.locator('#call-back').evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))}''')
        assert back_hit, f'{width}x{height}: Back did not become reachable after scrolling'
        page.locator('#call-back').click()
        assert page.locator('#call-options button').count() == 0 and page.locator('#pass-calls').is_visible(), f'{width}x{height}: Back did not restore call types'
        page.locator('#pass-calls').scroll_into_view_if_needed()
        page.locator('#pass-calls').click()
        page.wait_for_function("pcResponsiveApp.controller.game.phase!=='awaiting-call'")
        assert page.locator('#call-controls').is_hidden(), f'{width}x{height}: pass did not end call judgment'
        after_call = page.locator('#local-table').bounding_box()
        assert after_call and abs(after_call['width']-normal_board['width']) < 1 and abs(after_call['height']-normal_board['height']) < 1, f'{width}x{height}: board did not return to the normal size'

        page.evaluate('window.scrollTo(0,0);pcShowDrawResult()')
        page.wait_for_function("pcResponsiveApp.controller.match.status==='round-ended'")
        result_geometry = page.evaluate('''()=>{
          const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
          const button=rect('#next-round');
          return {table:rect('#local-table'),summary:rect('#round-result-summary'),controls:rect('#local-game-controls'),button,
            summaryHidden:document.querySelector('#round-result-summary').hidden,
            buttonHidden:document.querySelector('#next-round').hidden,
            scroll:{top:document.scrollingElement.scrollTop,width:document.scrollingElement.scrollWidth,height:document.scrollingElement.scrollHeight}};
        }''')
        assert_same_table(normal_board, result_geometry['table'], f'{width}x{height} local result')
        assert not result_geometry['summaryHidden'] and not result_geometry['buttonHidden'], f'{width}x{height}: result summary or action is hidden: {result_geometry}'
        assert result_geometry['summary']['top'] >= result_geometry['table']['bottom'], f'{width}x{height}: summary is not below the table: {result_geometry}'
        assert result_geometry['controls']['top'] >= result_geometry['summary']['bottom'], f'{width}x{height}: controls overlap the summary: {result_geometry}'
        assert result_geometry['controls']['height'] < 108, f'{width}x{height}: result controls kept the regular 108px minimum: {result_geometry}'
        assert result_geometry['scroll']['width'] <= width + 1 and result_geometry['scroll']['top'] <= 1, f'{width}x{height}: result created horizontal overflow or moved the page: {result_geometry}'
        assert result_geometry['button']['top'] >= 0 and result_geometry['button']['bottom'] <= height + 1, f'{width}x{height}: compact result actions are not initially visible: {result_geometry}'
        page.evaluate("""()=>{const p=document.createElement('p');p.textContent='長文の結果概要を確認するための追加説明です。 '.repeat(30);document.querySelector('#round-result-summary').append(p)}""")
        long_result = page.evaluate('''()=>({table:document.querySelector('#local-table').getBoundingClientRect().toJSON(),
          summary:document.querySelector('#round-result-summary').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#local-game-controls').getBoundingClientRect().toJSON(),
          next:document.querySelector('#next-round').getBoundingClientRect().toJSON(),
          scroll:{top:document.scrollingElement.scrollTop,width:document.scrollingElement.scrollWidth,height:document.scrollingElement.scrollHeight}})''')
        assert_same_table(normal_board, long_result['table'], f'{width}x{height} long local result')
        assert long_result['summary']['bottom'] <= long_result['controls']['top'], f'{width}x{height}: long result text overlaps controls: {long_result}'
        assert long_result['scroll']['width'] <= width + 1, f'{width}x{height}: long result caused horizontal overflow: {long_result}'
        if long_result['next']['bottom'] > height:
            assert long_result['scroll']['height'] > height, f'{width}x{height}: hidden result action has no page scroll path: {long_result}'
            page.locator('#next-round').scroll_into_view_if_needed()
        next_hit = page.locator('#next-round').evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))}''')
        assert next_hit, f'{width}x{height}: next round was not operable after scrolling when required'
        page.locator('#show-result').scroll_into_view_if_needed()
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), f'{width}x{height}: result detail dialog did not open'
        page.locator('#view-table').click()
        page.locator('#next-round').scroll_into_view_if_needed()
        page.locator('#next-round').click()
        page.wait_for_function("pcResponsiveApp.controller.match.status==='playing'")
        assert page.locator('#round-result-summary').is_hidden(), f'{width}x{height}: next round did not clear the result summary'

        page.evaluate('window.scrollTo(0,0)')
        page.evaluate('''async()=>{
          const {startOnlineGameWithSeatAssignment}=await import('/heibon-mahjong/src/online/game-engine.ts');
          const {createPlayerGameView}=await import('/heibon-mahjong/src/online/game-view.ts');
          const identities=[0,1,2,3].map(seat=>({seat,name:seat?'CPU'+seat:'あなた',control:seat?'cpu':'human',connected:true}));
          const session=startOnlineGameWithSeatAssignment(identities,0,'tonpu',()=>.999999);
          window.pcOnlineSession=session;
          window.pcCreateOnlineView=createPlayerGameView;
          pcOnlineController.receive({type:'game-started',view:createPlayerGameView(session,0,'PCTEST',new Set([0]))});
        }''')
        page.wait_for_selector('#online-player-hand button:enabled')
        page.locator('#online-player-hand button:enabled').first.evaluate('e=>e.click()')
        online_result = assert_pc_layout(page, width, height, f'{width}x{height} online turn', online=True)

        online_board = page.locator('#online-table').bounding_box()
        page.evaluate('''async()=>{
          const game=pcCallStart(3,{0:['23m','444m','50m','6m','789p','12z']},'man-4');
          const pending=pcDiscardTile(game,3,game.players[3].drawnTile.id);
          const onlineGame={...pending,players:pending.players.map((player,seat)=>({...player,control:seat?'cpu':'human'}))};
          const match=(await import('/heibon-mahjong/src/game/match.ts')).startMatch(onlineGame);
          const now=Date.now();
          const session={...pcOnlineSession,gameRevision:2,match,status:'playing',decision:{windowId:'pc-call',type:'call',openedAt:now,expiresAt:now+30000,baseGameRevision:2,requiredSeats:[0],responses:{0:'pending'}}};
          window.pcOnlineCallSession=session;
          pcOnlineController.receive({type:'game-state',view:pcCreateOnlineView(session,0,'PCTEST',new Set([0]))});
        }''')
        page.wait_for_selector('#online-call-controls:not([hidden])')
        online_call = page.evaluate('''()=>({table:document.querySelector('#online-table').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#online-game-controls').getBoundingClientRect().toJSON(),
          panel:document.querySelector('#online-call-controls').getBoundingClientRect().toJSON(),
          position:getComputedStyle(document.querySelector('#online-call-controls')).position,scrollTop:document.scrollingElement.scrollTop})''')
        assert online_board
        assert_same_table(online_board, online_call['table'], f'{width}x{height} online call decision')
        assert online_call['position'] == 'relative' and 0 <= online_call['controls']['top']-online_call['table']['bottom'] <= 8.5, f'{width}x{height}: online call panel is not close to the table: {online_call}'
        page.locator('#online-call-chi').click()
        assert page.locator('#online-call-options button[data-action-choice="call"]').count() > 1
        page.locator('#online-call-back').scroll_into_view_if_needed()
        page.locator('#online-call-back').click()
        assert page.locator('#online-pass-call').is_visible(), f'{width}x{height}: online Back did not restore call choices'
        page.evaluate('''()=>{
          window.pcOnlineSent=[];
          pcOnlineController.setActionSender((action,revision,requestId)=>{pcOnlineSent.push({action,revision,requestId});return true;});
        }''')
        page.locator('#online-pass-call').scroll_into_view_if_needed()
        page.locator('#online-pass-call').click()
        page.wait_for_function("pcOnlineSent.some(item=>item.action.type==='pass-call')")
        page.evaluate('''()=>{
          const normal={...pcOnlineSession,gameRevision:3};
          pcOnlineController.receive({type:'game-state',view:pcCreateOnlineView(normal,0,'PCTEST',new Set([0]))});
        }''')
        page.wait_for_function("document.querySelector('#online-call-controls').hidden")
        online_normal_after_call = page.locator('#online-table').bounding_box()
        assert online_board and online_normal_after_call
        assert_same_table(online_board, online_normal_after_call, f'{width}x{height} online call resolution')

        page.evaluate('''()=>{
          const match=pcMakeDrawMatch();
          const session={...pcOnlineSession,gameRevision:4,match,status:match.status,decision:null};
          window.pcOnlineResultSession=session;
          pcOnlineController.receive({type:'game-state',view:pcCreateOnlineView(session,0,'PCTEST',new Set([0]))});
        }''')
        page.wait_for_function("pcOnlineController && document.querySelector('#online-round-result').hidden===false")
        online_result_geometry = page.evaluate('''()=>({table:document.querySelector('#online-table').getBoundingClientRect().toJSON(),
          summary:document.querySelector('#online-round-result').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#online-game-controls').getBoundingClientRect().toJSON(),
          next:document.querySelector('#online-next-round').getBoundingClientRect().toJSON(),
          scroll:{top:document.scrollingElement.scrollTop,width:document.scrollingElement.scrollWidth,height:document.scrollingElement.scrollHeight}})''')
        assert online_board
        assert_same_table(online_board, online_result_geometry['table'], f'{width}x{height} online result')
        assert online_result_geometry['summary']['top'] >= online_result_geometry['table']['bottom'] and online_result_geometry['controls']['top'] >= online_result_geometry['summary']['bottom'], f'{width}x{height}: online result sections overlap: {online_result_geometry}'
        assert online_result_geometry['controls']['height'] < 108, f'{width}x{height}: online result controls kept the regular 108px minimum: {online_result_geometry}'
        assert online_result_geometry['next']['bottom'] <= height + 1, f'{width}x{height}: online result action is not initially visible: {online_result_geometry}'
        page.evaluate("""()=>{const p=document.createElement('p');p.textContent='長文のオンライン結果概要を確認するための追加説明です。 '.repeat(30);document.querySelector('#online-round-result').append(p)}""")
        online_long = page.evaluate('''()=>({table:document.querySelector('#online-table').getBoundingClientRect().toJSON(),summary:document.querySelector('#online-round-result').getBoundingClientRect().toJSON(),
          controls:document.querySelector('#online-game-controls').getBoundingClientRect().toJSON(),next:document.querySelector('#online-next-round').getBoundingClientRect().toJSON(),
          scroll:{top:document.scrollingElement.scrollTop,width:document.scrollingElement.scrollWidth,height:document.scrollingElement.scrollHeight}})''')
        assert_same_table(online_board, online_long['table'], f'{width}x{height} long online result')
        assert online_long['summary']['bottom'] <= online_long['controls']['top'] and online_long['scroll']['width'] <= width + 1, f'{width}x{height}: online long summary overlaps or overflows: {online_long}'
        if online_long['next']['bottom'] > height:
            assert online_long['scroll']['height'] > height, f'{width}x{height}: online result action has no page scroll path: {online_long}'
        page.locator('#online-show-result').scroll_into_view_if_needed()
        online_detail_hit = page.locator('#online-show-result').evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))}''')
        assert online_detail_hit, f'{width}x{height}: online result details did not become operable after scrolling'
        page.locator('#online-show-result').click()
        assert page.locator('#result-dialog').is_visible(), f'{width}x{height}: online result detail dialog did not open'
        page.locator('#view-table').click()
        page.locator('#online-next-round').scroll_into_view_if_needed()
        online_next_hit = page.locator('#online-next-round').evaluate('''node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===node||node.contains(hit))}''')
        assert online_next_hit, f'{width}x{height}: online next-round action did not become operable after scrolling'
        page.evaluate("""()=>{pcOnlineSent=[];pcOnlineController.setActionSender((action,revision,requestId)=>{pcOnlineSent.push({action,revision,requestId});return true;})}""")
        page.locator('#online-next-round').click()
        page.wait_for_function("pcOnlineSent.some(item=>item.action.type==='next-round')")

        report={'viewport':f'{width}x{height}','browser':ENGINE,'initial':initial,'online':online_result,'resized':resized_result,'restored':restored,'meldFixtures':fixture_results,'localCall':call_start,'localResult':result_geometry,'onlineCall':online_call,'onlineResult':online_result_geometry,'mouse':'passed','keyboard':'passed','result':'passed'}
        reports.append(report)
        print(f'{ENGINE} {width}x{height} PC table, controls, resize, mouse, and keyboard passed')
        page.close()
    browser.close()

report={'browser':ENGINE,'viewports':reports,'result':'passed'}
(out/f'pc-responsive-table-{ENGINE}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
