"""Representative Step 13.7 result flow. Complex yaku boundaries live in unit tests."""
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
        route.fulfill(response=response, body=response.text() + '\nwindow.step137Test = { controller, render };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => app.controller.newGame())")
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.step137Test === "object"')
    setup = page.evaluate('''async () => {
      const [tsumo, match] = await Promise.all([
        import('/heibon-mahjong/tests/tsumo-fixture.ts'),
        import('/heibon-mahjong/src/game/match.ts'),
      ]);
      const game = tsumo.tsumoGame(['123m','123m','456m','456m','77z'], false, [], 'sou-8');
      window.step137Test.controller.match = match.startMatch(game);
      window.step137Test.render();
      const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
        ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
        ...(player.melds ?? []).flatMap(meld => meld.tiles),
      ])];
      return { phase: game.phase, idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136,
        privateIds: game.players.slice(1).flatMap(player => [...player.hand,
          ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id) };
    }''')
    assert setup['phase'] == 'awaiting-discard' and setup['idsUnique'], setup
    assert page.locator('#tsumo').is_visible() and page.locator('#tsumo').is_enabled(), 'tsumo action unavailable'
    page.locator('#tsumo').click()
    page.wait_for_function('''() => window.step137Test.controller.game.phase === 'won' &&
      window.step137Test.controller.match.status === 'round-ended' ''')
    assert page.locator('#round-result-summary').is_visible(), 'summary hidden'
    result = page.evaluate('''() => {
      const game = window.step137Test.controller.game;
      const win = game.winResult;
      const physical = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
        ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
        ...(player.melds ?? []).flatMap(meld => meld.tiles),
      ])];
      return { role: win.candidate.yaku.find(yaku => yaku.id === 'ryanpeikou')?.id,
        roleHan: win.candidate.yaku.find(yaku => yaku.id === 'ryanpeikou')?.han,
        shape: win.candidate.shape, totalHan: win.totalHanIncludingDora, points: win.totalPoints, fu: win.fu,
        yaku: win.candidate.yaku.map(yaku => ({ id: yaku.id, han: yaku.han })),
        privateIds: game.players.slice(1).flatMap(player => [...player.hand,
          ...(player.drawnTile ? [player.drawnTile] : [])]).map(tile => tile.id),
        idsUnique: physical.length === 136 && new Set(physical.map(tile => tile.id)).size === 136 };
    }''')
    assert result['role'] == 'ryanpeikou' and result['roleHan'] == 3, result
    assert result['shape'] == 'standard', result
    assert result['idsUnique'], result
    summary = page.locator('.round-summary-yaku').first.inner_text()
    assert '二盃口' in summary, summary
    assert page.locator('.round-summary-value').first.inner_text() == f'{result["totalHan"]}翻 {result["fu"]}符', result
    assert page.locator('.round-summary-points').first.inner_text() == f'{result["points"]:,}点', result
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'table horizontal overflow'
    assert page.locator('.round-win-summary').evaluate('element => element.scrollWidth <= element.clientWidth'), 'summary overflow'
    public_html = page.locator('main').inner_html()
    assert all(tile_id not in public_html for tile_id in setup['privateIds']), 'CPU private ID leaked'

    page.locator('#show-result').click()
    assert page.locator('#result-dialog').is_visible(), 'detail did not open'
    section = page.locator('.winner-result').first
    detail_yaku = section.locator('ul').first.locator('li').all_inner_texts()
    assert '二盃口 3翻' in detail_yaku, detail_yaku
    assert f'合計：{result["totalHan"]}翻' in section.inner_text(), result
    assert f'{result["points"]}点' in section.locator('.win-score').inner_text(), result
    page.locator('#view-table').click()
    assert not page.locator('#result-dialog').is_visible(), 'table button failed to close details'
    page.locator('#show-result').click()
    assert page.locator('#result-dialog').is_visible(), 'result button failed to reopen details'
    page.locator('#view-table').click()
    page.locator('#next-round').click()
    page.wait_for_function('''() => window.step137Test.controller.match.status === 'playing' &&
      window.step137Test.controller.game.winResult === null''')
    assert page.locator('#round-result-summary').is_hidden(), 'next hand did not clear result'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'next hand horizontal overflow'
    assert not errors, errors
    report = {'scenario': 'ryanpeikou-tsumo', 'viewport': [390, 844], 'role': 'ryanpeikou',
        'roleHan': result['roleHan'], 'shape': result['shape'], 'totalHan': result['totalHan'],
        'points': result['points'], 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step13-7-browser.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
