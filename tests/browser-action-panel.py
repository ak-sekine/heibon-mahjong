import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

out = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui')) / 'browser-action-panel'
out.mkdir(parents=True, exist_ok=True)
reports = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    for width in [320, 375, 390, 430]:
        page = browser.new_page(viewport={'width': width, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:4173/heibon-mahjong/')
        page.evaluate("""async () => {
          const { ActionPanel } = await import('/heibon-mahjong/src/ui/action-panel.ts');
          const { createOnlineActionPanelState } = await import('/heibon-mahjong/src/online/action-panel-state.ts');
          const { TILE_KINDS, ordinaryTile } = await import('/heibon-mahjong/src/model/tile.ts');
          const template = document.querySelector('#game-controls-template');
          const host = document.createElement('div');
          host.style.width = '100%';
          host.style.maxWidth = '430px';
          host.style.margin = '12px auto';
          host.dataset.browserActionPanel = 'true';
          document.body.append(host);
          const clone = (mode, events) => {
            const root = template.content.firstElementChild.cloneNode(true);
            root.setAttribute('aria-label', `${mode} acceptance panel`);
            host.append(root);
            return new ActionPanel(root, event => events.push(event));
          };
          const localEvents = [];
          const onlineEvents = [];
          const localPanel = clone('local', localEvents);
          const onlinePanel = clone('online', onlineEvents);
          const tile = { id: 'own-physical-tile', tile: ordinaryTile(TILE_KINDS.find(t => t.category === 'suited' && t.suit === 'sou' && t.rank === 5)) };
          const view = {
            viewerSeat: 0, status: 'playing', turnPlayerId: 0, phase: 'awaiting-discard', result: null,
            seats: [
              { seat: 0, name: 'You', control: 'human', connected: true, riichi: false, drawnTile: tile },
              { seat: 1, name: 'CPU1', control: 'cpu', connected: true, riichi: false, drawnTile: null },
              { seat: 2, name: 'CPU2', control: 'cpu', connected: true, riichi: false, drawnTile: null },
              { seat: 3, name: 'CPU3', control: 'cpu', connected: true, riichi: false, drawnTile: null },
            ],
            self: {
              seat: 0, isHost: true, discardableTileIds: [tile.id], riichiTileIds: [], canTsumo: false,
              canKyuushuKyuuhai: false, kanOptions: [], callOptions: [], canRon: false, ronTile: null, decision: null,
            },
          };
          const privateMarker = 'opponent-private-physical-id';
          view.seats[1].hand = [{ id: privateMarker, tile: tile.tile }];
          const update = (selected = null, pending = false, decisionPending = false, kanOpen = false, seconds = null) => {
            const state = createOnlineActionPanelState(view, selected, pending, decisionPending, kanOpen, seconds);
            localPanel.update(state);
            onlinePanel.update(state);
            return state;
          };
          window.actionPanelBrowser = { host, localEvents, onlineEvents, localPanel, onlinePanel, view, tile, update, privateMarker };
        }""")

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          const state = test.update();
          const localRoot = test.host.children[0];
          const onlineRoot = test.host.children[1];
          window.actionPanelBrowser.initial = {
            state,
            localDiscardDisabled: localRoot.querySelector('[data-panel-part="discard"]').disabled,
            localRiichiHidden: localRoot.querySelector('[data-panel-part="riichi"]').hidden,
            onlineDiscardDisabled: onlineRoot.querySelector('[data-panel-part="discard"]').disabled,
          };
        }""")
        # Own-turn discard is visible and disabled before a tile is selected.
        assert page.evaluate("""() => {
          const initial = window.actionPanelBrowser.initial;
          return initial.state.buttons.discard.visible && !initial.state.buttons.discard.enabled &&
            !initial.state.buttons.riichi.visible && initial.localDiscardDisabled && initial.localRiichiHidden && initial.onlineDiscardDisabled;
        }""")
        assert page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          const signature = root => [...root.querySelectorAll('[data-panel-part]')].map(node => [
            node.dataset.panelPart, node.hidden, node.disabled ?? false, node.textContent,
          ]);
          return JSON.stringify(signature(test.host.children[0])) === JSON.stringify(signature(test.host.children[1]));
        }""")
        assert page.evaluate("""() => !window.actionPanelBrowser.host.innerHTML.includes(window.actionPanelBrowser.privateMarker)""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="discard"]').count() == 2
        assert page.locator('[data-browser-action-panel] [data-panel-part="discard"]').nth(0).is_disabled()
        assert page.locator('[data-browser-action-panel] [data-panel-part="riichi"]').nth(0).is_hidden()
        assert page.locator('[data-browser-action-panel] [data-panel-part="tsumo"]').nth(0).is_hidden()

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.view.self.riichiTileIds = [test.tile.id];
          test.update(test.tile.id);
        }""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="discard"]').nth(1).is_enabled()
        assert page.locator('[data-browser-action-panel] [data-panel-part="riichi"]').nth(1).is_visible()
        assert page.locator('[data-browser-action-panel] [data-panel-part="riichi"]').nth(1).is_enabled()
        page.locator('[data-browser-action-panel] [data-panel-part="discard"]').nth(0).focus()
        assert page.evaluate("document.activeElement === document.querySelector('[data-browser-action-panel]').children[0].querySelector('[data-panel-part=discard]')")
        page.keyboard.press('Enter')
        assert page.evaluate("window.actionPanelBrowser.localEvents") == [{'type': 'discard'}]

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.host.children[1].querySelector('[data-panel-part="riichi"]').click();
          test.view.self.canTsumo = true;
          test.update(test.tile.id, true);
        }""")
        assert page.evaluate("window.actionPanelBrowser.localEvents") == [{'type': 'discard'}]
        assert page.evaluate("window.actionPanelBrowser.onlineEvents") == [{'type': 'riichi'}]
        assert page.locator('[data-browser-action-panel] [data-panel-part="discard"]').nth(0).is_disabled()
        assert page.locator('[data-browser-action-panel] [data-panel-part="tsumo"]').nth(1).is_visible()

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.view.self.canTsumo = false;
          test.view.self.decision = null;
          test.view.turnPlayerId = 0;
          test.view.phase = 'awaiting-discard';
          test.view.self.kanOptions = [{ id: 'server-kan-option', type: 'ankan', tiles: [test.tile] }];
          test.update(test.tile.id, false, false, true);
        }""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="kan-controls"]').nth(1).is_visible()
        online_panel = page.locator('[data-browser-action-panel] > [data-panel-part="root"]').nth(1)
        online_panel.locator('[data-panel-part="kan-options"] button').click()
        online_events = page.evaluate("window.actionPanelBrowser.onlineEvents")
        assert online_events[-1] == {'type': 'select-kan', 'optionId': 'server-kan-option'}, online_events

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.view.self.kanOptions = [{ id: 'server-kan-option', type: 'ankan', tiles: [test.tile] }];
          test.view.self.callOptions = [{ id: 'server-call-option', type: 'pon', tiles: [test.tile], calledTileId: 'called', handTileIds: ['own-physical-tile'] }];
          test.view.self.decision = { windowId: 'call-1', type: 'call', expiresAt: Date.now() + 10000, expectedGameRevision: 1, answered: false };
          test.view.turnPlayerId = 3;
          test.view.phase = 'awaiting-call';
          test.update(null, false, false, false, 10);
        }""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="call-controls"]').nth(1).is_visible()
        assert page.locator('[data-browser-action-panel] [data-panel-part="pass-call"]').nth(1).is_enabled()
        online_panel.locator('[data-panel-part="call-options"] button').click()
        online_events = page.evaluate("window.actionPanelBrowser.onlineEvents")
        assert online_events[-1] == {'type': 'select-call', 'optionId': 'server-call-option'}, online_events

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.view.self.decision = { ...test.view.self.decision, type: 'ron' };
          test.view.self.canRon = true;
          test.view.self.ronTile = test.tile;
          test.update(null, false, false, false, 0);
        }""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="ron-controls"]').nth(1).is_visible()
        assert page.locator('[data-browser-action-panel] [data-panel-part="ron"]').nth(1).is_disabled()
        assert '判断期限が過ぎました' in page.locator('[data-browser-action-panel] [data-panel-part="ron-status"]').nth(1).inner_text()

        page.evaluate("""() => {
          const test = window.actionPanelBrowser;
          test.view.self.decision = null;
          test.view.status = 'round-ended';
          test.view.result = {};
          test.view.turnPlayerId = 0;
          test.update();
        }""")
        assert page.locator('[data-browser-action-panel] [data-panel-part="show-result"]').nth(1).is_visible()
        assert page.locator('[data-browser-action-panel] [data-panel-part="next-round"]').nth(1).is_visible()
        page.locator('[data-browser-action-panel] [data-panel-part="next-round"]').nth(1).click()
        assert page.evaluate("window.actionPanelBrowser.onlineEvents[-1]") == {'type': 'next-round'}

        layout = page.evaluate("""() => {
          const host = document.querySelector('[data-browser-action-panel]');
          const roots = [...host.children];
          return roots.map(root => ({
            width: root.getBoundingClientRect().width,
            overflow: root.scrollWidth > root.clientWidth,
            buttons: [...root.querySelectorAll('button')].filter(button => !button.closest('[hidden]')).map(button => {
              const box = button.getBoundingClientRect();
              return { left: box.left, right: box.right, width: box.width, height: box.height };
            }),
          }));
        }""")
        assert all(panel['width'] <= width and not panel['overflow'] for panel in layout), (width, layout)
        assert all(button['left'] >= 0 and button['right'] <= width and button['width'] >= 44 and button['height'] >= 44
                   for panel in layout for button in panel['buttons']), (width, layout)
        assert not errors, errors
        reports.append({'width': width, 'result': 'passed', 'checks': ['legal-only', 'shared-renderer', 'mode-handler-delegation', 'pending', 'call', 'ron-timeout', 'result-actions', 'mobile-layout', 'non-public-opponent-id-not-rendered']})
        print(f'{width}px: passed', flush=True)
        page.close()
    browser.close()

(out / 'report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2))
print(json.dumps(reports, ensure_ascii=False))
