"""Representative Step 13.8 yakuman result flows. Complex rules stay in unit tests."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)
SCENARIOS = [
    ('step13-8-single-yakuman', ['daisangen'], '大三元', '1役満', 48000),
    ('step13-8-multiple-yakuman', ['ryuuiisou', 'suuankou'], '緑一色', '2役満', 64000),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.step138Test = { controller, render };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => { app.controller.random = () => .999999; app.controller.newGame(); })")
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.step138Test === "object"')
    results = []

    for scenario, expected_ids, expected_name, count_label, expected_points in SCENARIOS:
        setup = page.evaluate('''async scenario => {
          const [fixtures, match] = await Promise.all([
            import('/heibon-mahjong/tests/scoring-fixture.ts'),
            import('/heibon-mahjong/src/game/match.ts'),
          ]);
          window.step138Test.controller.newGame();
          const game = fixtures.scoringGame(scenario);
          window.step138Test.controller.match = match.startMatch(game);
          window.step138Test.render();
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { phase: game.phase, idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(1).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''', scenario)
        assert setup['phase'] == 'awaiting-discard' and setup['idsUnique'], setup
        assert page.locator('#tsumo').is_visible() and page.locator('#tsumo').is_enabled(), 'tsumo action unavailable'
        page.locator('#tsumo').click()
        page.wait_for_function('''() => window.step138Test.controller.game.phase === 'won' &&
          window.step138Test.controller.match.status === 'round-ended' ''')
        assert page.locator('#round-result-summary').is_visible(), 'summary hidden'
        result = page.evaluate('''() => {
          const game = window.step138Test.controller.game;
          const win = game.winResult;
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { yakuIds: win.candidate.yaku.map(yaku => yaku.id), yakumanCount: win.yakumanCount,
            totalHan: win.totalHanIncludingDora, points: win.totalPoints,
            idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(1).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''')
        assert result['yakuIds'] == expected_ids, result
        assert result['yakumanCount'] == len(expected_ids), result
        assert result['totalHan'] == 0 and result['points'] == expected_points, result
        assert result['idsUnique'], result
        summary = page.locator('.round-summary-yaku').first.inner_text()
        assert expected_name in summary, summary
        assert page.locator('.round-summary-value').first.inner_text() == count_label, result
        assert page.locator('.round-summary-points').first.inner_text() == f'{expected_points:,}点', result
        assert page.locator('.round-summary-payments').count() == 0, 'win summary must omit payment details'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'table horizontal overflow'
        assert page.locator('.round-win-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), 'summary overflow'
        public_html = page.locator('main').inner_html()
        assert all(tile_id not in public_html for tile_id in setup['privateIds']), 'CPU private ID leaked'

        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'detail did not open'
        section = page.locator('.winner-result').first
        detail_yaku = section.locator('ul').first.locator('li').all_inner_texts()
        for role_id, japanese in zip(expected_ids, ['大三元'] if len(expected_ids) == 1 else ['緑一色', '四暗刻']):
            assert any(f'{japanese} 1役満' in item for item in detail_yaku), detail_yaku
        detail_text = section.inner_text()
        assert f'役満：{count_label}' in detail_text, detail_text
        assert f'{expected_points}点' in section.locator('.win-score').inner_text(), result
        assert '（子） →' in detail_text, detail_text
        if scenario == 'step13-8-multiple-yakuman':
            assert '（親） →' in detail_text, detail_text
        page.locator('#view-table').click()
        assert not page.locator('#result-dialog').is_visible(), 'table button failed to close details'
        page.locator('#next-round').click()
        page.wait_for_function('''() => window.step138Test.controller.match.status === 'playing' &&
          window.step138Test.controller.game.winResult === null''')
        assert page.locator('#round-result-summary').is_hidden(), 'next hand did not clear result'
        if scenario == 'step13-8-multiple-yakuman':
            assert page.evaluate('window.step138Test.controller.match.roundNumber') == 2, 'next round did not advance'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'next hand horizontal overflow'
        results.append({'scenario': scenario, 'yakuIds': expected_ids, 'yakumanCount': len(expected_ids),
            'totalPoints': expected_points, 'viewport': [390, 844], 'result': 'pass'})

    assert not errors, errors
    report = {'step': '13.8', 'scenarios': results, 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step13-8-browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
