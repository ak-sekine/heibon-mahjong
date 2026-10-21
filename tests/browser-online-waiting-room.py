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
  const suits = ['man', 'pin', 'sou'];
  const makeTile = (id, index = 0) => ({ id, tile: { category: 'suited', suit: suits[index % 3], rank: (index % 9) + 1, isRed: false } });
  let gameRevision = 0;
  let gameStarted = false;
  let gameStatus = 'playing';
  let phase = 'awaiting-discard';
  let turnPlayerId = 0;
  let roundNumber = 1;
  let decision = null;
  let roundResult = null;
  let viewerOverride = null;
  let declarationIndexes = [-1, -1, -1, -1];
  let hands = [0, 1, 2, 3].map(seat => Array.from({ length: 13 }, (_, i) => makeTile(`online-${seat}-${i}`, seat + i)));
  let drawnTiles = [makeTile('online-0-draw', 7), null, null, null];
  let rivers = [[], [], [], []];
  const wind = ['east', 'south', 'west', 'north'];
  const makeView = viewerSeat => {
    const viewSeats = [0, 1, 2, 3].map(seat => ({
      seat,
      name: state.seats[seat].name,
      control: state.seats[seat].kind,
      connected: state.seats[seat].kind === 'cpu' || state.seats[seat].connected,
      wind: wind[(seat + 4) % 4],
      isDealer: seat === 0,
      points: 25000,
      riichi: declarationIndexes[seat] >= 0,
      ...(declarationIndexes[seat] >= 0 ? { riichiDeclarationTileId: rivers[seat][declarationIndexes[seat]]?.id } : {}),
      concealedCount: hands[seat].length + Number(Boolean(drawnTiles[seat])),
      ...(seat === viewerSeat ? { hand: hands[seat], drawnTile: drawnTiles[seat] } : {}),
      river: rivers[seat],
      melds: [],
    }));
    const callTiles = [hands[viewerSeat][0], hands[viewerSeat][1], makeTile('online-called', 8)];
    return {
      type: 'game-state', roomCode: code, gameRevision, viewerSeat, status: gameStatus,
      round: { roundNumber, dealerId: 0, honba: 0, points: [25000, 25000, 25000, 25000], depositSticks: 0 },
      phase, turnPlayerId, liveWallCount: 90 - gameRevision, seats: viewSeats,
      doraIndicators: [makeTile('online-dora', 4)],
      self: {
        seat: viewerSeat, isHost: viewerSeat === 0,
        discardableTileIds: gameStatus === 'playing' && phase === 'awaiting-discard' && turnPlayerId === viewerSeat
          ? [...hands[viewerSeat].map(tile => tile.id), ...(drawnTiles[viewerSeat] ? [drawnTiles[viewerSeat].id] : [])] : [],
        riichiTileIds: [], canTsumo: false, canKyuushuKyuuhai: false, kanOptions: [],
        callOptions: decision?.type === 'call' && viewerSeat === decision.seat ? [{
          id: 'call-option-1', type: 'chi', tiles: callTiles, calledTileId: 'online-called', handTileIds: [callTiles[0].id, callTiles[1].id],
        }] : [],
        canRon: decision?.type === 'ron' && viewerSeat === decision.seat,
        ronTile: decision?.type === 'ron' ? makeTile('online-ron-tile', 8) : null,
        decision: decision?.seat === viewerSeat ? { ...decision, answered: false, expectedGameRevision: decision.baseGameRevision } : null,
      },
      result: roundResult,
    };
  };
  const broadcastGame = type => sockets.forEach(socket => {
    const viewer = viewerOverride === null ? socket.seat : viewerOverride;
    send(socket, { type, view: makeView(viewer) });
  });
  const gameResult = (socket, message, ok, codeName) => send(socket, {
    type: 'game-action-result', requestId: message.requestId, ok, gameRevision,
    ...(codeName ? { code: codeName } : {}),
  });
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
      this.seat = 0;
      sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== MockWebSocket.CONNECTING) return;
        this.readyState = MockWebSocket.OPEN;
        if (state.seats[0].connected === false) state.revision++;
        state.seats[0].connected = true;
        this.dispatchEvent(new Event('open'));
        send(this, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) });
        if (gameStarted) send(this, { type: 'game-state', view: makeView(this.seat) });
      }, 5);
    }
    send(raw) {
      const message = JSON.parse(raw);
      if (message.type === 'request-state') {
        send(this, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) });
        return;
      }
      if (message.type === 'request-game-state') {
        if (gameStarted) send(this, { type: 'game-state', view: makeView(this.seat) });
        return;
      }
      if (message.type === 'start-game') {
        if (this.seat !== 0) return gameResult(this, message, false, 'not_host');
        if (gameStarted) return gameResult(this, message, false, 'already_started');
        gameStarted = true;
        gameRevision = 1;
        gameResult(this, message, true);
        send(this, { type: 'game-started', view: makeView(this.seat) });
        broadcastGame('game-state');
        return;
      }
      if (message.type === 'discard') {
        if (!gameStarted || gameStatus !== 'playing') return gameResult(this, message, false, 'game_not_playing');
        if (turnPlayerId !== this.seat || phase !== 'awaiting-discard') return gameResult(this, message, false, 'not_your_turn');
        const playerHand = hands[this.seat];
        const fromHand = playerHand.find(tile => tile.id === message.tileId);
        const discarded = fromHand ?? drawnTiles[this.seat];
        if (!discarded || discarded.id !== message.tileId) return gameResult(this, message, false, 'invalid_action');
        if (fromHand) hands[this.seat] = [...playerHand.filter(tile => tile.id !== message.tileId), drawnTiles[this.seat]].filter(Boolean);
        drawnTiles[this.seat] = null;
        rivers[this.seat] = [...rivers[this.seat], discarded];
        phase = 'awaiting-draw';
        turnPlayerId = (this.seat + 1) % 4;
        gameRevision++;
        gameResult(this, message, true);
        broadcastGame('game-state');
        return;
      }
      if (message.type === 'pass-ron' || message.type === 'pass-call' || message.type === 'declare-ron' || message.type === 'declare-call') {
        if (!decision || decision.windowId !== message.windowId || decision.baseGameRevision !== message.expectedGameRevision) {
          return gameResult(this, message, false, 'stale_decision');
        }
        if (message.type === 'pass-ron') { phase = 'awaiting-call'; decision = null; }
        else if (message.type === 'pass-call' || message.type === 'declare-call') { phase = 'awaiting-discard'; turnPlayerId = this.seat; decision = null; }
        else { phase = 'won'; gameStatus = 'round-ended'; decision = null; }
        gameRevision++;
        gameResult(this, message, true);
        broadcastGame('game-state');
        return;
      }
      if (message.type === 'next-round') {
        if (this.seat !== 0 || gameStatus !== 'round-ended') return gameResult(this, message, false, 'round_not_ended');
        gameStatus = 'playing'; phase = 'awaiting-discard'; roundNumber++; turnPlayerId = 0; decision = null; roundResult = null;
        hands = [0, 1, 2, 3].map(seat => Array.from({ length: 13 }, (_, i) => makeTile(`online-r${roundNumber}-${seat}-${i}`, seat + i)));
        drawnTiles = [makeTile(`online-r${roundNumber}-0-draw`, 7), null, null, null];
        rivers = [[], [], [], []];
        gameRevision++;
        gameResult(this, message, true);
        broadcastGame('game-state');
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
        if (gameStarted && gameStatus === 'playing') {
          gameStatus = 'aborted'; phase = 'awaiting-discard'; gameRevision++;
          result(this, message, true);
          broadcast(this);
          send(this, { type: 'game-aborted', gameRevision, reason: 'participant-left' });
          this.finish(4003, 'Participant left');
          return;
        }
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
  const requests = [];
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
    setViewerSeat(seat) {
      viewerOverride = seat;
      sockets.filter(socket => socket.readyState === MockWebSocket.OPEN).forEach(socket => {
        socket.seat = seat;
        send(socket, { type: 'game-state', view: makeView(seat) });
      });
    },
    advanceCpu() {
      if (!gameStarted || gameStatus !== 'playing') return;
      if (turnPlayerId === 1) {
        rivers[1] = [...rivers[1], makeTile(`online-guest-discard-${gameRevision}`, 2)];
        gameRevision++;
      }
      turnPlayerId = 2;
      phase = 'awaiting-discard';
      drawnTiles[2] = makeTile(`online-cpu-draw-${gameRevision}`, 5);
      gameRevision++;
      rivers[2] = [...rivers[2], makeTile(`online-cpu-discard-${gameRevision}`, 6)];
      drawnTiles[2] = null;
      turnPlayerId = 0;
      phase = 'awaiting-discard';
      gameRevision++;
      broadcastGame('game-state');
    },
    showRon() {
      if (!gameStarted || gameStatus !== 'playing') return;
      gameRevision++;
      phase = 'awaiting-ron';
      decision = { windowId: '1'.repeat(24), type: 'ron', seat: 0, baseGameRevision: gameRevision, expiresAt: Date.now() + 30000 };
      broadcastGame('game-state');
    },
    showCall() {
      if (!gameStarted || gameStatus !== 'playing') return;
      gameRevision++;
      phase = 'awaiting-call';
      decision = { windowId: '2'.repeat(24), type: 'call', seat: 0, baseGameRevision: gameRevision, expiresAt: Date.now() + 30000 };
      broadcastGame('game-state');
    },
    endRound() {
      if (!gameStarted) return;
      gameRevision++;
      phase = 'won';
      gameStatus = 'round-ended';
      const points = [25000, 25000, 25000, 25000];
      roundResult = {
        reason: 'tsumo', roundNumber, dealerId: 0, honba: 0, before: points, after: points,
        deltas: [0, 0, 0, 0], payments: [], deposits: null, tenpai: null,
        winners: [{ winnerId: 0, method: 'tsumo', winningTile: makeTile(`online-result-${gameRevision}`, 4), totalPoints: 1300,
          han: 1, fu: 30, yakumanCount: 0, yaku: [{ id: 'riichi', han: 1, yakuman: false }],
          dora: { normal: 0, ura: 0, red: 0 }, fuEntries: [] }],
        matchEnded: false, next: { roundNumber: roundNumber + 1, dealerId: 1, honba: 0 },
      };
      broadcastGame('game-state');
    },
    showRiverScenario(viewerSeat, count, declarationIndex = -1) {
      viewerOverride = viewerSeat;
      declarationIndexes = [0, 1, 2, 3].map(() => declarationIndex);
      rivers = [0, 1, 2, 3].map(seat => Array.from({ length: count }, (_, index) =>
        makeTile(`online-river-fixture-${viewerSeat}-${seat}-${index}`, index + seat)));
      gameRevision++;
      broadcastGame('game-state');
    },
    resetRivers() {
      viewerOverride = 0;
      declarationIndexes = [-1, -1, -1, -1];
      rivers = [[], [], [], []];
      gameRevision++;
      broadcastGame('game-state');
    },
    privateTileIds(viewerSeat) {
      return hands.flatMap((hand, seat) => seat === viewerSeat ? [] : [
        ...hand.map(tile => tile.id), ...(drawnTiles[seat] ? [drawnTiles[seat].id] : []),
      ]);
    },
    forceDisconnect() { sockets.filter(socket => socket.readyState === MockWebSocket.OPEN).at(-1)?.forceDisconnect(); },
    get ticketRequests() { return tickets; },
    get requests() { return requests; },
    get copied() { return copied; },
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const requestUrl = new URL(String(url), location.href);
    if (requestUrl.origin !== 'https://online-mock.invalid') return nativeFetch(url, init);
    requests.push({ path: requestUrl.pathname, body: init.body ? JSON.parse(init.body) : null });
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
    def wait_for(expression, **kwargs):
        try:
            return page.wait_for_function(expression, **kwargs)
        except Exception as error:
            raise AssertionError(f'online browser UI wait timed out: {expression}') from error

    def select_menu_item(selector):
        if page.locator('#main-menu-items').is_hidden():
            page.locator('#main-menu-toggle').click()
        page.locator(selector).click()

    def measure_shared_layout():
        return page.evaluate('''() => {
          const rect = (element, origin) => {
            const box = element.getBoundingClientRect();
            const base = origin ? origin.getBoundingClientRect() : {left: 0, top: 0};
            return Object.fromEntries(['left','top','width','height'].map(key => [key, Number((box[key] - (key === 'left' ? base.left : key === 'top' ? base.top : 0)).toFixed(2))]));
          };
          const style = element => {
            const value = getComputedStyle(element);
            return {background: value.backgroundColor, color: value.color, border: value.borderColor,
              radius: value.borderRadius, padding: value.padding, fontSize: value.fontSize,
              fontWeight: value.fontWeight, lineHeight: value.lineHeight, gap: value.gap};
          };
          const collect = online => {
            const root = document.querySelector('main');
            const summary = document.querySelector(online ? '[data-online-summary]' : '#local-table-summary');
            const table = document.querySelector(online ? '#online-table' : '#local-table');
            const center = table.querySelector(online ? '[data-online-center-info]' : '.center-info');
            const controls = document.querySelector(online ? '#online-game-controls' : '#local-game-controls');
            const status = controls.querySelector(online ? '#online-game-action-status' : '#selection-status');
            const discard = controls.querySelector(online ? '#online-discard' : '#discard');
            const labels = online
              ? Object.fromEntries([...summary.querySelectorAll('[data-online-label]')].map(node => [node.dataset.onlineLabel, rect(node, summary)]))
              : Object.fromEntries([['top','#label-2'],['right','#label-1'],['bottom','#label-0'],['left','#label-3']].map(([position, selector]) => [position, rect(summary.querySelector(selector), summary)]));
            const rivers = online
              ? Object.fromEntries([...table.querySelectorAll('[data-online-river]')].map(node => [node.dataset.onlineRiver, rect(node, table)]))
              : Object.fromEntries([['top','2'],['right','1'],['bottom','0'],['left','3']].map(([position, id]) => [position, rect(table.querySelector(`.river[data-player-id="${id}"]`), table)]));
            const dora = center.querySelector('.dora-indicators');
            const buttonStyle = style(discard);
            const buttonRect = rect(discard, controls);
            return {
              summary: rect(summary, root), table: rect(table, root), center: rect(center, table),
              round: rect(center.querySelector('.round-label'), table), wall: rect(center.querySelector('.wall-count'), table),
              doraArea: rect(center.querySelector('.dora-area'), table), dora: rect(dora, table),
              doraTile: rect(dora.querySelector('svg'), table), deposits: rect(center.querySelector('.deposit-sticks'), table),
              labels, rivers, controls: rect(controls, root), status: rect(status, controls), discard: buttonRect,
              labelStyle: style(summary.querySelector('.seat-label')), centerStyle: style(center),
              controlsStyle: style(controls), statusStyle: style(status), discardStyle: buttonStyle,
              discardHitbox: buttonRect.width >= 44 && buttonRect.height >= 44,
            };
          };
          const onlineRoot = document.querySelector('#online-match');
          const wasHidden = onlineRoot.hidden;
          const wasActive = document.body.classList.contains('online-game-active');
          const online = collect(true);
          try {
            onlineRoot.hidden = true;
            document.body.classList.remove('online-game-active');
            const local = collect(false);
            return {online, local, noOverflow: document.documentElement.scrollWidth <= innerWidth};
          } finally {
            onlineRoot.hidden = wasHidden;
            if (wasActive) document.body.classList.add('online-game-active');
          }
        }''')

    page.wait_for_selector('#player-hand svg')
    wait_for('typeof window.onlineUiTest === "object"')
    private_ids = page.evaluate('''() => window.onlineUiTest.controller.game.players.slice(1).flatMap(player => [
      ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []),
    ]).map(tile => tile.id)''')
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table did not render'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked before opening the room'

    assert page.locator('#main-menu-toggle').is_visible(), 'the shared hamburger menu was not rendered'
    page.locator('#main-menu-toggle').click()
    assert page.locator('#main-menu-items').is_visible(), 'the hamburger menu did not open'
    menu_metrics = page.evaluate('''() => {
      const menu = document.querySelector('#main-menu-items');
      const style = getComputedStyle(menu);
      const buttons = [...menu.querySelectorAll('button:not([hidden])')].map(button => {
        const rect = button.getBoundingClientRect();
        const computed = getComputedStyle(button);
        return {width: rect.width, height: rect.height, background: computed.backgroundColor, padding: computed.padding};
      });
      return {background: style.backgroundColor, gap: style.gap, borderRadius: style.borderRadius, buttons};
    }''')
    assert menu_metrics['gap'] == '0px' and menu_metrics['background'] in ('rgb(255, 253, 247)', 'rgb(255, 255, 255)'), menu_metrics
    assert all(button['height'] >= 44 and button['width'] >= 44 and button['background'] in ('rgba(0, 0, 0, 0)', 'transparent') for button in menu_metrics['buttons']), menu_metrics
    assert [item.inner_text() for item in page.locator('#main-menu-items button:not([hidden])').all()] == [
      'オフラインで新規対局', '新しくルームを作る', 'ルームに参加する',
    ], 'the menu did not show the three requested actions in order'
    assert page.locator('#menu-room').is_hidden(), 'room operations were shown before joining a room'
    assert page.locator('#main-menu-toggle').get_attribute('aria-expanded') == 'true', 'menu expanded state was not announced'
    page.locator('#main-menu-toggle').click()
    assert page.locator('#main-menu-items').is_hidden(), 'the hamburger menu did not close on a second press'
    page.locator('#main-menu-toggle').press('Enter')
    assert page.locator('#new-game').evaluate('element => document.activeElement === element'), 'keyboard open did not focus the first menu item'
    page.keyboard.press('ArrowDown')
    assert page.locator('#online-create-open').evaluate('element => document.activeElement === element'), 'arrow navigation did not move through menu items'
    page.keyboard.press('Escape')
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'Escape did not return focus to the menu button'
    page.locator('#main-menu-toggle').click()
    page.locator('h1').click()
    assert page.locator('#main-menu-items').is_hidden(), 'clicking outside did not close the menu'
    select_menu_item('#new-game')
    assert page.locator('#new-game-dialog').evaluate('element => element.open'), 'new-game menu item did not open the existing confirmation'
    page.locator('#cancel-new-game').click()
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'dismissing the new-game dialog did not restore focus to the visible menu button'

    assert page.locator('#online-create-name').count() == 1 and page.locator('#online-join-name').count() == 1, 'create and join must have separate display-name fields'
    assert page.evaluate('''() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return new Set(ids).size === ids.length; }'''), 'the UI contains duplicate DOM IDs'
    assert page.locator('#online-create-name').get_attribute('maxlength') == '24' and page.locator('#online-join-name').get_attribute('maxlength') == '24', 'display-name length limit changed'
    select_menu_item('#online-create-open')
    assert page.locator('#main-menu-items').is_hidden(), 'selecting a menu item did not close the menu'
    assert page.locator('#online-create-dialog').evaluate('element => element.open'), 'room creation did not open its dedicated dialog'
    assert page.locator('#online-join-dialog').evaluate('element => !element.open'), 'room creation also opened the join dialog'
    assert page.locator('#online-create-dialog h2').inner_text() == '新しくルームを作る', 'room creation dialog title was not shown'
    assert page.locator('#online-create-dialog label').all_inner_texts() == ['表示名'], 'room creation dialog showed unrelated fields'
    assert page.locator('#online-create-dialog #online-join').count() == 0, 'room creation dialog contains a join button'
    assert page.locator('#online-create').is_disabled(), 'room creation was enabled without a display name'
    page.locator('#online-create-name').fill('   ')
    assert page.locator('#online-create').is_disabled(), 'room creation was enabled for a whitespace-only display name'
    page.locator('#online-create-name').fill('テストホスト')
    assert page.locator('#online-create').is_enabled(), 'room creation remained disabled after entering a valid display name'
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the display name was not shared with the join form'
    create_form_layouts = []
    for width, height in [[320,700],[375,812],[390,844],[430,932]]:
      page.set_viewport_size({'width': width, 'height': height})
      layout = page.locator('#online-create-dialog').evaluate('''dialog => {
        const rect = dialog.getBoundingClientRect();
        const form = dialog.querySelector('#online-create-form');
        return {
          left: rect.left, right: rect.right, width: rect.width,
          dialogClientWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth,
          formClientWidth: form.clientWidth, formScrollWidth: form.scrollWidth,
          controls: [...form.querySelectorAll('input,button')].map(control => {
            const box = control.getBoundingClientRect(); return {width: box.width, height: box.height};
          }),
        };
      }''')
      assert layout['left'] >= 0 and layout['right'] <= width, (width, layout)
      assert layout['dialogScrollWidth'] <= layout['dialogClientWidth'], (width, layout)
      assert layout['formScrollWidth'] <= layout['formClientWidth'], (width, layout)
      assert all(control['width'] <= layout['formClientWidth'] and control['height'] >= 44 for control in layout['controls']), (width, layout)
      assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'create dialog caused horizontal overflow')
      create_form_layouts.append([width, round(layout['width'], 2)])
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#online-create-close').click()
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'closing the create form did not restore menu focus'
    select_menu_item('#online-join-open')
    assert page.locator('#online-join-dialog').evaluate('element => element.open'), 'room joining did not open its dedicated dialog'
    assert page.locator('#online-create-dialog').evaluate('element => !element.open'), 'room joining also opened the create dialog'
    assert page.locator('#online-join-dialog h2').inner_text() == 'ルームに参加する', 'room join dialog title was not shown'
    assert page.locator('#online-join-dialog label').all_inner_texts() == ['表示名', 'ルームコード'], 'room join dialog did not show only its required fields'
    assert page.locator('#online-join-dialog #online-create').count() == 0, 'room join dialog contains a create button'
    assert page.locator('#online-join-code').get_attribute('maxlength') == '6', 'room code length limit changed'
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the previous display name was not initially shown in the join dialog'
    assert page.locator('#online-join').is_disabled(), 'room joining was enabled without a room code'
    join_form_layouts = []
    for width, height in [[320,700],[375,812],[390,844],[430,932]]:
      page.set_viewport_size({'width': width, 'height': height})
      layout = page.locator('#online-join-dialog').evaluate('''dialog => {
        const rect = dialog.getBoundingClientRect();
        const form = dialog.querySelector('#online-join-form');
        return {left: rect.left, right: rect.right, width: rect.width,
          dialogClientWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth,
          formClientWidth: form.clientWidth, formScrollWidth: form.scrollWidth,
          controls: [...form.querySelectorAll('input,button')].map(control => {
            const box = control.getBoundingClientRect(); return {width: box.width, height: box.height};
          })};
      }''')
      assert layout['left'] >= 0 and layout['right'] <= width, (width, layout)
      assert layout['dialogScrollWidth'] <= layout['dialogClientWidth'], (width, layout)
      assert layout['formScrollWidth'] <= layout['formClientWidth'], (width, layout)
      assert all(control['width'] <= layout['formClientWidth'] and control['height'] >= 44 for control in layout['controls']), (width, layout)
      assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'join dialog caused horizontal overflow')
      join_form_layouts.append([width, round(layout['width'], 2)])
    page.set_viewport_size({'width': 390, 'height': 320})
    compressed_dialog = page.locator('#online-join-dialog').evaluate('''dialog => ({
      top: dialog.getBoundingClientRect().top,
      bottom: dialog.getBoundingClientRect().bottom,
      scrollHeight: dialog.scrollHeight,
      clientHeight: dialog.clientHeight,
      documentWidth: document.documentElement.scrollWidth,
    })''')
    assert compressed_dialog['top'] >= 0 and compressed_dialog['bottom'] <= 320, compressed_dialog
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), compressed_dialog
    page.locator('#online-join').scroll_into_view_if_needed()
    assert page.locator('#online-join').is_visible(), 'the join action could not be reached after a short viewport resize'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.keyboard.press('Escape')
    assert page.locator('#online-join-dialog').evaluate('element => !element.open'), 'Escape did not close the join dialog'
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'Escape did not restore menu focus from the join dialog'
    select_menu_item('#online-create-open')
    page.locator('#online-create-name').fill('')
    before_empty_submit = page.evaluate('window.onlineMock.requests.length')
    assert page.locator('#online-create').is_disabled(), 'room creation was enabled while the display name was empty'
    assert page.evaluate('window.onlineMock.requests.length') == before_empty_submit, 'an empty display name was sent to the server'
    page.locator('#online-create-name').fill('テストホスト')
    assert page.locator('#online-create').is_enabled(), 'room creation remained disabled after restoring a valid display name'
    page.locator('#online-create').click()
    wait_for("document.querySelector('#online-dialog').open && document.querySelector('#online-room-code').textContent === 'ABC234'")
    assert not page.locator('#online-create-dialog').evaluate('element => element.open'), 'room creation form remained open after success'
    assert not page.locator('#online-join-dialog').evaluate('element => element.open'), 'join form opened after room creation'
    assert page.locator('#online-dialog #online-create-form, #online-dialog #online-join-form').count() == 0, 'input forms were mixed into the room management screen'
    assert page.locator('#online-status').is_visible() and page.locator('#online-status').inner_text().strip(), 'the created room did not show its waiting-room status'
    assert page.evaluate("window.onlineMock.requests[0].body.displayName === 'テストホスト'"), 'room creation did not send the common display name'
    assert page.locator('#menu-room').evaluate('element => !element.hidden'), 'room operations were not added to the menu for an online participant'
    wait_for("document.querySelector('#online-seats').children.length === 4 && document.querySelector('#online-seats').innerText.includes('テストホスト')")
    page.evaluate('window.onlineMock.addGuest()')
    wait_for("document.querySelector('#online-seats').innerText.includes('テスト参加者')")
    assert 'ホスト（あなた）' in page.locator('#online-host').inner_text(), 'the host was not identified in the UI'
    assert '東（テストホスト）' in page.locator('#online-my-seat').inner_text(), 'the current player seat was not identified'
    assert page.locator('#online-finalize').is_visible() and not page.locator('#online-finalize').is_enabled(), 'host finalize was enabled before both players were ready'
    assert 'テスト参加者' in page.locator('#online-seats').inner_text() and '人間' in page.locator('#online-seats').inner_text(), 'human seat was not described in text'

    page.locator('#online-close').click()
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'closing the room dialog did not restore focus to the visible menu button'
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'closing the dialog discarded the session token'
    assert [item.inner_text() for item in page.locator('#main-menu-items button:not([hidden])').all()] == [
      'オフラインで新規対局', '新しくルームを作る', 'ルームに参加する', 'ルーム操作',
    ], 'the three menu actions and room operation were not available during a room session'
    request_count_before_blocked_actions = page.evaluate('window.onlineMock.requests.length')
    select_menu_item('#online-create-open')
    assert page.locator('#online-create').is_disabled(), 'a second room was allowed while a session was active'
    assert 'すでにルームに参加' in page.locator('#online-create-message').inner_text(), 'the active-session restriction was not explained in the create form'
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'opening create form discarded the current session'
    page.locator('#online-create-close').click()
    select_menu_item('#online-join-open')
    assert page.locator('#online-join').is_disabled(), 'joining another room was allowed while a session was active'
    assert 'すでにルームに参加' in page.locator('#online-join-message').inner_text(), 'the active-session restriction was not explained in the join form'
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'opening join form discarded the current session'
    page.locator('#online-join-close').click()
    assert page.evaluate('window.onlineMock.requests.length') == request_count_before_blocked_actions, 'a blocked room action reached the server'
    select_menu_item('#menu-room')
    wait_for('window.onlineMock.ticketRequests >= 2')
    wait_for("document.querySelector('#online-seats').innerText.includes('テスト参加者')")

    page.locator('#online-ready').click()
    wait_for("document.querySelector('#online-ready').textContent === '準備を解除'")
    page.evaluate('window.onlineMock.setGuestReady(true)')
    wait_for('document.querySelector("#online-finalize").disabled === false')

    page.evaluate('window.onlineMock.forceDisconnect()')
    wait_for("document.querySelector('#online-connection').textContent.includes('再接続')")
    wait_for("document.querySelector('#online-seats').innerText.includes('切断中')")
    wait_for('window.onlineMock.ticketRequests >= 3', timeout=10000)
    wait_for("document.querySelector('#online-seats').innerText.includes('接続中')")
    wait_for("document.querySelector('#online-ready').textContent === '準備完了'", timeout=10000)
    page.locator('#online-ready').click()
    wait_for('document.querySelector("#online-finalize").disabled === false')
    page.locator('#online-finalize').click()
    wait_for("document.querySelector('#online-finalized-message').hidden === false")
    assert page.locator('#online-finalized-message').inner_text() == '座席が確定しました。ホストはオンライン対局を開始できます。'
    seat_text = page.locator('#online-seats').inner_text()
    assert 'CPU（西席）' in seat_text and 'CPU（北席）' in seat_text, seat_text
    assert 'ホスト' in seat_text and '自分' in seat_text, seat_text
    assert page.locator('#online-dialog').evaluate('element => element.scrollWidth <= element.clientWidth'), 'online dialog content overflows horizontally'
    page.locator('#online-copy-code').click()
    wait_for("window.onlineMock.copied === 'ABC234'")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow at 390px'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked while the waiting room was open'

    page.locator('#online-start-game').click()
    wait_for("document.querySelector('#online-dialog').open === false && document.querySelector('#online-match').hidden === false")
    wait_for("document.querySelectorAll('#online-player-hand button[data-tile-id]').length === 14")
    assert page.locator('#online-table').is_visible(), 'the online board was not displayed after host start'
    assert page.locator('#online-score-strip').inner_text().count('CPU') == 2, 'the two CPU seats were not shown at the table'
    assert page.locator('[data-online-hand="right"] .tile-back').count() == 13, 'the other human hand was not shown as backs'
    assert page.locator('[data-online-hand="top"] .tile-back').count() == 13, 'the CPU hand was not shown as backs'
    hidden_online_ids = page.evaluate('window.onlineMock.privateTileIds(0)')
    assert all(tile_id not in page.locator('#online-match').inner_html() for tile_id in hidden_online_ids), 'an opponent tile ID reached the online DOM'
    assert page.locator('#online-score-strip [data-online-label="bottom"]').inner_text().startswith('テストホスト'), 'the viewer seat was not placed at the bottom'
    assert page.locator('#online-score-strip [data-online-label="right"]').inner_text().startswith('テスト参加者'), 'the adjacent seat was not placed on the right'
    cpu_one = page.locator('#online-score-strip [data-online-label="top"]').inner_text()
    cpu_two = page.locator('#online-score-strip [data-online-label="left"]').inner_text()
    assert cpu_one.startswith('CPU1') and '西' in cpu_one, f'CPU1 and its west wind were not shown separately: {cpu_one}'
    assert cpu_two.startswith('CPU2') and '北' in cpu_two, f'CPU2 and its north wind were not shown separately: {cpu_two}'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online table causes horizontal overflow at 390px'

    for width, height in [(320,700),(375,812),(390,844),(430,932),(1280,900)]:
      page.set_viewport_size({'width': width, 'height': height})
      geometry = measure_shared_layout()
      assert geometry['noOverflow'], f'shared online/offline scene causes horizontal overflow at {width}px'
      assert geometry['online']['discardHitbox'] and geometry['local']['discardHitbox'], f'discard hitbox is too small at {width}px: {geometry}'
      for part in ['summary','table','center','round','wall','doraArea','dora','doraTile','deposits']:
        for dimension in ['left','top','width','height']:
          online_value = geometry['online'][part][dimension]
          local_value = geometry['local'][part][dimension]
          assert abs(online_value-local_value) <= .5, f'{part} {dimension} differs at {width}px: online={online_value}, offline={local_value}'
      for position in ['top','right','bottom','left']:
        for dimension in ['left','top','width','height']:
          online_value = geometry['online']['labels'][position][dimension]
          local_value = geometry['local']['labels'][position][dimension]
          assert abs(online_value-local_value) <= .5, f'{position} seat label {dimension} differs at {width}px: online={online_value}, offline={local_value}'
        for dimension in ['left','top','width','height']:
          online_value = geometry['online']['rivers'][position][dimension]
          local_value = geometry['local']['rivers'][position][dimension]
          assert abs(online_value-local_value) <= .5, f'{position} river {dimension} differs at {width}px: online={online_value}, offline={local_value}'
      for part in ['labelStyle','centerStyle','controlsStyle','statusStyle','discardStyle']:
        assert geometry['online'][part] == geometry['local'][part], f'{part} differs at {width}px: {geometry["online"][part]} != {geometry["local"][part]}'
      for dimension in ['left','top','width']:
        assert abs(geometry['online']['controls'][dimension]-geometry['local']['controls'][dimension]) <= .5, f'action panel {dimension} differs at {width}px'
      for dimension in ['left','top','width']:
        assert abs(geometry['online']['status'][dimension]-geometry['local']['status'][dimension]) <= .5, f'action status {dimension} differs at {width}px'
      for dimension in ['width','height']:
        assert abs(geometry['online']['discard'][dimension]-geometry['local']['discard'][dimension]) <= .5, f'discard button {dimension} differs at {width}px'
    page.set_viewport_size({'width': 390, 'height': 844})

    page.evaluate('window.onlineMock.setViewerSeat(1)')
    wait_for("document.querySelector('#online-score-strip [data-online-label=bottom]')?.innerText.startsWith('テスト参加者')")
    assert page.locator('#online-score-strip [data-online-label="left"]').inner_text().startswith('テストホスト'), 'seat rotation was wrong for the south player'
    assert page.locator('#online-score-strip [data-online-label="top"]').inner_text().startswith('CPU2'), 'CPU2 name changed when the viewer seat rotated'
    assert page.locator('#online-score-strip [data-online-label="right"]').inner_text().startswith('CPU1'), 'CPU1 name changed when the viewer seat rotated'
    assert page.locator('#online-player-hand button[data-tile-id]').count() == 13, 'the second viewer did not get their own hand'
    hidden_guest_ids = page.evaluate('window.onlineMock.privateTileIds(1)')
    assert all(tile_id not in page.locator('#online-match').inner_html() for tile_id in hidden_guest_ids), 'the guest view exposed other private tile IDs'
    page.evaluate('window.onlineMock.setViewerSeat(0)')
    wait_for("document.querySelectorAll('#online-player-hand button[data-tile-id]').length === 14")

    page.locator('#online-player-hand button[data-tile-id]').first.click()
    assert page.locator('#online-discard').is_enabled(), 'a legal host discard was not enabled after selecting a tile'
    page.locator('#online-discard').click()
    wait_for("document.querySelector('#online-game-action-status').innerText.includes('テスト参加者の手番')")
    assert page.locator('[data-online-river="bottom"] .river-tile').count() == 1, 'the accepted discard was not synchronized into the host river'
    page.evaluate('window.onlineMock.advanceCpu()')
    wait_for("document.querySelector('[data-online-river=top] .river-tile') !== null")

    page.evaluate('window.onlineMock.showRon()')
    wait_for("document.querySelector('#online-ron-controls').hidden === false")
    assert page.locator('#online-ron').is_enabled() and page.locator('#online-pass-ron').is_enabled(), 'ron choices were not actionable'
    page.locator('#online-pass-ron').click()
    wait_for("document.querySelector('#online-ron-controls').hidden === true")
    page.evaluate('window.onlineMock.showCall()')
    wait_for("document.querySelector('#online-call-controls').hidden === false")
    assert page.locator('#online-call-options button[data-online-call]').count() == 1, 'the legal call option was not shown'
    page.locator('#online-call-options button[data-online-call]').click()
    wait_for("document.querySelector('#online-call-controls').hidden === true")

    assert page.locator('#online-open-room').count() == 0, 'room operations button remained in the game action area'
    assert page.locator('#online-game-controls').get_attribute('class') == 'discard-controls', 'online action area did not use the shared controls class'
    action_sizes = page.evaluate('''() => {
      const ids = ['discard','online-discard','riichi','online-riichi','tsumo','online-tsumo','kyuushu-kyuuhai','online-kyuushu','ron','online-ron','pass-ron','online-pass-ron','pass-calls','online-pass-call','next-round','online-next-round'];
      return Object.fromEntries(ids.map(id => {
        const style = getComputedStyle(document.getElementById(id));
        return [id, {minHeight: style.minHeight, padding: style.padding}];
      }));
    }''')
    for offline_id, online_id in [('discard','online-discard'),('riichi','online-riichi'),('tsumo','online-tsumo'),('kyuushu-kyuuhai','online-kyuushu'),('ron','online-ron'),('pass-ron','online-pass-ron'),('pass-calls','online-pass-call'),('next-round','online-next-round')]:
      assert action_sizes[offline_id] == action_sizes[online_id], f'{offline_id} and {online_id} controls do not share dimensions: {action_sizes[offline_id]} != {action_sizes[online_id]}'
    option_sizes = page.evaluate('''() => {
      const measure = selector => {
        const host = document.querySelector(selector);
        let button = host.querySelector('button');
        const created = !button;
        if (!button) { button = document.createElement('button'); button.type = 'button'; button.textContent = '操作'; host.append(button); }
        const style = getComputedStyle(button);
        const result = {minHeight: style.minHeight, minWidth: style.minWidth, padding: style.padding, flex: style.flex};
        if (created) button.remove();
        return result;
      };
      return Object.fromEntries(['#call-options','#online-call-options','#kan-options','#online-kan-options'].map(selector => [selector, measure(selector)]));
    }''')
    assert option_sizes['#call-options'] == option_sizes['#online-call-options'], f'call option buttons do not share dimensions: {option_sizes}'
    assert option_sizes['#kan-options'] == option_sizes['#online-kan-options'], f'kan option buttons do not share dimensions: {option_sizes}'

    for width, height in [(320,700),(375,812),(390,844),(430,932),(1280,900)]:
      page.set_viewport_size({'width': width, 'height': height})
      for count in [1, 6, 7, 18]:
        declaration_cases = [-1] if count < 18 else [-1, 0, 5, 6, 17]
        for viewer in range(4):
          for declaration_index in declaration_cases:
            page.evaluate('args => window.onlineMock.showRiverScenario(args.viewer, args.count, args.declaration)', {
              'viewer': viewer, 'count': count, 'declaration': declaration_index,
            })
            metrics = page.evaluate('''() => {
              const overlaps = (a,b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
              const info = document.querySelector('[data-online-center-info]').getBoundingClientRect();
              const rivers = [...document.querySelectorAll('[data-online-river]')].map(river => {
                const rect = river.getBoundingClientRect();
                const tiles = [...river.querySelectorAll('.river-tile svg')].map(tile => tile.getBoundingClientRect());
                let tileOverlap = false;
                for (let i=0; i<tiles.length; i++) for (let j=i+1; j<tiles.length; j++) tileOverlap ||= overlaps(tiles[i],tiles[j]);
                const declaration = river.querySelector('[data-riichi-declaration="true"] svg');
                const declarationRect = declaration?.getBoundingClientRect();
                const side = river.dataset.onlineRiver === 'left' || river.dataset.onlineRiver === 'right';
                const declarationDirection = !declarationRect || (side ? declarationRect.width < declarationRect.height : declarationRect.width > declarationRect.height);
                return {count: tiles.length, infoOverlap: overlaps(rect,info), tileOverlap, declarationDirection, tilesInRiver: tiles.every(tile =>
                  tile.left >= rect.left - 1 && tile.top >= rect.top - 1 && tile.right <= rect.right + 1 && tile.bottom <= rect.bottom + 1)};
              });
              const table = document.querySelector('#online-table').getBoundingClientRect();
              const overflow = document.documentElement.scrollWidth > innerWidth;
              const overflowElements = overflow ? [...document.querySelectorAll('body *')].map(element => {
                const rect = element.getBoundingClientRect();
                return {tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', left: rect.left, right: rect.right};
              }).filter(element => element.left < -.1 || element.right > innerWidth + .1).sort((a,b) => b.right - a.right).slice(0,12) : [];
              return {overflow, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, overflowElements, tableInsideViewport: table.left >= -1 && table.right <= innerWidth + 1, rivers};
            }''')
            assert not metrics['overflow'] and metrics['tableInsideViewport'], f'online table overflow at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {metrics}'
            assert all(river['count'] == count for river in metrics['rivers']), f'online river count failed at {width}px: {metrics}'
            assert all(not river['infoOverlap'] and not river['tileOverlap'] and river['declarationDirection'] and river['tilesInRiver'] for river in metrics['rivers']), f'online river geometry overlapped at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {metrics}'
          if count == 18:
            page.evaluate('args => window.onlineMock.showRiverScenario(args.viewer, 18, -1)', {'viewer': viewer})
            base_positions = page.evaluate('''() => {
              const table = document.querySelector('#online-table').getBoundingClientRect();
              return Object.fromEntries([...document.querySelectorAll('[data-online-river]')].map(river =>
              [river.dataset.onlineRiver, [...river.querySelectorAll('.river-tile svg')].map(tile => {
                const rect = tile.getBoundingClientRect(); return [rect.left-table.left,rect.top-table.top,rect.width,rect.height];
              })]));
            }''')
            for declaration_index in [0, 5, 6, 17]:
              page.evaluate('args => window.onlineMock.showRiverScenario(args.viewer, 18, args.declaration)', {
                'viewer': viewer, 'declaration': declaration_index,
              })
              changed_positions = page.evaluate('''() => {
                const table = document.querySelector('#online-table').getBoundingClientRect();
                return Object.fromEntries([...document.querySelectorAll('[data-online-river]')].map(river =>
                [river.dataset.onlineRiver, [...river.querySelectorAll('.river-tile svg')].map(tile => {
                  const rect = tile.getBoundingClientRect(); return [rect.left-table.left,rect.top-table.top,rect.width,rect.height];
                })]));
              }''')
              for position, tiles in base_positions.items():
                for index, rect in enumerate(tiles):
                  if index != declaration_index:
                    after_rect = changed_positions[position][index]
                    assert all(abs(before-after) < .1 for before, after in zip(rect, after_rect)), f'riichi declaration moved another {position} discard at {width}px, viewer {viewer}, declaration {declaration_index}, tile {index}: {rect} -> {after_rect}'
      page.screenshot(path=str(OUT / f'step14-2-online-rivers-{width}.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('window.onlineMock.resetRivers()')

    page.evaluate('window.onlineMock.endRound()')
    wait_for("document.querySelector('#online-round-result').hidden === false")
    assert 'ツモ' in page.locator('#online-round-result').inner_text(), 'round result was not displayed'
    assert page.locator('#online-next-round').is_visible() and page.locator('#online-next-round').is_enabled(), 'the host could not advance to the next round'
    page.screenshot(path=str(OUT / 'step14-2-online-game-390.png'), full_page=True)
    page.locator('#online-next-round').click()
    wait_for("document.querySelector('#online-table-round').innerText.includes('東2局')")
    assert page.locator('#online-round-result').is_hidden(), 'the old round result remained after next-round transition'

    hand_before_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    tickets_before_reconnect = page.evaluate('window.onlineMock.ticketRequests')
    page.evaluate('window.onlineMock.forceDisconnect()')
    wait_for(f'window.onlineMock.ticketRequests > {tickets_before_reconnect}', timeout=10000)
    wait_for("document.querySelectorAll('#online-player-hand button[data-tile-id]').length === 14", timeout=10000)
    hand_after_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    assert hand_after_reconnect == hand_before_reconnect, 'the online hand was not restored after reconnect'

    select_menu_item('#menu-room')
    page.locator('#online-leave').click()
    wait_for("!document.querySelector('#online-dialog').open && sessionStorage.getItem('heibon-mahjong-online-session') === null")
    assert page.locator('#online-game-action-status').inner_text() == '参加者が明示的に退出したため、対局を中断しました。', 'an explicit game exit did not show the abort reason'
    page.locator('#online-return-local').click()
    wait_for("document.querySelector('#online-match').hidden === true")

    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') === null"), 'successful leave did not remove the session'
    assert page.locator('#menu-room').is_hidden(), 'room operations remained in the menu after leaving'
    assert '退出しました' in page.locator('#online-status').inner_text(), 'successful leave was not reported'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow after leave'
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table was changed by the waiting room flow'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked after leaving the room'

    select_menu_item('#online-join-open')
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the last display name was not shown when reopening the join form'
    page.locator('#online-join-name').fill('')
    page.locator('#online-join-code').fill('ABC234')
    before_invalid_code = page.evaluate('window.onlineMock.requests.length')
    assert page.locator('#online-join').is_disabled(), 'joining was enabled without a display name'
    assert page.evaluate('window.onlineMock.requests.length') == before_invalid_code, 'a missing display name was sent to the server'
    page.locator('#online-join-name').fill('共通参加者')
    assert page.locator('#online-create-name').input_value() == '共通参加者', 'a join-form name change was not reflected in the create form'
    page.locator('#online-join-code').fill('bad!')
    assert page.locator('#online-join').is_disabled(), 'joining was enabled with an invalid room code'
    assert page.evaluate('window.onlineMock.requests.length') == before_invalid_code, 'an invalid room code was sent to the server'
    page.locator('#online-join-code').fill('ABC234')
    assert page.locator('#online-join').is_enabled(), 'joining remained disabled after both inputs became valid'
    page.locator('#online-join').click()
    wait_for("document.querySelector('#online-dialog').open && document.querySelector('#online-room-code').textContent === 'ABC234' && window.onlineMock.requests.some(request => request.path.endsWith('/join'))")
    assert not page.locator('#online-create-dialog').evaluate('element => element.open'), 'create form remained open after joining'
    assert not page.locator('#online-join-dialog').evaluate('element => element.open'), 'join form remained open after joining'
    assert page.locator('#online-dialog #online-create-form, #online-dialog #online-join-form').count() == 0, 'input forms were mixed into the room management screen after joining'
    assert page.locator('#menu-room').evaluate('element => !element.hidden'), 'room operations were not available after joining'
    assert page.locator('#online-status').is_visible() and page.locator('#online-status').inner_text().strip(), 'the joined room did not show its waiting-room status'
    assert page.evaluate("window.onlineMock.requests.find(request => request.path.endsWith('/join')).body.displayName === '共通参加者'"), 'room join did not send the common display name'
    try:
      wait_for("(() => { const value = sessionStorage.getItem('heibon-mahjong-online-session'); return value !== null && JSON.parse(value).displayName === '共通参加者'; })()")
    except AssertionError as error:
      join_debug = page.evaluate('''() => {
        const value = sessionStorage.getItem('heibon-mahjong-online-session');
        let displayName = null;
        try { displayName = value === null ? null : JSON.parse(value).displayName; } catch {}
        return {
          sessionPresent: value !== null, displayName,
          roomHidden: document.querySelector('#online-room').hidden,
          createDialogOpen: document.querySelector('#online-create-dialog').open,
          joinDialogOpen: document.querySelector('#online-join-dialog').open,
          status: document.querySelector('#online-status').innerText,
          connection: document.querySelector('#online-connection').innerText,
          ticketRequests: window.onlineMock.ticketRequests,
          requests: window.onlineMock.requests,
        };
      }''')
      raise AssertionError(f'room join did not persist the shared display name: {join_debug}') from error
    assert page.evaluate("localStorage.getItem('heibon-mahjong-online-session') === null"), 'online participant session was moved to localStorage'
    assert not errors, errors

    report = {'step': '14.4', 'viewports': [[320,700],[375,812],[390,844],[430,932],[1280,900]], 'createFormViewports': create_form_layouts, 'joinFormViewports': join_form_layouts, 'scenario': 'separate create/join forms, shared display name, input-gated actions, session-safe menu actions, compact hamburger menu, 4-seat river rotation, 1/6/7/18 discards, riichi spacing, action layout, private hands, sync, result, next round, reconnect, exit', 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step14-4-online-room-ui.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
