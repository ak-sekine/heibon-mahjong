"""Smoke-test the standalone relative-base itch.io output in Chromium/WebKit."""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_ITCH_URL', 'http://127.0.0.1:4175/')
BROWSER_NAME = os.environ.get('HEIBON_BROWSER', 'chromium')

with sync_playwright() as playwright:
    browser = getattr(playwright, BROWSER_NAME).launch()
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    page.add_init_script("""(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = command => {
        if (command !== 'copy') return false;
        window.__copiedDiagnosticText = document.querySelector('textarea')?.value ?? '';
        return true;
      };
    })();""")
    failed_responses = []
    page_errors = []
    page.on('response', lambda response: failed_responses.append((response.status, response.url)) if response.status >= 400 else None)
    page.on('pageerror', lambda error: page_errors.append(str(error)))
    response = page.goto(BASE_URL, wait_until='networkidle')
    assert response and response.status == 200, 'itch package entry point did not load'
    assert page.title() == 'Heibon Mahjong'
    assert page.locator('link[rel="manifest"]').count() == 0, 'itch package still links the Pages PWA manifest'
    assert page.locator('link[rel="apple-touch-icon"]').count() == 0, 'itch package still links the Pages PWA icon'
    assert page.evaluate('''async () => {
      if (!('serviceWorker' in navigator)) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
      return (await navigator.serviceWorker.getRegistrations()).length === 0;
    }'''), 'itch package registered a Service Worker'

    page.locator('#main-menu-toggle').click()
    page.locator('#menu-diagnostics').click()
    assert page.locator('#diagnostic-execution-origin').inner_text() == page.evaluate('location.origin')
    origin_info = page.locator('#diagnostic-origin-info').inner_text()
    assert '配布モード: itch' in origin_info, origin_info
    assert 'iframe内実行: いいえ' in origin_info, origin_info
    assert 'HTTP Request Origin: 未確認' in origin_info
    page.locator('#diagnostic-copy').click()
    assert page.locator('#diagnostic-status').inner_text() == 'コピーしました。'
    copied = page.evaluate('window.__copiedDiagnosticText')
    assert 'Build Mode: itch' in copied
    assert f'Execution Origin: {page.evaluate("location.origin")}' in copied
    assert 'API Origin: https://online-mock.invalid' in copied
    assert 'token=' not in copied and 'participantToken' not in copied
    page.locator('#diagnostic-close').click()

    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    page.locator('#confirm-new-game').click()
    page.wait_for_function("document.querySelectorAll('#player-hand li').length >= 13")
    page.wait_for_function("document.querySelectorAll('#player-hand button:enabled').length > 0", timeout=20000)
    page.locator('#player-hand button:enabled').first.click()
    discard = page.locator('#discard')
    assert discard.is_enabled(), 'discard control did not become available for the selected tile'
    discard.click()
    page.wait_for_function("document.querySelectorAll('.river-bottom svg').length > 0", timeout=10000)
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.wait_for_timeout(100)
    dimensions = page.evaluate('({width: innerWidth, documentWidth: document.documentElement.scrollWidth, height: innerHeight})')
    assert dimensions['documentWidth'] <= dimensions['width'], f'horizontal overflow: {dimensions}'
    assert not failed_responses, f'failed package resources: {failed_responses}'
    assert not page_errors, f'uncaught browser errors: {page_errors}'
    print(f'{BROWSER_NAME}: itch package loaded by relative paths, skipped PWA registration, started CPU play and discarded a tile.')
    browser.close()
