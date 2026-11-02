"""Verify the application starts idle and offline play only starts on request."""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_PRODUCTION_URL', 'http://127.0.0.1:4174/heibon-mahjong/')

with sync_playwright() as playwright:
    browser = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium')).launch()
    page = browser.new_page(viewport={'width': 320, 'height': 700}, device_scale_factor=1)
    page.goto(BASE_URL, wait_until='networkidle')

    def assert_waiting(label):
        assert page.locator('body').get_attribute('data-game-mode') == 'none', f'{label}: app mode is not none'
        assert page.locator('#app-idle').is_visible(), f'{label}: idle state is not visible'
        assert ' '.join(page.locator('#app-idle').inner_text().split()) == '対局待機中 メニューから対局を開始してください'
        assert page.locator('#local-table').is_hidden(), f'{label}: offline table is visible'
        assert page.locator('#local-game-controls').is_hidden(), f'{label}: offline operation controls are visible'
        assert page.locator('#local-game-controls button:visible').count() == 0
        width = page.evaluate('({viewport: innerWidth, document: document.documentElement.scrollWidth})')
        assert width['document'] <= width['viewport'], f'{label}: horizontal overflow at 320px: {width}'

    assert_waiting('first load')
    page.reload(wait_until='networkidle')
    assert_waiting('reload')

    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    assert page.locator('#new-game-dialog #new-game-rules-editor').is_visible()
    assert page.locator('#rule-settings-dialog').count() == 0
    assert page.locator('input[name="new-game-rules-editor-match-format"][value="tonpu"]').is_checked()
    page.locator('input[name="new-game-rules-editor-match-format"][value="tonnan"]').check()
    page.locator('#confirm-new-game').click()
    page.locator('#local-table').wait_for(state='visible')
    assert page.locator('body').get_attribute('data-game-mode') == 'offline'
    assert page.locator('#table-round').inner_text() == '東1局'
    assert page.locator('#table-round').get_attribute('aria-label') == '東1局'
    assert page.locator('#table-round').get_attribute('data-format-label') is None
    assert '東風戦' not in page.locator('#local-table .center-info').inner_text()
    assert page.locator('#player-hand li').count() in (13, 14)
    page.locator('#main-menu-toggle').click()
    page.locator('#menu-offline-rules').click()
    assert page.locator('#online-rules-list dd').first.inner_text() == '半荘戦（東南戦）'
    page.locator('#online-rules-close').click()

    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    page.locator('input[name="new-game-rules-editor-match-format"][value="tonnan"]').check()
    page.locator('#confirm-new-game').click()
    assert page.locator('body').get_attribute('data-game-mode') == 'offline'
    assert page.locator('#table-round').inner_text() == '東1局'
    assert page.locator('#table-round').get_attribute('aria-label') == '東1局'
    assert page.locator('#table-round').get_attribute('data-format-label') is None
    assert '半荘戦' not in page.locator('#local-table .center-info').inner_text()
    assert page.locator('#player-hand li').count() in (13, 14)
    saved = page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-last-rules'))")
    assert saved['version'] == 3 and saved['rules']['matchFormat'] == 'tonnan', saved
    assert all(saved['rules'][key] is True for key in ['redDora', 'kuitan', 'uraDora', 'ippatsu', 'kanDora', 'dealerTenpaiRenchan', 'kyuushuKyuuhai', 'fourWinds', 'fourRiichi', 'fourKans']), saved
    assert all(saved['rules'][key] is False for key in ['agariYame', 'tenpaiYame']), saved
    page.locator('#main-menu-toggle').click()
    page.locator('#menu-offline-rules').click()
    assert page.locator('#online-rules-list dd').first.inner_text() == '半荘戦（東南戦）'
    page.locator('#online-rules-close').click()
    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    assert page.locator('input[name="new-game-rules-editor-match-format"][value="tonnan"]').is_checked()
    page.locator('input[name="new-game-rules-editor-match-format"][value="tonpu"]').check()
    page.locator('#cancel-new-game').click()
    assert page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-last-rules')).rules.matchFormat === 'tonnan'")
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'cancel did not restore focus to the menu button'
    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    assert page.locator('input[name="new-game-rules-editor-match-format"][value="tonnan"]').is_checked(), 'last started rules were not restored'
    page.locator('#cancel-new-game').click()
    print('Initial load and reload stay idle at 320px; confirmed Tonpu/Tonnan settings, cancel, and restoration work in Chromium/WebKit.')
    browser.close()
