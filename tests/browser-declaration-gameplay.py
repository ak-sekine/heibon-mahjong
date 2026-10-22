"""Exercise declaration bubbles through actual local and online riichi actions."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'))
    page = browser.new_page(viewport={'width': 320, 'height': 900}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '''
window.declarationGameplayTest = { controller, render, onlineGameController };
''')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.wait_for_selector('#player-hand button[data-tile-id]')
    page.wait_for_function('window.declarationGameplayTest?.onlineGameController')
    page.evaluate('''async() => {
      const renderer = await import('/heibon-mahjong/src/rendering/declaration-bubbles.ts');
      const original = renderer.DeclarationBubbleRenderer.prototype.show;
      window.declarationBubbleShows = [];
      renderer.DeclarationBubbleRenderer.prototype.show = function(seat, kind, position, river, duration) {
        window.declarationBubbleShows.push({
          mode: document.body.classList.contains('online-game-active') ? 'online' : 'local',
          seat, kind, position, at: performance.now(), duration,
        });
        return original.call(this, seat, kind, position, river, duration);
      };
    }''')

    fixture = page.evaluate('''async() => {
      const [{ riichiStart }, { startMatch }] = await Promise.all([
        import('/heibon-mahjong/tests/riichi-fixture.ts'),
        import('/heibon-mahjong/src/game/match.ts'),
      ]);
      const app = window.declarationGameplayTest;
      app.controller.newGame();
      app.controller.match = startMatch(riichiStart('ron'));
      app.controller.selectedTileId = null;
      app.render();
      return {
        drawnTileId: app.controller.game.players[0].drawnTile.id,
        canDeclare: app.controller.canRiichi,
      };
    }''')
    assert fixture['canDeclare'] is False, 'a tile must be selected before the real local riichi action is enabled'
    page.locator(f'#player-hand button[data-tile-id="{fixture["drawnTileId"]}"]').click()
    assert page.locator('#riichi').is_enabled(), 'the real local riichi action was not enabled for the legal fixture'
    page.evaluate('window.localActionStartedAt = performance.now()')
    page.locator('#riichi').click()
    page.locator('#local-table .declaration-bubble[data-declaration="riichi"]').wait_for(timeout=1000)
    page.locator('#local-table').scroll_into_view_if_needed()
    local_metrics = page.evaluate('''() => {
      const bubble = document.querySelector('#local-table .declaration-bubble[data-declaration="riichi"]');
      const table = document.querySelector('#local-table');
      const box = bubble.getBoundingClientRect();
      const style = getComputedStyle(bubble);
      const oldPointerEvents = bubble.style.pointerEvents;
      bubble.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      bubble.style.pointerEvents = oldPointerEvents;
      const show = [...window.declarationBubbleShows].reverse().find(event => event.mode === 'local');
      return {
        label: bubble.textContent, box: {left:box.left,top:box.top,right:box.right,bottom:box.bottom},
        table: table.getBoundingClientRect().toJSON(),
        display: style.display, visibility: style.visibility, opacity: Number(style.opacity),
        color: style.color, background: style.backgroundColor, fontSize: parseFloat(style.fontSize),
        width: box.width, height: box.height,
        inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        topmost: hit === bubble || bubble.contains(hit),
        operationToShowMs: show ? show.at - window.localActionStartedAt : null,
        stateEstablished: Boolean(window.declarationGameplayTest.controller.game.players[0].riichi),
      };
    }''')
    assert local_metrics['stateEstablished'], f'local riichi state was not established: {local_metrics}'
    assert local_metrics['operationToShowMs'] is not None and 0 <= local_metrics['operationToShowMs'] < 500, local_metrics

    def assert_visible_bubble(mode, metrics, label):
        assert metrics['label'] == label, (mode, metrics)
        assert metrics['display'] != 'none' and metrics['visibility'] == 'visible' and metrics['opacity'] > 0, (mode, metrics)
        assert metrics['width'] > 0 and metrics['height'] > 0 and metrics['fontSize'] >= 21, (mode, metrics)
        assert metrics['background'] == 'rgb(255, 241, 184)' and metrics['color'] != 'rgba(0, 0, 0, 0)', (mode, metrics)
        assert metrics['inViewport'] and metrics['topmost'], (mode, metrics)

    assert_visible_bubble('local 320px', local_metrics, 'リーチ')
    page.screenshot(path=str(OUT / 'declaration-gameplay-local-320.png'))
    page.wait_for_timeout(1800)
    assert page.locator('#local-table .declaration-bubble').count() == 1, 'local bubble disappeared before two seconds'
    page.wait_for_timeout(350)
    assert page.locator('#local-table .declaration-bubble').count() == 0, 'local bubble did not disappear after two seconds'

    online = page.evaluate('''async() => {
      const [fixture, matchModule, engine, views] = await Promise.all([
        import('/heibon-mahjong/tests/riichi-fixture.ts'),
        import('/heibon-mahjong/src/game/match.ts'),
        import('/heibon-mahjong/src/online/game-engine.ts'),
        import('/heibon-mahjong/src/online/game-view.ts'),
      ]);
      const app = window.declarationGameplayTest;
      const connected = new Set([0]);
      const identities = [0,1,2,3].map(seat => ({
        seat, name: seat === 0 ? 'テスト人間' : `CPU${seat}`,
        control: seat === 0 ? 'human' : 'cpu', connected: seat === 0,
      }));
      const source = fixture.riichiStart('ron');
      const players = source.players.map((player, seat) => ({
        ...player, control: identities[seat].control,
      }));
      let session = {
        schemaVersion: 1, gameRevision: 1,
        match: matchModule.startMatch({...source, players}), status: 'playing',
        identities, hostSeat: 0, decision: null, declarations: [],
      };
      const onlineView = () => views.createPlayerGameView(session, 0, 'ABC234', connected);
      app.onlineGameController.receive({type:'game-started', view:onlineView()});
      app.onlineGameController.setActionSender((action, expectedGameRevision) => {
        session = engine.applyOnlineGameAction(session, 0, {
          ...action, requestId:'browser-gameplay-riichi', expectedGameRevision,
        }, connected, Date.now());
        window.declarationGameplaySession = session;
        app.onlineGameController.receive({type:'game-state', view:onlineView()});
      });
      window.declarationGameplaySession = session;
      const tileId = onlineView().self.riichiTileIds[0];
      return {tileId, canDeclare: Boolean(tileId)};
    }''')
    assert online['canDeclare'], 'the actual online game engine exposed no legal riichi action for the test fixture'
    page.locator(f'#online-player-hand button[data-tile-id="{online["tileId"]}"]').click()
    assert page.locator('#online-riichi').is_enabled(), 'the real online riichi action was not enabled for the legal fixture'
    page.evaluate('window.onlineActionStartedAt = performance.now()')
    page.locator('#online-riichi').click()
    page.locator('#online-table .declaration-bubble[data-declaration="riichi"]').wait_for(timeout=1000)
    page.locator('#online-table').scroll_into_view_if_needed()
    online_metrics = page.evaluate('''() => {
      const bubble = document.querySelector('#online-table .declaration-bubble[data-declaration="riichi"]');
      const table = document.querySelector('#online-table');
      const box = bubble.getBoundingClientRect();
      const style = getComputedStyle(bubble);
      const oldPointerEvents = bubble.style.pointerEvents;
      bubble.style.pointerEvents = 'auto';
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      bubble.style.pointerEvents = oldPointerEvents;
      const show = [...window.declarationBubbleShows].reverse().find(event => event.mode === 'online');
      return {
        label: bubble.textContent, box: {left:box.left,top:box.top,right:box.right,bottom:box.bottom},
        table: table.getBoundingClientRect().toJSON(),
        display: style.display, visibility: style.visibility, opacity: Number(style.opacity),
        color: style.color, background: style.backgroundColor, fontSize: parseFloat(style.fontSize),
        width: box.width, height: box.height,
        inViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        topmost: hit === bubble || bubble.contains(hit),
        operationToShowMs: show ? show.at - window.onlineActionStartedAt : null,
        stateEstablished: window.declarationGameplaySession.declarations.some(event => event.kind === 'riichi'),
      };
    }''')
    assert online_metrics['stateEstablished'], f'online engine did not publish its resolved riichi state: {online_metrics}'
    assert online_metrics['operationToShowMs'] is not None and 0 <= online_metrics['operationToShowMs'] < 500, online_metrics
    assert_visible_bubble('online 320px', online_metrics, 'リーチ')
    page.screenshot(path=str(OUT / 'declaration-gameplay-online-320.png'))
    page.wait_for_timeout(1800)
    assert page.locator('#online-table .declaration-bubble').count() == 1, 'online bubble disappeared before two seconds'
    page.wait_for_timeout(350)
    assert page.locator('#online-table .declaration-bubble').count() == 0, 'online bubble did not disappear after two seconds'
    assert not errors, f'page errors: {errors}'
    print('Local and online riichi UI actions produced visible 320px bubbles and each expired after two seconds.')
    print(f'local evidence: {json.dumps(local_metrics, ensure_ascii=False)}')
    print(f'online evidence: {json.dumps(online_metrics, ensure_ascii=False)}')
    browser.close()
