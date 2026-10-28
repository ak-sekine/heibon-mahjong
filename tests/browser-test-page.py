import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
errors = []
with sync_playwright() as playwright:
    browser_type = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + 'test.html')
    assert page.locator('.test-badge').inner_text() == 'TEST'
    assert page.locator('#tile-gallery, .catalog').count() == 0, 'development tile catalog is present on test page'
    assert page.get_by_text('開発用：全34種類と赤5を見る').count() == 0, 'development tile catalog remains reachable on test page'
    assert page.locator('#player-hand button').count() == 14
    assert page.locator('.concealed-hand .revealed-tile').count() == 0
    assert page.locator('#kyuushu-kyuuhai').is_visible()
    expected_order = ['1萬', '2萬', '3萬', '4萬', '9萬', '1筒', '2筒', '3筒', '9筒', '1索', '9索', '東', '南', '西']

    def assert_fixed_hand(selector, scenario, width):
        layout = page.locator(selector).evaluate('''hand => {
          const own = hand.id === 'player-hand';
          const slots = [...hand.children];
          const faces = own ? slots.map(slot => slot.querySelector('.revealed-tile')) : slots;
          const style = getComputedStyle(hand);
          const slotSizes = slots.map(slot => getComputedStyle(slot).width);
          const faceSizes = faces.map(face => {
            const tile = face.querySelector('.tile-svg');
            const css = getComputedStyle(face);
            return { width: css.width, height: css.height, flexShrink: css.flexShrink,
              svgWidth: getComputedStyle(tile).width, svgHeight: getComputedStyle(tile).height };
          });
          return { count: faces.length, gap: style.columnGap, justifyContent: style.justifyContent,
            flexDirection: style.flexDirection, width: style.width, clientWidth: hand.clientWidth,
            scrollWidth: hand.scrollWidth, slotSizes, slotShrink: slots.map(slot => getComputedStyle(slot).flexShrink), faceSizes };
        }''')
        assert layout['count'] == 14, (scenario, width, layout)
        assert layout['gap'] == '1px', (scenario, width, layout)
        assert len(set(layout['slotSizes'])) == 1 and set(layout['slotShrink']) == {'0'}, (scenario, width, layout)
        assert len({(face['width'], face['height'], face['svgWidth'], face['svgHeight']) for face in layout['faceSizes']}) == 1, (scenario, width, layout)
        assert all(face['flexShrink'] == '0' for face in layout['faceSizes']), (scenario, width, layout)
        assert layout['clientWidth'] == layout['scrollWidth'], (scenario, width, layout)

    page.locator('#repeat-scenario').click()
    assert page.locator('#player-hand button').count() == 14, 'repeat did not restore the same initial hand'
    page.locator('#kyuushu-kyuuhai').click()
    page.wait_for_function("document.querySelector('#round-result-summary').innerText.includes('九種九牌')")
    assert page.locator('.revealed-tile').count() == 14, 'human declaration must reveal 14 tiles'
    assert page.locator('#player-hand .tile-svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))') == expected_order
    for seat in range(1, 4):
        assert page.locator(f'.concealed-hand[data-player-id="{seat}"] .revealed-tile').count() == 0
    for width in [320, 375, 390, 430]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), ('kyuushu-self', width, 'horizontal overflow')
        assert_fixed_hand('#player-hand', 'kyuushu-self', width)
    page.locator('#show-result').click()
    assert page.locator('#result-title').inner_text() == '途中流局（九種九牌）'
    assert page.locator('#match-result .winning-hand li').count() == 14
    assert page.locator('#match-result').inner_text().find('宣言者：自分') >= 0
    assert page.locator('#match-result .winning-hand svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))') == expected_order
    page.locator('#view-table').click()
    page.locator('#show-result').click()
    assert page.locator('#result-dialog').is_visible(), 'human result did not reopen'
    page.locator('#view-table').click()
    page.locator('#next-round').click()
    page.wait_for_function("document.querySelector('#round-result-summary').hidden")
    assert page.locator('.revealed-tile').count() == 0, 'next round retained the human public hand'

    cases = [('kyuushu-cpu1', 1, 'CPU1'), ('kyuushu-cpu2', 2, 'CPU2'),
             ('kyuushu-cpu3', 3, 'CPU3')]
    for scenario, seat, name in cases:
        page.locator('#scenario').select_option(scenario)
        page.locator('#load-scenario').click()
        page.wait_for_function("document.querySelector('#test-status').innerText.includes('CPUの第一ツモ処理を実行中')")
        assert page.locator('.revealed-tile').count() == 0, scenario + ': concealed hand exposed before declaration'
        page.wait_for_function('''seat => document.querySelectorAll('.revealed-tile').length === 14 &&
            document.querySelector('#round-result-summary').innerText.includes('九種九牌')''', arg=seat)
        assert page.locator('.revealed-tile').count() == 14, scenario
        for other_seat in range(1, 4):
            if other_seat != seat:
                assert page.locator(f'.concealed-hand[data-player-id="{other_seat}"] .revealed-tile').count() == 0, scenario
        declarer_selector = '#player-hand' if seat == 0 else f'.concealed-hand[data-player-id="{seat}"]'
        labels = page.locator(f'{declarer_selector} .tile-svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))')
        assert labels == expected_order, (scenario, 'table tile order', labels)
        for width in [320, 375, 390, 430]:
            page.set_viewport_size({'width': width, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (scenario, width, 'horizontal overflow')
            assert_fixed_hand(f'.concealed-hand[data-player-id="{seat}"]', scenario, width)
            assert page.locator('.test-actions button').first.evaluate('(el) => el.getBoundingClientRect().height >= 44'), (scenario, width, 'small tap target')
        page.locator('#show-result').click()
        assert page.locator('#result-title').inner_text() == '途中流局（九種九牌）'
        assert page.locator('#match-result .winning-hand li').count() == 14, scenario
        result_order = page.locator('#match-result .winning-hand svg').evaluate_all('(tiles) => tiles.map(tile => tile.getAttribute("aria-label"))')
        assert result_order == expected_order, (scenario, 'result tile order', result_order)
        details = page.locator('#match-result').inner_text()
        assert f'宣言者：{name}' in details, details
        page.locator('#view-table').click()
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), scenario
        page.locator('#view-table').click()
        page.locator('#next-round').click()
        page.wait_for_function("document.querySelector('#round-result-summary').hidden")
        assert page.locator('.revealed-tile').count() == 0, scenario

    page.goto(base)
    assert page.locator('.test-lab, #scenario, .test-badge').count() == 0, 'test controls leaked to regular entry'
    assert page.locator('#tile-gallery, .catalog').count() == 0, 'development tile catalog is present on regular entry'
    page.locator('#main-menu-toggle').click()
    assert page.get_by_role('button', name='牌表示確認').count() == 0, 'tile preview menu item is present'
    assert page.get_by_text('開発用：全34種類と赤5を見る').count() == 0, 'development tile catalog remains reachable'
    page.goto(base + 'kan-test.html')
    assert page.locator('#scenario option').count() == 6, 'kan verification page changed'
    assert page.locator('#tile-gallery, .catalog').count() == 0, 'development tile catalog is present on kan verification page'
    assert not errors, errors
    print(json.dumps({'testPage': 'pass', 'scenarios': ['kyuushu-self', *[case[0] for case in cases]],
                      'widths': [320, 375, 390, 430], 'regularPageIsolation': 'pass',
                      'kanPage': 'pass'}, ensure_ascii=False))
    browser.close()
