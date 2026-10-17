"""Step 10 Chromium: real fixed walls, test-only source injection, no production hooks."""
import argparse
import json
import pathlib
import re
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/heibon-mahjong/')
parser.add_argument('--screenshots', default='docs/screenshots/ui-step10')
args = parser.parse_args()
pathlib.Path(args.screenshots).mkdir(parents=True, exist_ok=True)
scenarios = [
    ('human',1,[0],False), ('pass',1,[0],False), ('furiten',1,[0],True),
    ('cpu1',0,[1],False), ('cpu2',1,[2],False), ('cpu3',2,[3],False),
    ('double',1,[0,2],False), ('triple',1,[0,2,3],False),
    ('pass-cpu',1,[0,2],False), ('cpu-triple',0,[1,2,3],False),
    ('no-yaku',1,[0],False),
]

def geometry(page, pending=False):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    hand = page.locator('#player-hand')
    boxes = hand.locator('li').evaluate_all('els=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})')
    assert len(set(round(b['y'],1) for b in boxes)) == 1
    assert all(b['x'] >= 0 and b['x']+b['w'] <= page.viewport_size['width'] for b in boxes)
    control = page.locator('.discard-controls').bounding_box()
    assert max(b['y']+b['h'] for b in boxes) <= control['y'] + .5, (page.viewport_size, boxes, control, page.evaluate('ronCheck()'))
    assert page.locator('.dora-slot').count() == 5
    assert page.locator('.dora-slot svg').count() == 1
    assert page.locator('#dora-indicators').evaluate('el => getComputedStyle(el).gridTemplateColumns.split(" ").length') == 5
    assert page.locator('.river-tile').evaluate_all('els=>els.every(e=>e.getBoundingClientRect().width>=18.9 && e.getBoundingClientRect().height>=18.9)')
    if pending:
        for selector in ['#ron','#pass-ron']:
            assert page.locator(selector).bounding_box()['height'] >= 44
            assert page.locator(selector).evaluate('el=>{let r=el.getBoundingClientRect();let hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el}')

