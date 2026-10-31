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
    page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => { app.controller.random = () => .999999; app.controller.newGame(); })")
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
    page.locator('#diagnostic-close').click()
    assert not page.locator('#diagnostic-dialog').is_visible()

    # Keep a neighboring dialog's close flow covered while exercising the
    # diagnostic header at the smallest supported widths.
    page.locator('#main-menu-toggle').click()
    page.locator('#online-create-open').click()
    assert page.locator('#online-create-dialog').is_visible()
    page.locator('#online-create-close').click()
    assert not page.locator('#online-create-dialog').is_visible()

    cases = [
        {'name': 'empty', 'count': 0, 'message': False, 'longBuild': False},
        {'name': 'multiple', 'count': 8, 'message': False, 'longBuild': False},
        {'name': 'long-build-id', 'count': 8, 'message': False, 'longBuild': True},
        {'name': 'long-messages', 'count': 24, 'message': True, 'longBuild': False},
    ]
    normal_build_info = page.locator('#diagnostic-build-info').inner_text()
    layout_check = """() => {
      const dialog = document.querySelector('#diagnostic-dialog');
      const header = document.querySelector('.diagnostic-header');
      const button = document.querySelector('#diagnostic-close');
      const entries = document.querySelector('#diagnostic-entries');
      const d = dialog.getBoundingClientRect(), h = header.getBoundingClientRect(), b = button.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(button);
      const text = [...range.getClientRects()].map(r => ({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}));
      const style = getComputedStyle(button);
      const innerLeft = d.left + dialog.clientLeft, innerRight = innerLeft + dialog.clientWidth;
      const textLeft = b.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const textRight = b.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      const textTop = b.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
      const textBottom = b.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
      return {
        buttonInside: b.left >= innerLeft - 1 && b.right <= innerRight + 1,
        oneLine: text.length === 1,
        textFits: text.length === 1 && text[0].left >= textLeft - 1 && text[0].right <= textRight + 1 && text[0].top >= textTop - 1 && text[0].bottom <= textBottom + 1,
        headerInside: h.left >= innerLeft - 1 && h.right <= innerRight + 1 && header.scrollWidth <= header.clientWidth,
        dialogNoHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth,
        entriesNoHorizontalOverflow: entries.scrollWidth <= entries.clientWidth,
        documentNoHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        buttonWidth: b.width, textWidth: text[0]?.width ?? 0,
      };
    }"""
    for width in (320, 375, 390, 414):
        page.set_viewport_size({'width': width, 'height': 812})
        for case in cases:
            page.locator('#main-menu-toggle').click()
            page.locator('#menu-diagnostics').click()
            page.evaluate("async ({testCase, normalBuildInfo}) => { const {diagnosticLog} = await import('/heibon-mahjong/src/online/diagnostics.ts'); diagnosticLog.clear(); for(let i=0;i<testCase.count;i++) diagnosticLog.record('WARN', `layout_entry_${i}`, testCase.message ? {errorMessage:'長い診断メッセージ'.repeat(30)} : {requestId:`request-${i}`}); document.querySelector('#diagnostic-build-info').textContent = testCase.longBuild ? `ビルド ${'a'.repeat(128)}` : normalBuildInfo; }", {'testCase': case, 'normalBuildInfo': normal_build_info})
            page.wait_for_function('(expected) => document.querySelector("#diagnostic-count").textContent === `${expected}件`', case['count'])
            result = page.locator('#diagnostic-dialog').evaluate(layout_check)
            assert all(result[key] for key in ('buttonInside', 'oneLine', 'textFits', 'headerInside', 'dialogNoHorizontalOverflow', 'entriesNoHorizontalOverflow', 'documentNoHorizontalOverflow')), {'width': width, 'case': case['name'], **result}
            if case['message']:
                scroll = page.locator('#diagnostic-entries')
                metrics = scroll.evaluate('(el) => ({scrollHeight:el.scrollHeight,clientHeight:el.clientHeight})')
                assert metrics['scrollHeight'] > metrics['clientHeight'], {'width': width, 'case': case['name'], **metrics}
                scroll.evaluate('(el) => { el.scrollTop = el.scrollHeight; }')
                assert scroll.evaluate('(el) => el.scrollTop > 0'), {'width': width, 'case': case['name']}
            page.locator('#diagnostic-close').click()
            assert not page.locator('#diagnostic-dialog').is_visible(), {'width': width, 'case': case['name']}
    assert not errors, errors
    print(json.dumps({'diagnosticsDialog': 'pass', 'viewports': [320, 375, 390, 414], 'cases': [case['name'] for case in cases],
                      'persistentReload': 'pass', 'buildInfo': 'pass', 'copyFallback': 'pass', 'clearConfirmation': 'pass',
                      'diagnosticClose': 'pass', 'onlineDialogClose': 'pass', 'longMessageScroll': 'pass'}, ensure_ascii=False))
    browser.close()
