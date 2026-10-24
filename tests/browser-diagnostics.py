"""Mobile diagnostics dialog, persisted log, and Safari clipboard fallback."""
import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
seed = [{'timestamp': '2026-10-24T12:34:56.789Z', 'level': 'WARN', 'event': 'game_action_response_timeout',
         'details': {'actionType': 'discard', 'requestId': 'request-example', 'gameRevision': 42, 'durationMs': 15000}}]
with sync_playwright() as playwright:
    browser_type = getattr(playwright, os.environ.get('HEIBON_BROWSER', 'chromium'))
    browser = browser_type.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812}, is_mobile=True, has_touch=True)
    page.add_init_script("""() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = command => {
        if (command !== 'copy') return false;
        window.__copiedDiagnosticText = document.activeElement?.value ?? '';
        return true;
      };
    }""")
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base)
    page.evaluate("seed => sessionStorage.setItem('heibon-mahjong-diagnostics-v1', JSON.stringify(seed))", seed)
    page.reload()
    page.locator('#main-menu-toggle').click()
    page.locator('#menu-diagnostics').click()
    assert page.locator('#diagnostic-dialog').is_visible()
    assert page.locator('#diagnostic-count').inner_text().endswith('件')
    assert 'game_action_response_timeout' in page.locator('#diagnostic-entries').inner_text()
    assert '2026/10/24 21:34:56.789' in page.locator('#diagnostic-entries').inner_text(), page.locator('#diagnostic-entries').inner_text()
    box = page.locator('#diagnostic-dialog').bounding_box()
    assert box and box['width'] <= 375 and box['height'] <= 812, box
    scroll = page.locator('#diagnostic-entries').evaluate('(el) => getComputedStyle(el).overflowY')
    assert scroll in ('auto', 'scroll'), scroll
    page.locator('#diagnostic-copy').click()
    assert page.locator('#diagnostic-status').inner_text() == 'コピーしました。'
    assert 'request-example' in page.evaluate('window.__copiedDiagnosticText')
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#diagnostic-clear').click()
    assert page.locator('#diagnostic-count').inner_text() == '0件'
    assert not errors, errors
    print(json.dumps({'diagnosticsDialog': 'pass', 'viewport': '375x812', 'sessionReload': 'pass',
                      'copyFallback': 'pass', 'clearConfirmation': 'pass'}, ensure_ascii=False))
    browser.close()
