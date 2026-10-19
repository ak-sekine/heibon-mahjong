"""Online waiting room UI flow using a deterministic in-page Worker mock."""
import json
import os
import pathlib
import shutil
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
OUT.mkdir(parents=True, exist_ok=True)

MOCK = r"""
(() => {
  const hostToken = 'a'.repeat(64);
  const guestToken = 'b'.repeat(64);
  const code = 'ABC234';
  const empty = seat => ({ seat, kind: 'empty', name: null, connected: false, ready: false, isHost: false });
  const state = {
    roomCode: code, status: 'waiting', hostSeat: 0, revision: 0,
    createdAt: Date.now(), expiresAt: Date.now() + 86400000,
    seats: [
      { seat: 0, kind: 'human', name: 'テストホスト', connected: false, ready: false, isHost: true },
      empty(1), empty(2), empty(3),
    ],
  };
  const sockets = [];
  let tickets = 0;
  let copied = '';
  const send = (socket, message) => {
    if (socket.readyState === MockWebSocket.OPEN) socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  };
  const broadcast = () => sockets.forEach(socket => send(socket, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) }));
  const result = (socket, message, ok, codeName) => send(socket, {
    type: 'action-result', requestId: message.requestId, ok, revision: state.revision,
    ...(codeName ? { code: codeName } : {}),
  });

  class MockWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      super();
      this.readyState = MockWebSocket.CONNECTING;
      sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== MockWebSocket.CONNECTING) return;
        this.readyState = MockWebSocket.OPEN;
        if (state.seats[0].connected === false) state.revision++;
        state.seats[0].connected = true;
        this.dispatchEvent(new Event('open'));
        send(this, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) });
      }, 5);
    }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.type === 'request-state') {
        send(this, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) });
        return;
      }
      if (message.type === 'set-ready') {
        if (state.status !== 'waiting') return result(this, message, false, 'room_finalized');
        state.seats[0].ready = message.ready;
        state.revision++;
        result(this, message, true);
        broadcast();
      } else if (message.type === 'finalize-seats') {
        const humans = state.seats.filter(seat => seat.kind === 'human');
        if (state.hostSeat !== 0) return result(this, message, false, 'not_host');
        if (!humans.every(seat => seat.connected && seat.ready)) return result(this, message, false, 'players_not_ready');
        state.seats = state.seats.map(seat => seat.kind === 'empty'
          ? { seat: seat.seat, kind: 'cpu', name: `CPU（${['東','南','西','北'][seat.seat]}席）`, connected: false, ready: false, isHost: false }
          : seat);
        state.status = 'finalized';
        state.revision++;
        result(this, message, true);
        broadcast();
      } else if (message.type === 'leave-room') {
        state.seats[0] = empty(0);
        state.seats[1] = { ...state.seats[1], isHost: true, ready: false };
        state.seats[2] = empty(2);
        state.seats[3] = empty(3);
        state.status = 'waiting';
        state.hostSeat = 1;
        state.revision++;
        result(this, message, true);
        broadcast();
        this.finish(4003, 'Participant left');
      } else if (message.type === 'close-room') {
        state.status = 'closed';
        state.revision++;
        result(this, message, true);
        broadcast();
        sockets.forEach(socket => socket.finish(4002, 'Room closed'));
      }
    }
    close(code = 1000, reason = '') {
      if (this.readyState >= MockWebSocket.CLOSING) return;
      if (state.seats[0].connected && state.status !== 'closed') {
        state.seats[0].connected = false;
        state.seats[0].ready = false;
        state.revision++;
        broadcast();
      }
      this.finish(code, reason);
    }
    forceDisconnect() {
      if (this.readyState !== MockWebSocket.OPEN) return;
      state.seats[0].connected = false;
      state.seats[0].ready = false;
      state.revision++;
      broadcast();
      this.finish(1006, 'Network interruption');
    }
    finish(code, reason) {
      if (this.readyState >= MockWebSocket.CLOSING) return;
      this.readyState = MockWebSocket.CLOSED;
      const event = new Event('close');
      Object.defineProperties(event, { code: { value: code }, reason: { value: reason } });
      this.dispatchEvent(event);
    }
  }

  window.WebSocket = MockWebSocket;
  window.onlineMock = {
    addGuest() {
      state.seats[1] = { seat: 1, kind: 'human', name: 'テスト参加者', connected: true, ready: false, isHost: false };
      state.revision++;
      broadcast();
      return guestToken;
    },
    setGuestReady(ready) {
      state.seats[1].ready = ready;
      state.revision++;
      broadcast();
    },
    forceDisconnect() { sockets.filter(socket => socket.readyState === MockWebSocket.OPEN).at(-1)?.forceDisconnect(); },
    get ticketRequests() { return tickets; },
    get copied() { return copied; },
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const requestUrl = new URL(String(url), location.href);
    if (requestUrl.origin !== 'https://online-mock.invalid') return nativeFetch(url, init);
    let value;
    if (requestUrl.pathname === '/api/rooms' && init.method === 'POST') {
      value = { roomCode: code, participantToken: hostToken, playerSeat: 0, createdAt: state.createdAt, expiresAt: state.expiresAt, seats: state.seats };
    } else if (requestUrl.pathname === `/api/rooms/${code}/ticket`) {
      tickets++;
      value = { ticket: 'c'.repeat(64), expiresAt: Date.now() + 60000 };
    } else if (requestUrl.pathname === `/api/rooms/${code}/join`) {
      value = { roomCode: code, participantToken: guestToken, playerSeat: 1, createdAt: state.createdAt, expiresAt: state.expiresAt, seats: state.seats };
    } else {
      value = { error: 'not_found' };
      return new Response(JSON.stringify(value), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(value), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async value => { copied = value; } },
  });
})();
"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.add_init_script(MOCK)

    def expose_app(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.onlineUiTest = { controller };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    page.wait_for_selector('#player-hand svg')
    page.wait_for_function('typeof window.onlineUiTest === "object"')
    private_ids = page.evaluate('''() => window.onlineUiTest.controller.game.players.slice(1).flatMap(player => [
      ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []),
    ]).map(tile => tile.id)''')
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table did not render'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked before opening the room'

    page.locator('#online-open').click()
    page.locator('#online-name').fill('テストホスト')
    page.locator('#online-create button[type="submit"]').click()
    page.wait_for_function("document.querySelector('#online-room-code').textContent === 'ABC234'")
    page.wait_for_function("document.querySelector('#online-seats').children.length === 4 && document.querySelector('#online-seats').innerText.includes('テストホスト')")
    page.evaluate('window.onlineMock.addGuest()')
    page.wait_for_function("document.querySelector('#online-seats').innerText.includes('テスト参加者')")
    assert 'ホスト（あなた）' in page.locator('#online-host').inner_text(), 'the host was not identified in the UI'
    assert '東（テストホスト）' in page.locator('#online-my-seat').inner_text(), 'the current player seat was not identified'
    assert page.locator('#online-finalize').is_visible() and not page.locator('#online-finalize').is_enabled(), 'host finalize was enabled before both players were ready'
    assert 'テスト参加者' in page.locator('#online-seats').inner_text() and '人間' in page.locator('#online-seats').inner_text(), 'human seat was not described in text'

    page.locator('#online-close').click()
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'closing the dialog discarded the session token'
    page.locator('#online-open').click()
    page.wait_for_function('window.onlineMock.ticketRequests >= 2')
    page.wait_for_function("document.querySelector('#online-seats').innerText.includes('テスト参加者')")

    page.locator('#online-ready').click()
    page.wait_for_function("document.querySelector('#online-ready').textContent === '準備を解除'")
    page.evaluate('window.onlineMock.setGuestReady(true)')
    page.wait_for_function('document.querySelector("#online-finalize").disabled === false')

    page.evaluate('window.onlineMock.forceDisconnect()')
    page.wait_for_function("document.querySelector('#online-connection').textContent.includes('再接続')")
    page.wait_for_function("document.querySelector('#online-seats').innerText.includes('切断中')")
    page.wait_for_function('window.onlineMock.ticketRequests >= 3', timeout=10000)
    page.wait_for_function("document.querySelector('#online-seats').innerText.includes('接続中')")
    page.wait_for_function("document.querySelector('#online-ready').textContent === '準備完了'", timeout=10000)
    page.locator('#online-ready').click()
    page.wait_for_function('document.querySelector("#online-finalize").disabled === false')
    page.locator('#online-finalize').click()
    page.wait_for_function("document.querySelector('#online-finalized-message').hidden === false")
    assert page.locator('#online-finalized-message').inner_text() == '対局準備完了。オンライン対局の開始機能は今後のステップで対応します。'
    seat_text = page.locator('#online-seats').inner_text()
    assert 'CPU（西席）' in seat_text and 'CPU（北席）' in seat_text, seat_text
    assert 'ホスト' in seat_text and '自分' in seat_text, seat_text
    assert page.locator('#online-dialog').evaluate('element => element.scrollWidth <= element.clientWidth'), 'online dialog content overflows horizontally'
    page.locator('#online-copy-code').click()
    page.wait_for_function("window.onlineMock.copied === 'ABC234'")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow at 390px'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked while the waiting room was open'

    page.locator('#online-leave').click()
    page.wait_for_function("document.querySelector('#online-room').hidden && !document.querySelector('#online-room-forms').hidden")
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') === null"), 'successful leave did not remove the session'
    assert '退出しました' in page.locator('#online-status').inner_text(), 'successful leave was not reported'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow after leave'
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table was changed by the waiting room flow'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked after leaving the room'
    assert not errors, errors

    report = {'step': '14.0.1', 'viewport': [390, 844], 'scenario': 'create, join, ready, reconnect, finalize CPU seats, leave', 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step14-0-1-online-room.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
