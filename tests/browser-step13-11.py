"""Representative Tenhou and Chiihou result flows at 390px."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)
SCENARIOS = [
    ('tenhou', ['天和', '国士無双'], '2役満', 96000, '親連荘'),
    ('chiihou', ['地和'], '1役満', 32000, '親交代'),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.step1311Test = { controller, render };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.step1311Test === "object"')
    results = []

    for scenario, expected_names, expected_count, expected_points, dealer_status in SCENARIOS:
        setup = page.evaluate('''async scenario => {
          const [fixtures, matchModule] = await Promise.all([
            import('/heibon-mahjong/tests/step13-11-fixture.ts'),
            import('/heibon-mahjong/src/game/match.ts'),
          ]);
          window.step1311Test.controller.newGame();
          const game = scenario === 'tenhou' ? fixtures.tenhouGame(0, fixtures.FIRST_TURN_HANDS.kokushi)
            : fixtures.chiihouGame(0, fixtures.FIRST_TURN_HANDS.standard, 1311, 1);
          window.step1311Test.controller.match = matchModule.startMatch(game);
          window.step1311Test.controller.selectedTileId = null;
          window.step1311Test.render();
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { phase: game.phase, canTsumo: window.step1311Test.controller.canTsumo,
            idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(1).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''', scenario)
        assert setup['phase'] == 'awaiting-discard' and setup['canTsumo'] and setup['idsUnique'], setup
        assert page.locator('#tsumo').is_visible() and page.locator('#tsumo').is_enabled(), f'{expected_names} action unavailable'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'initial table horizontal overflow'
        assert all(tile_id not in page.locator('main').inner_html() for tile_id in setup['privateIds']), 'CPU private ID leaked before win'

        page.locator('#tsumo').click()
        page.wait_for_function('''() => window.step1311Test.controller.game.phase === 'won' &&
          window.step1311Test.controller.match.status === 'round-ended' ''')
        assert page.locator('#round-result-summary').is_visible(), 'summary hidden'
        summary = page.locator('#round-result-summary').inner_text()
        assert all(name in summary for name in expected_names) and expected_count in summary, summary
        assert f'{expected_points:,}点' in summary, summary
        assert dealer_status in summary, summary
        assert page.locator('.round-summary-payments').count() >= 1, summary
        if scenario == 'chiihou':
            assert 'CPU1（親）→自分 16,000点' in summary, summary
            assert 'CPU2（子）→自分 8,000点' in summary, summary
            assert 'CPU3（子）→自分 8,000点' in summary, summary
        else:
            assert 'CPU1（子）→自分 32,000点' in summary, summary
            assert 'CPU2（子）→自分 32,000点' in summary, summary
            assert 'CPU3（子）→自分 32,000点' in summary, summary
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'result horizontal overflow'
        assert page.locator('.round-win-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), 'summary overflow'

        result = page.evaluate('''() => {
          const game = window.step1311Test.controller.game;
          const win = game.winResult;
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { yaku: win.candidate.yaku.map(entry => entry.id), yakumanCount: win.yakumanCount,
            han: win.totalHanIncludingDora, points: win.totalPoints,
            idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(1).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''')
        expected_ids = ['tenhou', 'kokushi-musou'] if scenario == 'tenhou' else ['chiihou']
        expected_yakuman_count = 2 if scenario == 'tenhou' else 1
        assert result['yaku'] == expected_ids, result
        assert result['yakumanCount'] == expected_yakuman_count and result['han'] == 0, result
        assert result['points'] == expected_points and result['idsUnique'], result
        assert all(tile_id not in page.locator('main').inner_html() for tile_id in result['privateIds']), 'CPU private ID leaked after win'

        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'detail did not open'
        section = page.locator('.winner-result').first
        details = section.inner_text()
        assert all(f'{name} 1役満' in details for name in expected_names), details
        assert f'役満：{expected_count}' in details, details
        assert f'{expected_points:,}点' in section.locator('.win-score').inner_text(), details
        assert dealer_status in details, details
        if scenario == 'chiihou':
            assert '（親） → 自分 16000点' in details, details
            assert '（子） → 自分 8000点' in details, details
        page.locator('#view-table').click()
        assert not page.locator('#result-dialog').is_visible(), 'detail did not close'
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'detail did not reopen'
        page.locator('#view-table').click()
        page.locator('#next-round').click()
        page.wait_for_function('''() => window.step1311Test.controller.match.status === 'playing' &&
          window.step1311Test.controller.match.lastSettlement === null &&
          window.step1311Test.controller.game.winResult === null''')
        assert page.locator('#round-result-summary').is_hidden(), 'next round retained result'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'next round horizontal overflow'
        results.append({'scenario': scenario, 'yaku': expected_names, 'yakumanCount': expected_yakuman_count,
            'totalPoints': expected_points, 'dealerStatus': dealer_status,
            'viewport': [390, 844], 'result': 'pass'})

    assert not errors, errors
    report = {'step': '13.11', 'scenarios': results, 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step13-11-browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
