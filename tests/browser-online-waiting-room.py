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
      riichi: false,
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
    privateTileIds(viewerSeat) {
      return hands.flatMap((hand, seat) => seat === viewerSeat ? [] : [
        ...hand.map(tile => tile.id), ...(drawnTiles[seat] ? [drawnTiles[seat].id] : []),
      ]);
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
    def wait_for(expression, **kwargs):
        try:
            return page.wait_for_function(expression, **kwargs)
        except Exception as error:
            raise AssertionError(f'online browser UI wait timed out: {expression}') from error

    page.wait_for_selector('#player-hand svg')
    wait_for('typeof window.onlineUiTest === "object"')
    private_ids = page.evaluate('''() => window.onlineUiTest.controller.game.players.slice(1).flatMap(player => [
      ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []),
    ]).map(tile => tile.id)''')
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table did not render'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked before opening the room'

    page.locator('#online-open').click()
    page.locator('#online-name').fill('テストホスト')
    page.locator('#online-create button[type="submit"]').click()
    wait_for("document.querySelector('#online-room-code').textContent === 'ABC234'")
    wait_for("document.querySelector('#online-seats').children.length === 4 && document.querySelector('#online-seats').innerText.includes('テストホスト')")
    page.evaluate('window.onlineMock.addGuest()')
    wait_for("document.querySelector('#online-seats').innerText.includes('テスト参加者')")
    assert 'ホスト（あなた）' in page.locator('#online-host').inner_text(), 'the host was not identified in the UI'
    assert '東（テストホスト）' in page.locator('#online-my-seat').inner_text(), 'the current player seat was not identified'
    assert page.locator('#online-finalize').is_visible() and not page.locator('#online-finalize').is_enabled(), 'host finalize was enabled before both players were ready'
    assert 'テスト参加者' in page.locator('#online-seats').inner_text() and '人間' in page.locator('#online-seats').inner_text(), 'human seat was not described in text'

    page.locator('#online-close').click()
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'closing the dialog discarded the session token'
    page.locator('#online-open').click()
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
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online table causes horizontal overflow at 390px'

    page.evaluate('window.onlineMock.setViewerSeat(1)')
    wait_for("document.querySelector('#online-score-strip [data-online-label=bottom]')?.innerText.startsWith('テスト参加者')")
    assert page.locator('#online-score-strip [data-online-label="left"]').inner_text().startswith('テストホスト'), 'seat rotation was wrong for the south player'
    assert page.locator('#online-player-hand button[data-tile-id]').count() == 13, 'the second viewer did not get their own hand'
    hidden_guest_ids = page.evaluate('window.onlineMock.privateTileIds(1)')
    assert all(tile_id not in page.locator('#online-match').inner_html() for tile_id in hidden_guest_ids), 'the guest view exposed other private tile IDs'
    page.evaluate('window.onlineMock.setViewerSeat(0)')
    wait_for("document.querySelector('#online-player-hand button[data-tile-id]').length === 14")

    page.locator('#online-player-hand button[data-tile-id]').first.click()
    assert page.locator('#online-discard').is_enabled(), 'a legal host discard was not enabled after selecting a tile'
    page.locator('#online-discard').click()
    wait_for("document.querySelector('#online-match-status').innerText.includes('テスト参加者の手番')")
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

    page.evaluate('window.onlineMock.endRound()')
    wait_for("document.querySelector('#online-round-result').hidden === false")
    assert 'ツモ' in page.locator('#online-round-result').inner_text(), 'round result was not displayed'
    assert page.locator('#online-next-round').is_visible() and page.locator('#online-next-round').is_enabled(), 'the host could not advance to the next round'
    page.screenshot(path=str(OUT / 'step14-1-online-game-390.png'), full_page=True)
    page.locator('#online-next-round').click()
    wait_for("document.querySelector('#online-match-round').innerText.includes('東2局')")
    assert page.locator('#online-round-result').is_hidden(), 'the old round result remained after next-round transition'

    hand_before_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    tickets_before_reconnect = page.evaluate('window.onlineMock.ticketRequests')
    page.evaluate('window.onlineMock.forceDisconnect()')
    wait_for(f'window.onlineMock.ticketRequests > {tickets_before_reconnect}', timeout=10000)
    wait_for("document.querySelector('#online-player-hand button[data-tile-id]').length === 14", timeout=10000)
    hand_after_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    assert hand_after_reconnect == hand_before_reconnect, 'the online hand was not restored after reconnect'

    page.locator('#online-open-room').click()
    page.locator('#online-leave').click()
    wait_for("document.querySelector('#online-room').hidden && !document.querySelector('#online-room-forms').hidden")
    assert page.locator('#online-match-status').inner_text() == '参加者が明示的に退出したため、対局を中断しました。', 'an explicit game exit did not show the abort reason'
    page.locator('#online-return-local').click()
    wait_for("document.querySelector('#online-match').hidden === true")

    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') === null"), 'successful leave did not remove the session'
    assert '退出しました' in page.locator('#online-status').inner_text(), 'successful leave was not reported'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow after leave'
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table was changed by the waiting room flow'
    assert all(tile_id not in page.locator('main').inner_html() for tile_id in private_ids), 'CPU private tile IDs leaked after leaving the room'
    assert not errors, errors

    report = {'step': '14.1', 'viewport': [390, 844], 'scenario': '2 humans + CPU seats, seat rotation, private hands, discard sync, CPU update, ron/call controls, result, next round, reconnect, abort', 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step14-1-online-game.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
