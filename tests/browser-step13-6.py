"""Step 13.6 real-win UI checks at representative viewport widths."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-step13-6'))
OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [(320, 568), (375, 667), (390, 844), (430, 932), (1280, 800)]
NAMES = {
    'sanshoku-doujun': ('三色同順', 2),
    'ittsu': ('一気通貫', 2),
    'honitsu': ('混一色', 3),
    'chinitsu': ('清一色', 6),
}
SCENARIOS = {
    'sanshoku-ron': ('ron', 'sanshoku-doujun'),
    'ittsu-ron': ('ron', 'ittsu'),
    'honitsu-tsumo': ('tsumo', 'honitsu'),
    'chinitsu-closed-tsumo': ('tsumo', 'chinitsu'),
    'chinitsu-open-tsumo': ('tsumo', 'chinitsu'),
}
reports = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width, height in WIDTHS:
        # Check the long color-yaku labels at every target width. Other new yaku
        # use one representative width because their result rendering is shared.
        scenarios = list(SCENARIOS) if width == 390 else ['chinitsu-closed-tsumo', 'chinitsu-open-tsumo']
        for name in scenarios:
            method, expected_id = SCENARIOS[name]
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def expose_app(route):
                response = route.fetch()
                route.fulfill(response=response, body=response.text() + '\nwindow.step136Test = { controller, render };\n')

            page.route('**/src/main.ts', expose_app)
            page.goto(BASE_URL)
            page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => app.controller.newGame())")
            page.wait_for_selector('#player-hand svg')
            page.wait_for_function('typeof window.step136Test === "object"')
            pre = page.evaluate('''async name => {
              const [tsumo, ron, match, fixture] = await Promise.all([
                import('/heibon-mahjong/tests/tsumo-fixture.ts'),
                import('/heibon-mahjong/tests/ron-fixture.ts'),
                import('/heibon-mahjong/src/game/match.ts'),
                import('/heibon-mahjong/tests/step13-6-fixture.ts'),
              ]);
              let game;
              if (name === 'sanshoku-ron') {
                game = ron.ronGame(1, [0], [['123m','123p','123s','45s','55m']], 'sou-6', false, 'sou-8');
              } else if (name === 'ittsu-ron') {
                game = ron.ronGame(1, [0], [['123m','456m','789m','34p','55s']], 'pin-2', false, 'sou-8');
              } else if (name === 'honitsu-tsumo') {
                game = tsumo.tsumoGame(['123m','456m','789m','99m','555z'], false, [], 'sou-9');
              } else if (name === 'chinitsu-closed-tsumo') {
                game = tsumo.tsumoGame(['111m','234m','678m','999m','22m'], false, [], 'sou-9');
              } else if (name === 'chinitsu-open-tsumo') {
                game = fixture.openChinitsuPonTsumoGame();
              } else throw new Error(`Unknown Step 13.6 scenario: ${name}`);
              const app = window.step136Test;
              app.controller.match = match.startMatch(game);
              app.render();
              const all = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
                ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
                ...(player.melds ?? []).flatMap(meld => meld.tiles),
              ])];
              return { phase: game.phase, idsUnique: new Set(all.map(tile => tile.id)).size === 136 && all.length === 136,
                requestedMethod: name.endsWith('-ron') ? 'ron' : 'tsumo' };
            }''', name)
            assert pre['idsUnique'] and pre['phase'] == ('awaiting-ron' if method == 'ron' else 'awaiting-discard'), (width, name, pre)

            action = '#ron' if method == 'ron' else '#tsumo'
            assert page.locator(action).is_visible() and page.locator(action).is_enabled(), (width, name, 'win action unavailable')
            page.locator(action).click()
            page.wait_for_function('''() => window.step136Test.controller.game.phase === 'won' &&
              window.step136Test.controller.match.status === 'round-ended' ''')
            assert page.locator('#round-result-summary').is_visible(), (width, name, 'summary hidden')
            result = page.evaluate('''() => {
              const game = window.step136Test.controller.game;
              const win = game.winResult.winMethod === 'ron' ? game.winResult.winners[0] : game.winResult;
              const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
                ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
                ...(player.melds ?? []).flatMap(meld => meld.tiles),
              ])];
              return { method: win.winMethod, role: win.candidate.yaku.find(yaku =>
                ['sanshoku-doujun','ittsu','honitsu','chinitsu'].includes(yaku.id))?.id,
                roleHan: win.candidate.yaku.find(yaku =>
                  ['sanshoku-doujun','ittsu','honitsu','chinitsu'].includes(yaku.id))?.han,
                yaku: win.candidate.yaku.map(yaku => ({ id: yaku.id, han: yaku.han })),
                totalHan: win.totalHanIncludingDora, points: win.totalPoints, fu: win.fu,
                scoreTier: win.scoreTier, redHan: win.redDoraHan,
                privateIds: game.players.slice(1).flatMap(player => [...player.hand,
                  ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id),
                idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136 };
            }''')
            assert result['method'] == method and result['role'] == expected_id, (width, name, result)
            expected_role_han = NAMES[expected_id][1]
            if name == 'chinitsu-open-tsumo':
                expected_role_han = 5
            assert result['roleHan'] == expected_role_han, (width, name, result)
            assert result['idsUnique'], (width, name, 'physical inventory changed')
            assert result['redHan'] == 0, (width, name, result)
            summary = page.locator('.round-summary-yaku').first.inner_text()
            assert NAMES[expected_id][0] in summary, (width, name, summary)
            assert page.locator('.round-summary-value').first.inner_text() == f'{result["totalHan"]}翻 {result["fu"]}符', (width, name, result)
            assert page.locator('.round-summary-points').first.inner_text() == f'{result["points"]:,}点', (width, name, result)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, name, 'table horizontal overflow')
            assert page.locator('.round-win-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), (width, name, 'summary overflow')
            public_html = page.locator('main').inner_html()
            assert all(tile_id not in public_html for tile_id in result['privateIds']), (width, name, 'CPU private ID leaked')

            page.locator('#show-result').click()
            assert page.locator('#result-dialog').is_visible(), (width, name, 'detail did not open')
            section = page.locator('.winner-result').first
            detail_yaku = section.locator('ul').first.locator('li').all_inner_texts()
            assert f'{NAMES[expected_id][0]} {expected_role_han}翻' in detail_yaku, (width, name, detail_yaku)
            assert f'合計：{result["totalHan"]}翻' in section.inner_text(), (width, name, result)
            assert f'{result["points"]}点' in section.locator('.win-score').inner_text(), (width, name, result)
            scroll = page.locator('#result-body').evaluate('element => element.scrollHeight > element.clientHeight')
            if scroll:
                page.locator('#result-body').evaluate('element => element.scrollTop = element.scrollHeight')
                assert page.locator('#result-body').evaluate('element => element.scrollTop > 0'), (width, name, 'detail scrolling failed')
            page.locator('#view-table').click()
            assert not page.locator('#result-dialog').is_visible(), (width, name, 'table button failed to close details')
            page.locator('#show-result').click()
            assert page.locator('#result-dialog').is_visible(), (width, name, 'result button failed to reopen details')
            page.locator('#view-table').click()
            page.locator('#next-round').click()
            page.wait_for_function('''() => window.step136Test.controller.match.status === 'playing' &&
              window.step136Test.controller.game.winResult === null''')
            assert page.locator('#round-result-summary').is_hidden(), (width, name, 'next hand did not clear result')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, name, 'next hand horizontal overflow')
            assert not errors, (width, name, errors)
            reports.append({'scenario': name, 'viewport': [width, height], 'method': method,
                'role': expected_id, 'roleHan': result['roleHan'], 'totalHan': result['totalHan'],
                'scoreTier': result['scoreTier'], 'points': result['points'], 'result': 'pass'})
            print(json.dumps(reports[-1], ensure_ascii=False), flush=True)
            page.close()
    browser.close()

(OUT / 'step13-6-browser.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
