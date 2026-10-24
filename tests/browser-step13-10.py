"""Representative Step 13.10 special-draw and Nagashi Mangan flows at 390px."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser_type = getattr(p, ENGINE)
    launch_options = {}
    if ENGINE == 'chromium':
        launch_options['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
        launch_options['args'] = ['--no-sandbox']
    browser = browser_type.launch(**launch_options)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2 if ENGINE == 'webkit' else 1,
                            is_mobile=ENGINE == 'webkit', has_touch=ENGINE == 'webkit')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.step1310Test = { controller, render };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.step1310Test === "object"')
    results = []

    scenarios = ['kyuushu-human', 'kyuushu-cpu', 'four-winds', 'nagashi-mangan']
    for scenario in scenarios:
        setup = page.evaluate('''async scenario => {
          const [fixtures, matchModule, draws] = await Promise.all([
            import('/heibon-mahjong/tests/step13-10-fixture.ts'),
            import('/heibon-mahjong/src/game/match.ts'),
            import('/heibon-mahjong/src/game/special-draws.ts'),
          ]);
          const declarerId = scenario === 'kyuushu-cpu' ? 1 : 0;
          const game = scenario.startsWith('kyuushu') ? (declarerId === 1
            ? fixtures.childKyuushuGame(9) : fixtures.parentKyuushuGame(9))
            : scenario === 'four-winds' ? fixtures.fourWindsGame('east')
              : fixtures.nagashiGame([0]);
          let match = matchModule.startMatch(game);
          if (scenario === 'kyuushu-cpu') {
            match = matchModule.updateMatchGame(match, draws.declareKyuushuKyuuhai(game, declarerId));
          }
          if (scenario === 'nagashi-mangan') {
            match = matchModule.settleRound({ ...match, status: 'playing', lastSettlement: null,
              points: [23000,25000,25000,25000], depositSticks: 2, honba: 2 });
          }
          window.step1310Test.controller.match = match;
          window.step1310Test.controller.selectedTileId = null;
          window.step1310Test.render();
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          const privateIds = game.players.slice(1).flatMap(player => [...player.hand,
            ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id);
          return { phase: game.phase, reason: game.abortiveDraw ?? null, declarerId, idsUnique: physical.length === 136 &&
              new Set(physical.map(tile => tile.id)).size === 136, privateIds,
            buttonAvailable: window.step1310Test.controller.canKyuushuKyuuhai,
            settlement: match.lastSettlement?.reason ?? null };
        }''', scenario)
        assert setup['idsUnique'], setup
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'initial table horizontal overflow'
        public_html = page.locator('main').inner_html()
        assert all(tile_id not in public_html for tile_id in setup['privateIds']), 'private CPU ID leaked before result'
        if not scenario.startswith('kyuushu'):
            assert page.locator('#kyuushu-kyuuhai').is_hidden(), 'unavailable 九種九牌 action was exposed'

        expected_title = {'kyuushu-human': '途中流局（九種九牌）', 'kyuushu-cpu': '途中流局（九種九牌）',
                          'four-winds': '途中流局（四風連打）',
                          'nagashi-mangan': '流し満貫'}[scenario]
        if scenario == 'kyuushu-human':
            assert setup['phase'] == 'awaiting-discard' and setup['buttonAvailable'], setup
            button = page.locator('#kyuushu-kyuuhai')
            assert button.is_visible() and button.is_enabled(), '九種九牌 action unavailable'
            button.click()
        elif scenario == 'kyuushu-cpu':
            assert setup['phase'] == 'awaiting-discard' and setup['settlement'] == 'kyuushu-kyuuhai', setup
        elif scenario == 'four-winds':
            assert setup['phase'] == 'wall-exhausted' and setup['reason'] == 'four-winds', setup
            assert setup['settlement'] == 'four-winds', setup
        else:
            assert setup['settlement'] == 'nagashi-mangan', setup

        settled = page.evaluate('''() => {
          const game = window.step1310Test.controller.game;
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(1).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''')
        assert settled['idsUnique'], settled
        assert all(tile_id not in page.locator('main').inner_html() for tile_id in settled['privateIds']), 'private CPU ID leaked after result'
        declarer_hand = page.locator('#player-hand .revealed-tile') if setup['declarerId'] == 0 else page.locator(f'.concealed-hand[data-player-id="{setup["declarerId"]}"] .revealed-tile')
        if scenario.startswith('kyuushu'):
            assert declarer_hand.count() == 14, f'expected 14 public tiles, got {declarer_hand.count()}'
            for seat in range(4):
                if seat == setup['declarerId']:
                    continue
                assert page.locator(f'.concealed-hand[data-player-id="{seat}"] .revealed-tile').count() == 0, f'other seat {seat} was revealed'
            if setup['declarerId'] == 0:
                assert page.locator('#player-hand button').count() == 0, 'declared hand remained interactive'
        assert expected_title in page.locator('#round-result-summary').inner_text()
        assert page.locator('#next-round').is_visible(), 'next-round action unavailable'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'result horizontal overflow'
        assert page.locator('#round-result-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), 'summary overflow'
        result_text = page.locator('#round-result-summary').inner_text()
        if scenario == 'nagashi-mangan':
            assert '成立：自分' in result_text and 'CPU1 → 自分 4,200点' in result_text, result_text
            assert '供託 2,000点は自分へ' in result_text and '2本場' in result_text, result_text
        elif scenario.startswith('kyuushu'):
            assert '途中流局（九種九牌）' in result_text, result_text
        else:
            assert '途中流局（四風連打）' in result_text, result_text

        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'detail did not open'
        assert page.locator('#result-title').inner_text() == expected_title
        details = page.locator('#match-result').inner_text()
        if scenario == 'nagashi-mangan':
            assert 'CPU1 → 自分 4,200点' in details and '満貫相当' in details, details
            assert '供託：自分 ＋2000点' in details and '親：連荘' in details, details
        else:
            assert '供託：0本を次局へ持ち越し' in details, details
        if scenario.startswith('kyuushu'):
            expected_name = '自分' if setup['declarerId'] == 0 else 'CPU1'
            assert f'宣言者：{expected_name}' in details, details
            assert page.locator('#match-result .winning-hand li').count() == 14, 'result dialog hand must contain 14 tiles'
        page.locator('#view-table').click()
        assert not page.locator('#result-dialog').is_visible(), 'table button failed to close details'
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'result did not reopen'
        page.locator('#view-table').click()
        if scenario.startswith('kyuushu'):
            page.set_viewport_size({'width': 320, 'height': 568})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'iPhone SE width overflow'
            page.set_viewport_size({'width': 390, 'height': 844})
        page.locator('#next-round').click()
        page.wait_for_function('''() => window.step1310Test.controller.match.status === 'playing' &&
          window.step1310Test.controller.match.lastSettlement === null ''')
        assert page.locator('#round-result-summary').is_hidden(), 'next round retained result'
        assert page.locator('.revealed-tile').count() == 0, 'next round retained public hand tiles'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'next round horizontal overflow'
        results.append({'scenario': scenario, 'title': expected_title, 'viewport': [390,844], 'result': 'pass'})

    assert not errors, errors
    report = {'step': '13.10', 'scenarios': results, 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step13-10-browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
