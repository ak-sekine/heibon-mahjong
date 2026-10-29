"""Exercise every offline player-to-seat ordering at a 320px mobile viewport."""
import os
import shutil
from playwright.sync_api import sync_playwright

ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
launch = {}
if ENGINE == 'chromium':
    launch['executable_path'] = os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium')
    launch['args'] = ['--no-sandbox']

with sync_playwright() as playwright:
    browser = getattr(playwright, ENGINE).launch(**launch)
    page = browser.new_page(viewport={'width': 320, 'height': 700})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/heibon-mahjong/')
    page.wait_for_function("Boolean(document.querySelector('#player-hand'))")
    page.evaluate("import('/heibon-mahjong/src/main.ts').then(app => window.seatingTest = app.controller)")
    page.wait_for_function("Boolean(window.seatingTest)")

    for pick_four in range(4):
        for pick_three in range(3):
            for pick_two in range(2):
                page.evaluate('''([a,b,c]) => {
                  const picks=[a,b,c], sizes=[4,3,2]; let index=0;
                  window.seatingTest.random=()=>index<3?(picks[index]+.25)/sizes[index++]:.999999;
                  window.seatingTest.newGame('tonpu');
                }''', [pick_four, pick_three, pick_two])
                result = page.evaluate('''() => {
                  const controller=window.seatingTest, game=controller.game, viewer=controller.playerSeat;
                  const winds=['東','南','西','北'];
                  const rows=game.players.map(player=>{
                    const display=(player.id-viewer+4)%4;
                    const label=document.querySelector(`#label-${display}`);
                    const river=document.querySelector(`.river[data-player-id="${display}"]`);
                    const section=document.querySelector(`.seat[data-player-id="${display}"]`);
                    return {id:player.id, display, name:controller.playerNames[player.id],
                      labelName:label?.querySelector('.seat-name')?.textContent,
                      wind:label?.querySelector('.seat-wind')?.textContent,
                      dealer:game.dealerId===player.id,
                      dealerMark:Boolean(label?.querySelector('.seat-role')),
                      riverLabel:river?.getAttribute('aria-label'), seatLabel:section?.getAttribute('aria-label')};
                  });
                  return {viewer, human:game.players.filter(player=>player.control==='human').map(player=>player.id),
                    names:controller.playerNames, bottom:document.querySelector('#label-0')?.dataset.self,
                    handCount:document.querySelectorAll('#player-hand svg').length,
                    documentWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth,
                    rows};
                }''')
                assert result['human'] == [result['viewer']], result
                assert result['bottom'] == 'true', result
                assert result['handCount'] >= 13, result
                assert result['documentWidth'] <= result['viewportWidth'], result
                assert len(set(result['names'])) == 4, result
                for row in result['rows']:
                    assert row['display'] == (row['id'] - result['viewer'] + 4) % 4, row
                    assert row['labelName'] == row['name'], row
                    assert row['wind'] == ['東', '南', '西', '北'][row['id']], row
                    assert row['dealer'] == row['dealerMark'], row
                    assert row['riverLabel'] == f"{row['name']}の河", row
                    assert row['seatLabel'] == f"{row['name']}の席", row

    assert not errors, errors
    browser.close()
