"""Read-only active offline rules, state isolation, CPU waits, and small screens."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_main_fixtures import fixed_seat_fixture

BASE_URL = os.environ.get('HEIBON_BASE_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
OUT = Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'offline-rules'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = getattr(playwright, ENGINE).launch()
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def controlled_main(route):
        response = route.fetch()
        source = fixed_seat_fixture(response.text(), '''(milliseconds, signal) => new Promise(resolve => {
          window.rulesCpuWait = { signal, resolve };
          signal.addEventListener('abort', resolve, { once: true });
        })''')
        route.fulfill(response=response, body=source)

    page.route('**/src/main.ts', controlled_main)
    page.goto(BASE_URL, wait_until='networkidle')
    page.evaluate('''async () => {
      window.rulesApp = await import('/heibon-mahjong/src/main.ts');
      window.rulesModel = await import('/heibon-mahjong/src/model/rules.ts');
      window.rulesMatches = await import('/heibon-mahjong/src/game/match.ts');
      window.rulesFixtures = await import('/heibon-mahjong/tests/match-fixture.ts');
    }''')
    assert page.locator('#menu-offline-rules').is_hidden(), 'rules offered without an active match'

    def capture_state():
        page.evaluate('''() => {
          const c = window.rulesApp.controller, d = c.diagnosticSnapshot();
          window.rulesBefore = { match: c.match, json: JSON.stringify(c.match), selected: c.selectedTileId,
            progressing: c.progressing, turn: d.cpuTurnId, stage: d.currentStage, wait: window.rulesCpuWait,
            saved: localStorage.getItem('heibon-mahjong-last-rules') };
        }''')

    def assert_same_state():
        result = page.evaluate('''() => {
          const c = window.rulesApp.controller, b = window.rulesBefore, d = c.diagnosticSnapshot();
          return { sameMatch: c.match === b.match, sameState: JSON.stringify(c.match) === b.json,
            sameSelection: c.selectedTileId === b.selected, sameRunner: c.progressing === b.progressing,
            sameTurn: d.cpuTurnId === b.turn, sameStage: d.currentStage === b.stage,
            sameWait: window.rulesCpuWait === b.wait && (!b.wait || !b.wait.signal.aborted),
            sameSaved: localStorage.getItem('heibon-mahjong-last-rules') === b.saved };
        }''')
        assert all(result.values()), result

    def open_rules(expected):
        page.locator('#main-menu-toggle').click()
        page.locator('#menu-offline-rules').click()
        assert page.locator('#main-menu-items').is_hidden()
        assert page.locator('#online-rules-dialog').evaluate('dialog => dialog.open')
        assert page.locator('#online-rules-list dd').first.inner_text() == expected
        assert page.locator('#online-rules-list').get_attribute('aria-label') == '現在の対局で確定したルール'
        assert page.locator('#online-rules-readonly-label').inner_text() == '読み取り専用：現在の対局開始時に確定したルール'
        assert page.locator('#online-rules-dialog input, #online-rules-dialog select, #online-rules-dialog textarea, #online-rules-dialog [contenteditable], #online-rules-dialog button:not(#online-rules-close)').count() == 0
        assert page.locator('#online-rules-list dt').all_text_contents() == [
            '対局形式', '赤ドラ', '喰いタン', '和了条件', '後付け', 'リーチ・一発',
            '裏ドラ', 'カンドラ', '通常流局', '途中流局', '連荘', '対局終了',
        ]
        assert page.evaluate('''() => {
          const expected = window.rulesModel.describeConfirmedRules(window.rulesModel.rulesForMatch(window.rulesApp.controller.match));
          return [...document.querySelectorAll('#online-rules-list .confirmed-rule-row')].every((row, i) =>
            row.querySelector('dt').textContent === expected[i].label && row.querySelector('dd').textContent === expected[i].value);
        }'''), 'viewer differs from the shared rule model'

    def close_rules(escape=False):
        if escape:
            page.keyboard.press('Escape')
        else:
            page.locator('#online-rules-close').click()
        assert not page.locator('#online-rules-dialog').evaluate('dialog => dialog.open')
        page.wait_for_function("document.activeElement.id === 'main-menu-toggle'")
        assert page.locator('#local-table').is_visible()
        assert_same_state()

    for fmt, label in [('tonpu', '東風戦'), ('tonnan', '半荘戦（東南戦）')]:
        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#new-game-rules').click()
        page.locator(f'input[name="rules-match-format"][value="{fmt}"]').check()
        page.locator('#confirm-rule-settings').click()
        page.locator('#confirm-new-game').click()
        # Use the real selection UI; opening rules must not clear the selected tile.
        page.locator('#player-hand button').first.click()
        capture_state()
        open_rules(label)
        assert_same_state()
        close_rules()

        # Saving a different next-match preference (e.g. in another tab) cannot
        # change the current match, nor can editing and canceling a new match.
        other = 'tonnan' if fmt == 'tonpu' else 'tonpu'
        page.evaluate('''other => window.rulesModel.saveLastGameRules({ schemaVersion: 1, matchFormat: other })''', other)
        page.locator('#main-menu-toggle').click()
        page.locator('#new-game').click()
        page.locator('#new-game-rules').click()
        page.locator(f'input[name="rules-match-format"][value="{other}"]').check()
        page.locator('#confirm-rule-settings').click()
        page.locator('#cancel-new-game').click()
        capture_state()
        open_rules(label)
        close_rules(escape=True)

        # The menu remains available after viewing a result and returning to the
        # table, and subsequent rounds retain exactly the started rules.
        page.evaluate('''() => {
          const { controller: c, render } = window.rulesApp;
          c.game = window.rulesFixtures.fixedRound(0, [0]);
          render();
        }''')
        page.locator('#show-result').click()
        page.locator('#view-table').click()
        capture_state()
        open_rules(label)
        close_rules()
        page.evaluate('''() => { void window.rulesApp.controller.nextRound(); }''')
        page.wait_for_function('!window.rulesApp.controller.progressing')
        capture_state()
        open_rules(label)
        close_rules()

    for width, height in [(320, 480), (375, 547), (390, 844), (430, 932), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        capture_state()
        open_rules('半荘戦（東南戦）')
        layout = page.locator('#online-rules-dialog').evaluate('''dialog => {
          const list = dialog.querySelector('#online-rules-list'), close = dialog.querySelector('button');
          const box = dialog.getBoundingClientRect(), button = close.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(close);
          list.scrollTop = list.scrollHeight;
          return { fits: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
            noOverflow: dialog.scrollWidth <= dialog.clientWidth && list.scrollWidth <= list.clientWidth && document.documentElement.scrollWidth <= innerWidth,
            closeVisible: button.top >= box.top && button.bottom <= box.bottom && button.height >= 44,
            singleLine: range.getClientRects().length === 1 && getComputedStyle(close).whiteSpace === 'nowrap',
            scrolls: list.scrollTop > 0,
            bottomVisible: list.lastElementChild.lastElementChild.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1 };
        }''')
        # At small heights all content must be reachable by scrolling; tall
        # screens may fit the complete list without needing a scroll.
        assert all(value for key, value in layout.items() if key != 'scrolls'), (width, height, layout)
        if height <= 547:
            assert layout['scrolls'], (width, height, layout)
        page.screenshot(path=str(OUT / f'{ENGINE}-{width}x{height}.png'), full_page=True)
        close_rules()

    # A controlled CPU timer proves opening/closing does not cancel or restart
    # the runner. Releasing the original wait still resolves the expected win.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('''async () => {
      const { cpuTsumoStart } = await import('/heibon-mahjong/tests/cpu-tsumo-fixture.ts');
      const c = window.rulesApp.controller;
      const rules = window.rulesModel.rulesForMatch(c.match);
      c.match = window.rulesMatches.startMatch(cpuTsumoStart(1), rules);
      c.selectedTileId = c.game.players[0].drawnTile.id;
      window.rulesProgress = c.confirm();
    }''')
    page.wait_for_function('window.rulesCpuWait && window.rulesApp.controller.progressing')
    capture_state()
    open_rules('半荘戦（東南戦）')
    assert_same_state()
    close_rules()
    page.evaluate('''async () => { window.rulesCpuWait.resolve(); await window.rulesProgress; }''')
    assert page.evaluate("window.rulesApp.controller.match.status === 'round-ended' && window.rulesApp.controller.game.winResult.winnerId === 1")
    page.locator('#show-result').click()
    page.locator('#view-table').click()
    page.evaluate('''() => { window.rulesApp.controller.clearGame(); window.rulesApp.render(); }''')
    assert page.locator('#menu-offline-rules').is_hidden()
    assert not errors, errors
    browser.close()
    print(f'{ENGINE}: offline Tonpu/Tonnan rules, read-only UI, preference isolation, round/result continuity, CPU wait isolation, and five viewport layouts passed.')
