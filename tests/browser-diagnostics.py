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
    page.add_init_script("""(() => {
      try {
        if (location.origin !== 'null' && sessionStorage.getItem('heibon-mahjong-diagnostics-seeded') !== '1') {
          localStorage.setItem('heibon-mahjong-diagnostics-v2', SEED_JSON);
          sessionStorage.setItem('heibon-mahjong-diagnostics-seeded', '1');
        }
      } catch {}
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      document.execCommand = command => {
        if (command !== 'copy') return false;
        window.__copiedDiagnosticText = document.querySelector('textarea')?.value ?? '';
        return true;
      };
    })();""".replace('SEED_JSON', json.dumps(json.dumps(seed))))
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base)
    page.reload()
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function("localStorage.getItem('heibon-mahjong-diagnostics-v2')?.includes('local_runner_resume_snapshot') === true")
    page.locator('#main-menu-toggle').click()
    page.locator('#menu-diagnostics').click()
    assert page.locator('#diagnostic-dialog').is_visible()
    build_info = page.locator('#diagnostic-build-info').inner_text()
    assert 'schema 2' in build_info and 'unknown' not in build_info, build_info
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
    assert 'app_build_info' in page.evaluate('window.__copiedDiagnosticText')
    assert 'local_game_render_succeeded' in page.evaluate('window.__copiedDiagnosticText')
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#diagnostic-clear').click()
    assert page.locator('#diagnostic-count').inner_text() == '0件'
    assert not errors, errors
    print(json.dumps({'diagnosticsDialog': 'pass', 'viewport': '375x812', 'persistentReload': 'pass', 'buildInfo': 'pass',
                      'copyFallback': 'pass', 'clearConfirmation': 'pass'}, ensure_ascii=False))
    browser.close()
