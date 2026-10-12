"""CPU tsumo Chromium checks. Fixture injection stays entirely in test browser."""
import argparse
import json
import pathlib
import re
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4173/quill-mahjong/')
parser.add_argument('--screenshots', default='docs/screenshots/ui-step9')
options = parser.parse_args()
pathlib.Path(options.screenshots).mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox'])
    for winner in [1, 2, 3]:
        for width, height in [(320,568), (375,667), (390,844), (414,896), (1280,800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def inject(route):
                response = route.fetch()
                source, count = re.subn(r'new GameController\((?:undefined|void 0),',
                    f'new GameController(() => cpuTsumoStart({winner}),', response.text())
                assert count == 1
                source = 'import { cpuTsumoStart } from "/quill-mahjong/tests/cpu-tsumo-fixture.ts";\n' + source
                # Earlier CPUs discard their draw, using a real existing strategy option.
                source = source.replace('onChange: render', 'chooseDiscard: p => p.drawnTile.id, onChange: render')
                route.fulfill(response=response, body=source)
            page.route('**/src/main.ts', inject)
            page.goto(options.url)
            fixture = page.evaluate(f'''async () => {{
                const {{ cpuTsumoStart }} = await import('/quill-mahjong/tests/cpu-tsumo-fixture.ts');
                const g = cpuTsumoStart({winner});
                return {{ hidden: g.players.slice(1).map(p => p.hand.map(t => t.id)),
                    draw: g.liveWall[{winner - 1}].id, live: g.liveWall.length }};
            }}''')
            def public_ids():
                return page.locator('[data-tile-id]').evaluate_all('els => els.map(el => el.dataset.tileId)')
            assert all(tile not in public_ids() for hand in fixture['hidden'] for tile in hand)
            assert page.locator('#win-result').is_hidden()
            own_ids = page.locator('#player-hand li').evaluate_all('els => els.map(el => el.dataset.tileId)')[:-1]
            indicator = page.locator('#dora-indicators').inner_html()
            table_height = page.locator('.rivers').bounding_box()['height']
            page.clock.install()
            page.clock.pause_at(page.evaluate('Date.now()'))
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            page.clock.run_for(winner * 300 - 1)
            assert page.locator('#win-result').is_hidden()
            assert page.locator(f'#label-{winner}').get_attribute('data-active') == 'true'
            page.clock.run_for(1)
            page.wait_for_function('!document.querySelector("#win-result").hidden')
            assert f'CPU{winner}がツモ和了！' in page.locator('#wall-count').inner_text()
            panel = page.locator('#win-result')
            result = panel.inner_text()
            for text in [f'CPU{winner}（{["", "南", "西", "北"][winner]}）', '門前清自摸和 1翻', '平和 1翻',
                         '役合計：2翻', '通常ドラ：1枚（1翻）', '赤ドラ：2枚（2翻）', '合計：5翻', '点数計算は未実装です。']:
                assert text in result, result
            hand = page.locator('.winning-hand li')
            assert hand.count() == 14
            ids = hand.evaluate_all('els => els.map(el => el.dataset.tileId)')
            assert set(ids) == set(fixture['hidden'][winner - 1] + [fixture['draw']])
            assert ids[-1] == fixture['draw']
            assert hand.nth(13).get_attribute('class') == 'winning-draw'
            assert page.locator('.winning-hand button').count() == 0
            assert page.locator('.winning-hand svg[aria-label^="赤"]').count() == 2
            assert page.locator('.winning-hand svg[aria-label]').count() == 14
            assert page.locator(f'.river[data-player-id="{winner}"] svg').count() == 0
            for other in [1, 2, 3]:
                if other != winner:
                    assert all(tile not in public_ids() for tile in fixture['hidden'][other - 1])
                assert page.locator(f'.seat[data-player-id="{other}"] svg').count() == 0
            assert page.locator('#player-hand li').evaluate_all('els => els.map(el => el.dataset.tileId)') == own_ids
            assert page.locator('#player-hand button:enabled').count() == 0
            assert page.locator('#discard').is_disabled() and page.locator('#tsumo').is_disabled()
            assert page.locator('#new-game').is_enabled()
            assert page.locator('#dora-indicators').inner_html() == indicator
            assert page.locator('.rivers').bounding_box()['height'] == table_height
            assert f'生きた牌山 {fixture["live"] - winner}枚' in page.locator('#wall-count').inner_text()
            assert '王牌 14枚' in page.locator('#wall-count').inner_text()
            page.locator('.winning-hand').scroll_into_view_if_needed()
            bounds = [hand.nth(i).bounding_box() for i in range(14)]
            assert len(set(round(b['y'], 1) for b in bounds)) == 1
            assert all(b['x'] >= 0 and b['x'] + b['width'] <= width for b in bounds)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert bounds[-1]['x'] > bounds[-2]['x'] + bounds[-2]['width']
            page.screenshot(path=f'{options.screenshots}/cpu{winner}-{width}-won.png', full_page=True)
            panel.locator('p').last.scroll_into_view_if_needed()
            assert panel.locator('p').last.is_visible()
            snapshot = page.locator('main').inner_html()
            page.clock.run_for(3000)
            assert page.locator('main').inner_html() == snapshot
            # Reduced height models toolbar space without claiming Safari testing.
            page.set_viewport_size({'width': width, 'height': height - 120})
            page.locator('.winning-hand').scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#new-game').click()
            assert page.locator('#win-result').is_hidden()
            assert page.locator('.winning-hand').count() == 0
            assert page.locator('#player-hand li').count() == 14
            assert page.locator('.river svg').count() == 0
            # Reset just before a winning timer finishes, then advance stale time.
            page.locator('.drawn-tile button').click()
            page.locator('#discard').click()
            page.clock.run_for(winner * 300 - 1)
            page.locator('#new-game').click()
            page.clock.run_for(1000)
            assert page.locator('#win-result').is_hidden()
            assert page.locator('.river svg').count() == 0
            assert not errors, errors
            print(json.dumps({'cpu': winner, 'viewport': [width,height], 'win': 'pass', 'privacy': 'pass',
                '300ms': 'pass', 'stop': 'pass', 'layout': 'pass', 'reset': 'pass', 'errors': errors}))
            page.close()
    browser.close()
