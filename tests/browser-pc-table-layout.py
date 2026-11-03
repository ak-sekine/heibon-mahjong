"""PC table fit, legibility, resize, and input checks for Chromium/WebKit."""
import json
import os
import pathlib
from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
VIEWPORTS = [(1280, 720), (1366, 768), (1440, 900), (1920, 1080)]
reports = []
out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
out.mkdir(parents=True, exist_ok=True)


def inspect_page(page):
    return page.evaluate('''()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const visible=e=>e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
      const header=rect(document.querySelector('main > header'));
      const table=rect(document.querySelector('#local-table'));
      const scoreStrip=rect(document.querySelector('#local-table-summary'));
      const controls=document.querySelector('#local-game-controls');
      const buttons=[...controls.querySelectorAll('.control-action-button')].filter(visible).map(button=>{
        const r=rect(button),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {id:button.id,label:button.textContent.trim(),...r,enabled:!button.disabled,receivesPointer:hit===button||button.contains(hit)};
      });
      const scoreLabels=[...document.querySelectorAll('.score-strip .seat-label')].map(e=>parseFloat(getComputedStyle(e).fontSize));
      const center=document.querySelector('#local-table .center-info');
      const round=document.querySelector('#local-table .round-summary');
      const roundLabel=document.querySelector('#local-table .round-label');
      const wallCount=document.querySelector('#local-table .wall-count');
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
        header,scoreStrip,
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
    }''')


def assert_pc_layout(page, width, height, label):
    result = inspect_page(page)
    for region in ('header', 'scoreStrip'):
        box = result[region]
        assert box['top'] >= -0.5 and box['bottom'] <= height + 0.5, f'{label}: {region} is outside the initial viewport: {result}'
    table = result['table']
    assert table['left'] >= -0.5 and table['right'] <= width + 0.5, f'{label}: table is outside viewport width: {result}'
    assert table['top'] >= -0.5 and table['bottom'] <= height + 0.5, f'{label}: table is outside viewport height: {result}'
    assert result['scroll']['width'] <= width + 1, f'{label}: horizontal page overflow: {result}'
    assert result['scroll']['height'] <= height + 1, f'{label}: vertical page overflow before scrolling: {result}'
    assert result['scroll']['top'] <= 1, f'{label}: page scrolled before initial-view checks: {result}'
    assert result['scoreFontSizes'] and all(14 <= size <= 16 for size in result['scoreFontSizes']), f'{label}: player/score text is outside 14–16px: {result}'
    assert 14 <= result['centerFontSize'] <= 16, f'{label}: center information is outside 14–16px: {result}'
    assert 14 <= result['roundFontSize'] <= 16, f'{label}: round information is outside 14–16px: {result}'
    assert 14 <= result['roundLabelFontSize'] <= 16, f'{label}: round label is outside 14–16px: {result}'
    assert 14 <= result['wallCountFontSize'] <= 16, f'{label}: remaining-wall count is outside 14–16px: {result}'
    assert result['textCount'] >= 5 and result['tileCount'] > 0, f'{label}: expected visible seat, round, and tile content: {result}'
    assert not result['overlaps'], f'{label}: text overlaps a tile, river, dora, or meld: {result}'
    discard = next((button for button in result['visibleActionButtons'] if button['id'] == 'discard'), None)
    assert discard and discard['enabled'] and discard['receivesPointer'], f'{label}: discard is not operable without scrolling: {result}'
    for button in result['visibleActionButtons']:
        assert button['top'] >= 0 and button['bottom'] <= height, f'{label}: visible action button is outside initial viewport: {result}'
        assert button['width'] >= 44 and button['height'] >= 44, f'{label}: visible action button is too small: {result}'
        assert button['receivesPointer'], f'{label}: visible action button is covered: {result}'
    return result


with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    for width, height in VIEWPORTS:
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.goto('http://localhost:4173/heibon-mahjong/')
        page.evaluate('''async()=>{
          const app=await import('/heibon-mahjong/src/main.ts');
          window.pcResponsiveApp=app;
          app.controller.random=()=>.999999;
          app.controller.newGame();
        }''')
        page.wait_for_selector('#player-hand button:enabled')
        page.locator('#player-hand button:enabled').first.click()
        page.locator('#discard').wait_for(state='visible')
        initial = assert_pc_layout(page, width, height, f'{width}x{height} initial turn')
        page.screenshot(path=str(out / f'pc-table-{ENGINE}-{width}x{height}.png'))

        resized = {'width': width - 160, 'height': height - 80}
        page.set_viewport_size(resized)
        resized_result = assert_pc_layout(page, resized['width'], resized['height'], f'{width}x{height} resized to {resized}')
        page.set_viewport_size({'width': width, 'height': height})
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

        report={'viewport':f'{width}x{height}','browser':ENGINE,'initial':initial,'resized':resized_result,'restored':restored,'meldFixtures':fixture_results,'mouse':'passed','keyboard':'passed','result':'passed'}
        reports.append(report)
        print(f'{ENGINE} {width}x{height} PC table, controls, resize, mouse, and keyboard passed')
        page.close()
    browser.close()

report={'browser':ENGINE,'viewports':reports,'result':'passed'}
(out/f'pc-responsive-table-{ENGINE}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