def privacy(page, fixture, winners):
    ids = page.locator('[data-tile-id]').evaluate_all('els=>els.map(el=>el.dataset.tileId)')
    # Check complete DOM serialization as well as public physical-ID attributes.
    html = page.locator('main').inner_html()
    for player in fixture['players'][1:]:
        if player['id'] not in winners:
            for tile in player['hand']:
                assert tile not in ids and tile not in html, (player['id'],tile)
    for tile in fixture['dead']:
        if tile != fixture['indicator']:
            assert tile not in ids and tile not in html

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'),args=['--no-sandbox'])
    reports = []
    for width,height in [(320,568),(375,667),(390,844),(414,896),(1280,800)]:
        for name,discarder,winners,furiten in scenarios:
            page = browser.new_page(viewport={'width':width,'height':height})
            errors = []
            page.on('pageerror',lambda error: errors.append(str(error)))
            def inject(route):
                response = route.fetch()
                if name == 'no-yaku':
                    fixture = "ronStart(1,[0],[['123m','456m','789p','456s','2p']],'pin-2',false,'pin-1',true)"
                else:
                    fixture = f"ronStart({discarder},{json.dumps(winners)},undefined,'sou-5',true,'sou-4',true)"
                if furiten:
                    fixture = f"withRiverTile({fixture},0,'sou-2')"
                source,count = re.subn(r'new GameController\((?:undefined|void 0),',f'new GameController(() => {fixture},',response.text())
                assert count == 1
                source = 'import { ronStart, withRiverTile } from "/heibon-mahjong/tests/ron-fixture.ts";\n' + source
                source = source.replace('onChange: render','chooseDiscard: p => p.drawnTile.id, onChange: render')
                source += '''\nwindow.ronCheck = () => ({phase:controller.game.phase, running:controller.progressing,
                  temporary:controller.game.players[0].temporaryFuriten, live:controller.game.liveWall.length,
                  winners:controller.game.winResult?.winners?.map(w=>w.winnerId)??[],
                  tile:controller.game.winResult?.winningTileId,
                  players:controller.game.players.map(p=>({id:p.id,hand:p.hand.map(t=>t.id)})),
                  dead:controller.game.deadWall.map(t=>t.id),indicator:controller.game.deadWall[4].id});'''
                route.fulfill(response=response,body=source)
            page.route('**/src/main.ts',inject)
            page.goto(args.url)
            initial = page.evaluate('ronCheck()')
            assert page.locator('#player-hand li').count() == 14
            assert page.locator('#ron').is_hidden()
            privacy(page,initial,[])
            geometry(page)
            indicator = page.locator('#dora-indicators').inner_html()
            river_height = page.locator('.river-top').bounding_box()['height']
            page.clock.install()
            page.clock.pause_at(page.evaluate('Date.now()'))
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            if discarder:
                page.clock.run_for(discarder*300-1)
                assert page.locator('#ron').is_hidden()
                assert page.locator('#win-result').is_hidden()
                page.clock.run_for(1)
            pending = 0 in winners and not furiten and name != 'no-yaku'
            if pending:
                page.wait_for_function('ronCheck().phase === "awaiting-ron" && !ronCheck().running')
                assert page.locator('#ron-controls').is_visible()
                assert page.locator('#ron').is_enabled() and page.locator('#pass-ron').is_enabled()
                assert 'CPU1' in page.locator('#ron-status').inner_text()
                assert '赤5索' in page.locator('#ron-status').inner_text()
                assert page.locator('#ron-controls').get_attribute('aria-labelledby') == 'ron-status'
                assert page.locator('#ron-target svg').count() == 1
                assert page.evaluate('document.activeElement.id') == 'ron'
                assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
                assert page.locator('#player-hand button:enabled').count() == 0
                before = page.evaluate('ronCheck()')
                page.clock.run_for(1200)
                assert page.evaluate('ronCheck()') == before
                privacy(page,initial,[])
                page.locator('#ron').scroll_into_view_if_needed()
                geometry(page,True)
                page.screenshot(path=f'{args.screenshots}/{width}-{name}-waiting.png',full_page=True)
                # Reduced height verifies actual hit targets and no hand overlap, before decision.
                page.set_viewport_size({'width':width,'height':height-120})
                page.locator('#ron').scroll_into_view_if_needed()
                geometry(page,True)
                page.screenshot(path=f'{args.screenshots}/{width}-{name}-short.png',full_page=True)
                if name in ['pass','pass-cpu']:
                    page.locator('#pass-ron').focus()
                    page.locator('#pass-ron').press('Enter')
                    if name == 'pass':
                        assert page.evaluate('ronCheck().temporary')
                        page.clock.run_for(299)
                        assert page.evaluate('ronCheck().temporary')
                        page.clock.run_for(301)
                        page.wait_for_function('ronCheck().phase === "awaiting-discard" && !ronCheck().running')
                        assert not page.evaluate('ronCheck().temporary')
                        assert page.locator('#player-hand li').count() == 14
                        assert page.locator('#ron').is_hidden() and page.locator('#win-result').is_hidden()
                        privacy(page,initial,[])
                    else:
                        page.wait_for_function('ronCheck().phase === "won"')
                else:
                    page.locator('#ron').press('Enter')
                    page.wait_for_function('ronCheck().phase === "won"')
            elif furiten or name == 'no-yaku':
                assert page.locator('#ron').is_hidden()
                assert page.evaluate('ronCheck().phase') != 'awaiting-ron'
                page.clock.run_for((3-discarder)*300)
                assert page.locator('#win-result').is_hidden()
                privacy(page,initial,[])
            else:
                page.wait_for_function('ronCheck().phase === "won"')
            state = page.evaluate('ronCheck()')
            final_winners = state['winners']
            if state['phase'] == 'won':
                expected = [id for id in [(discarder+i)%4 for i in [1,2,3]] if id in winners and not (name=='pass-cpu' and id==0)]
                assert final_winners == expected
                assert not state['running']
                assert page.locator('.winner-result').count() == len(expected)
                assert 'ロン和了！' in page.locator('#wall-count').inner_text()
                assert f'放銃：{["自分","CPU1","CPU2","CPU3"][discarder]}' in page.locator('#wall-count').inner_text()
                for winner in expected:
                    section = page.locator(f'.winner-result[data-winner-id="{winner}"]')
                    tiles = section.locator('.winning-hand li')
                    assert tiles.count() == 14
                    assert tiles.nth(13).get_attribute('data-tile-id') == state['tile']
                    assert set(tiles.evaluate_all('els=>els.map(e=>e.dataset.tileId)')[:-1]) == set(initial['players'][winner]['hand'])
                    assert section.locator('.winning-hand svg[aria-label="赤5索"]').count() == 1
                    text = section.inner_text()
                    for label in ['平和 1翻','役合計：1翻','通常ドラ：1枚（1翻）','赤ドラ：1枚（1翻）','合計：3翻','獲得点数：']:
                        assert label in text, text
                    assert '門前清自摸和' not in text
                    section.scroll_into_view_if_needed()
                    bounds = tiles.evaluate_all('els=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}})')
                    assert len(set(round(b['y'],1) for b in bounds)) == 1
                    assert all(b['x']>=0 and b['x']+b['w']<=width for b in bounds)
                    assert bounds[-1]['x'] > bounds[-2]['x']+bounds[-2]['w']
                assert page.locator('#ron').is_hidden()
                assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
                assert page.locator('#player-hand button:enabled').count() == 0
                snapshot = page.locator('main').inner_html()
                page.clock.run_for(3000)
                assert page.locator('main').inner_html() == snapshot
                assert page.evaluate('ronCheck().live') == state['live']
                privacy(page,initial,final_winners)
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('window.scrollTo(0,0)')
            geometry(page)
            assert page.locator('#dora-indicators').inner_html() == indicator
            assert page.locator('.river-top').bounding_box()['height'] == river_height, (name,width,river_height,page.locator('.river-top').bounding_box()['height'],page.locator('.center-info').inner_text())
            page.screenshot(path=f'{args.screenshots}/{width}-{name}-result.png',full_page=True)
            page.set_viewport_size({'width':width,'height':height-120})
            if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
            page.locator('#new-game').click();page.locator('#confirm-new-game').click()
            assert page.locator('#player-hand li').count() == 14
            assert page.locator('#ron').is_hidden() and page.locator('#win-result').is_hidden()
            page.clock.run_for(1200)
            assert page.evaluate('ronCheck().phase') == 'awaiting-discard'
            # Reset during declaration pending or just before CPU completion, then advance stale timers.
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            if discarder:
                page.clock.run_for(discarder*300 if pending else discarder*300-1)
            if page.locator('#result-dialog').is_visible(): page.locator('#view-table').click()
            page.locator('#new-game').click();page.locator('#confirm-new-game').click()
            page.clock.run_for(1200)
            assert page.evaluate('ronCheck().phase') == 'awaiting-discard'
            assert page.locator('#win-result').is_hidden() and page.locator('#ron').is_hidden()
            privacy(page,initial,[])
            assert not errors, errors
            reports.append({'scenario':name,'viewport':[width,height],'shortHeight':height-120,'result':'pass'})
            print(json.dumps(reports[-1]))
            page.close()
    browser.close()
pathlib.Path(args.screenshots,'report.json').write_text(json.dumps(reports,indent=2)+'\n')
