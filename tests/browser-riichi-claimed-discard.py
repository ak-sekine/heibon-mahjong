"""Render the deterministic CPU2 riichi declaration claimed by CPU1 pon in Chromium or WebKit."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

browser_name = os.environ.get('HEIBON_BROWSER', 'chromium').lower()
viewport = {'width': 390, 'height': 844}
with sync_playwright() as playwright:
    browser_type = playwright.webkit if browser_name == 'webkit' else playwright.chromium
    launch_options = {}
    if browser_name != 'webkit':
        executable = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
        if executable:
            launch_options['executable_path'] = executable
        launch_options['args'] = ['--no-sandbox']
    browser = browser_type.launch(**launch_options)
    page = browser.new_page(viewport=viewport)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://localhost:4173/heibon-mahjong/')
    page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => { app.controller.random = () => .999999; app.controller.newGame(); })")
    page.wait_for_selector('#player-hand svg')
    result = page.evaluate('''async()=>{
      const app=await import('/heibon-mahjong/src/main.ts');
      const riichi=await import('/heibon-mahjong/src/game/riichi.ts');
      const matchEngine=await import('/heibon-mahjong/src/game/match.ts');
      const fixture=await import('/heibon-mahjong/tests/calls-fixture.ts');
      const riichiFixture=await import('/heibon-mahjong/tests/riichi-fixture.ts');
      const initial=fixture.callStart(2,{
        0:['111p','789m','234s','77z','19s'],
        1:['55m','222z','333z','55z','66z','1z'],
        2:riichiFixture.NO_YAKU_WAIT,
        3:['999p','123s','789s','77z','68m']
      },'man-5');
      const declarationId=initial.players[2].drawnTile.id;
      const match=riichi.declareRiichi(matchEngine.startMatch(initial),2,declarationId);
      app.controller.match=match;
      app.render();
      const river=document.querySelector('.river[data-player-id="2"]');
      const privateIds=match.game.players.slice(1).flatMap(player=>[
        ...player.hand,...(player.drawnTile?[player.drawnTile]:[])
      ]).filter(tile=>tile.id!==declarationId);
      const publicIds=new Set([...document.querySelectorAll('[data-tile-id]')].map(node=>node.dataset.tileId));
      return {
        phase:match.game.phase,turn:match.game.turnPlayerId,
        declarationInRiver:match.game.players[2].river.some(tile=>tile.id===declarationId),
        declarationMarker:river.querySelectorAll('[data-riichi-declaration="true"]').length,
        calledMeld:match.game.players[1].melds[0]?.calledTileId===declarationId,
        activeSeat:document.querySelector('#label-1').dataset.active,
        actionStatus:document.querySelector('#selection-status').textContent,
        deposit:match.depositSticks,points:match.points[2],
        privateHandIdsVisible:privateIds.filter(tile=>publicIds.has(tile.id)).length
      };
    }''')
    browser.close()

assert not errors, f'{browser_name} page errors: {errors}'
expected = {
    'phase': 'awaiting-discard', 'turn': 1,
    'declarationInRiver': False, 'declarationMarker': 0,
    'calledMeld': True, 'activeSeat': 'true',
    'actionStatus': 'CPU1の手番です。', 'deposit': 1, 'points': 24000,
    'privateHandIdsVisible': 0,
}
assert result == expected, f'{browser_name} claimed riichi declaration UI mismatch: {json.dumps(result, ensure_ascii=False)}'
print(f'{browser_name}: CPU2 riichi declaration claimed by CPU1 pon rendered; CPU1 turn, riichi deposit, and concealed-hand privacy verified')
