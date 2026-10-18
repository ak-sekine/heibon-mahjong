"""Representative Step 13.9 result flows at the priority 390px viewport."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.step139Test = { controller, render };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.step139Test === "object"')
    results = []

    for scenario in ['haitei', 'houtei']:
        setup = page.evaluate('''async scenario => {
          const [tsumo, fixture, match] = await Promise.all([
            import('/heibon-mahjong/tests/tsumo-fixture.ts'),
            import('/heibon-mahjong/tests/step13-9-fixture.ts'),
            import('/heibon-mahjong/src/game/match.ts'),
          ]);
          const game = scenario === 'haitei'
            ? tsumo.tsumoGame(['123p','456p','789s','22m','345m'], true, ['man'], 'man-4')
            : fixture.finalDiscardGame({ dealerId: 3,
                winners: [{ id: 1, hand: ['123m','456m','789p','22p','34s'] }],
                winningKey: 'sou-5', drawKey: 'east', discardKey: 'sou-5' });
          window.step139Test.controller.match = match.startMatch(game);
          window.step139Test.render();
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          const privateIds = game.players.slice(1).flatMap(player => [...player.hand,
            ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id);
          const discard = scenario === 'houtei'
            ? game.players[0].hand.find(tile => tile.tile.category === 'suited' && tile.tile.suit === 'sou' && tile.tile.rank === 5)
            : null;
          return { phase: game.phase, liveWall: game.liveWall.length,
            idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds, discardId: discard?.id ?? null };
        }''', scenario)
        assert setup['phase'] == 'awaiting-discard' and setup['idsUnique'], setup
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'initial table horizontal overflow'
        assert all(tile_id not in page.locator('main').inner_html() for tile_id in setup['privateIds']), 'private CPU ID leaked before win'

        if scenario == 'haitei':
            assert setup['liveWall'] == 0, setup
            assert page.locator('#tsumo').is_visible() and page.locator('#tsumo').is_enabled(), 'haitei tsumo action unavailable'
            page.locator('#tsumo').click()
        else:
            assert setup['liveWall'] == 0 and setup['discardId'], setup
            page.locator(f'#player-hand button[data-tile-id="{setup["discardId"]}"]').click()
            page.locator('#discard').click()
        page.wait_for_function('''() => window.step139Test.controller.game.phase === 'won' &&
          window.step139Test.controller.match.status === 'round-ended' ''')
        assert page.locator('#round-result-summary').is_visible(), 'summary hidden'
        result = page.evaluate('''() => {
          const game = window.step139Test.controller.game;
          const win = game.winResult;
          const winners = win.winMethod === 'ron' ? win.winners : [win];
          const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
            ...(player.melds ?? []).flatMap(meld => meld.tiles),
          ])];
          return { winMethod: win.winMethod, winners: winners.map(winner => ({ id: winner.winnerId,
              yaku: winner.candidate.yaku.map(yaku => ({ id: yaku.id, han: yaku.han })),
              totalHan: winner.totalHanIncludingDora, points: winner.totalPoints })),
            idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
            privateIds: game.players.slice(2).flatMap(player => [...player.hand,
              ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
        }''')
        expected_id, expected_name = ('haitei', '海底摸月') if scenario == 'haitei' else ('houtei', '河底撈魚')
        assert result['winMethod'] == ('tsumo' if scenario == 'haitei' else 'ron'), result
        assert len(result['winners']) == 1, result
        role = next((yaku for yaku in result['winners'][0]['yaku'] if yaku['id'] == expected_id), None)
        assert role and role['han'] == 1, result
        assert result['idsUnique'], result
        summary = page.locator('.round-summary-yaku').first.inner_text()
        assert expected_name in summary, summary
        assert page.locator('.round-summary-value').first.inner_text() == f'合計{result["winners"][0]["totalHan"]}翻', result
        assert page.locator('.round-summary-points').first.inner_text() == f'{result["winners"][0]["points"]:,}点', result
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'result horizontal overflow'
        assert page.locator('.round-win-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), 'summary overflow'
        public_html = page.locator('main').inner_html()
        assert all(tile_id not in public_html for tile_id in result['privateIds']), 'private CPU ID leaked'

        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'detail did not open'
        section = page.locator('.winner-result').first
        detail_yaku = section.locator('ul').first.locator('li').all_inner_texts()
        assert f'{expected_name} 1翻' in detail_yaku, detail_yaku
        assert f'合計：{result["winners"][0]["totalHan"]}翻' in section.inner_text(), result
        assert f'{result["winners"][0]["points"]}点' in section.locator('.win-score').inner_text(), result
        page.locator('#view-table').click()
        assert not page.locator('#result-dialog').is_visible(), 'table button failed to close details'
        page.locator('#show-result').click()
        assert page.locator('#result-dialog').is_visible(), 'result did not reopen'
        page.locator('#view-table').click()
        page.locator('#next-round').click()
        page.wait_for_function('''() => window.step139Test.controller.match.status === 'playing' &&
          window.step139Test.controller.game.winResult === null ''')
        assert page.locator('#round-result-summary').is_hidden(), 'next round retained result'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'next hand horizontal overflow'
        results.append({'scenario': scenario, 'yaku': expected_id, 'yakuHan': role['han'],
            'totalHan': result['winners'][0]['totalHan'], 'points': result['winners'][0]['points'],
            'viewport': [390, 844], 'result': 'pass'})

    assert not errors, errors
    report = {'step': '13.9', 'scenarios': results, 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step13-9-browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
