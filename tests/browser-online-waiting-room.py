"""Online waiting room UI flow using a deterministic in-page Worker mock."""
import json
import os
import pathlib
import shutil
import sys
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright
from browser_main_fixtures import fixed_seat_fixture

BASE_URL = os.environ.get('HEIBON_URL', 'http://127.0.0.1:4173/heibon-mahjong/')
OUT = pathlib.Path(os.environ.get('HEIBON_SCREENSHOTS', '/tmp/heibon-table-ui'))
ENGINE = os.environ.get('HEIBON_BROWSER', 'chromium')
PUBLIC_HAND_ONLY = os.environ.get('HEIBON_ONLINE_PUBLIC_HAND_ONLY') == '1'
EXIT_NOTICE_ONLY = os.environ.get('HEIBON_ONLINE_EXIT_NOTICE_ONLY') == '1'
RIVER_SPACING_ONLY = os.environ.get('HEIBON_ONLINE_RIVER_SPACING_ONLY') == '1'
RULES_ONLY = os.environ.get('HEIBON_ONLINE_RULES_ONLY') == '1'
NEXT_ROUND_ONLY = os.environ.get('HEIBON_ONLINE_NEXT_ROUND_ONLY') == '1'
OUT.mkdir(parents=True, exist_ok=True)

MOCK = r"""
(() => {
  const hostToken = 'a'.repeat(64);
  const guestToken = 'b'.repeat(64);
  const code = 'ABC234';
  const empty = seat => ({ seat, gameSeat: null, kind: 'empty', name: null, connected: false, ready: false, isHost: false });
  const state = {
    roomCode: code, status: 'waiting', hostSeat: 0, revision: 0, format: 'tonpu', rules: {schemaVersion: 1, matchFormat: 'tonpu'},
    createdAt: Date.now(), expiresAt: Date.now() + 86400000,
    seats: [
      { seat: 0, gameSeat: null, kind: 'human', name: 'テストホスト', connected: false, ready: false, isHost: true },
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
  const gameNameOverrides = {};
  let declarations = [];
  let declarationIndexes = [-1, -1, -1, -1];
  let hands = [0, 1, 2, 3].map(seat => Array.from({ length: 13 }, (_, i) => makeTile(`online-${seat}-${i}`, seat + i)));
  let drawnTiles = [makeTile('online-0-draw', 7), null, null, null];
  let rivers = [[], [], [], []];
  const wind = ['east', 'south', 'west', 'north'];
  const makeView = viewerSeat => {
    const viewSeats = [0, 1, 2, 3].map(seat => ({
      seat,
      name: gameNameOverrides[seat] ?? state.seats[seat].name,
      control: state.seats[seat].kind,
      connected: state.seats[seat].kind === 'cpu' || state.seats[seat].connected,
      wind: wind[(seat + 4) % 4],
      isDealer: seat === 0,
      points: roundResult?.after?.[seat] ?? 25000,
      riichi: declarationIndexes[seat] >= 0 || Boolean(roundResult?.winners?.some(winner => winner.winnerId === seat)),
      ...(declarationIndexes[seat] >= 0 ? { riichiDeclarationTileId: rivers[seat][declarationIndexes[seat]]?.id } : {}),
      concealedCount: hands[seat].length + Number(Boolean(drawnTiles[seat])),
      ...(seat === viewerSeat ? { hand: hands[seat], drawnTile: drawnTiles[seat] } : {}),
      ...(roundResult?.winners?.some(winner => winner.winnerId === seat) ? {
        revealedHand: [...Array.from({ length: 13 }, (_, i) => makeTile(`online-result-hand-${seat}-${i}`, seat + i)), roundResult.winners.find(winner => winner.winnerId === seat).winningTile],
      } : {}),
      ...(roundResult?.reason === 'kyuushu-kyuuhai' && roundResult.abortiveDrawPlayerId === seat
        ? { revealedHand: [...hands[seat], ...(drawnTiles[seat] ? [drawnTiles[seat]] : [])] } : {}),
      river: rivers[seat],
      melds: [],
    }));
    const callTiles = [hands[viewerSeat][0], hands[viewerSeat][1], makeTile('online-called', 8)];
    return {
      type: 'game-state', format: state.format, roomCode: code, gameRevision, viewerSeat, status: gameStatus,
      declarations: JSON.parse(JSON.stringify(declarations)),
      round: { format: state.format, roundWind: gameStatus === 'match-ended' && state.format === 'tonnan' ? 'south' : 'east', roundNumber, dealerId: 0, honba: roundResult?.honba ?? 0, points: roundResult?.after ?? [25000, 25000, 25000, 25000], depositSticks: roundResult?.reason === 'draw' ? 1 : 0 },
      phase, turnPlayerId, liveWallCount: 90 - gameRevision, seats: viewSeats,
      doraIndicators: [makeTile('online-dora', 4)],
      ...(roundResult?.winners?.length ? { uraDoraIndicators: [makeTile('online-ura-dora', 5)] } : {}),
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
  let dropNextGameResult = false;
  const gameResult = (socket, message, ok, codeName) => {
    if (dropNextGameResult) { dropNextGameResult = false; return; }
    send(socket, { type: 'game-action-result', requestId: message.requestId, ok, gameRevision,
      ...(codeName ? { code: codeName } : {}) });
  };
  const sockets = [];
  const gameActions = [];
  let tickets = 0;
  let nextSocketSeat = 0;
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
      this.seat = nextSocketSeat;
      nextSocketSeat = 0;
      sockets.push(this);
      setTimeout(() => {
        if (this.readyState !== MockWebSocket.CONNECTING) return;
        this.readyState = MockWebSocket.OPEN;
        if (state.seats[this.seat].connected === false) state.revision++;
        state.seats[this.seat].connected = true;
        this.dispatchEvent(new Event('open'));
        send(this, { type: 'room-state', ...JSON.parse(JSON.stringify(state)) });
        if (gameStarted) send(this, { type: 'game-state', view: makeView(this.seat) });
      }, 5);
    }
    send(raw) {
      const message = JSON.parse(raw);
      if (['discard', 'declare-riichi', 'declare-tsumo', 'declare-kyuushu-kyuuhai', 'declare-kan', 'declare-ron', 'pass-ron', 'declare-call', 'pass-call', 'next-round'].includes(message.type)) gameActions.push(message.type);
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
        declarations = [];
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
        declarationIndexes = [-1, -1, -1, -1];
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
        const gameSeats = [2, 0, 3, 1];
        state.seats = state.seats.map(seat => ({
          ...seat,
          gameSeat: gameSeats[seat.seat],
          ...(seat.kind === 'empty' ? { kind: 'cpu', name: `CPU${seat.seat === 2 ? 1 : 2}` } : {}),
        }));
        state.status = 'finalized';
        state.revision++;
        result(this, message, true);
        broadcast();
      } else if (message.type === 'leave-room') {
        if (gameStarted && gameStatus !== 'aborted' && state.seats.filter(seat => seat.kind === 'human').length > 1) {
          const departedName = state.seats[this.seat].name;
          const cpuSeats = state.seats.filter(seat => seat.kind === 'cpu').map(seat => seat.seat).concat(this.seat).sort((a, b) => a - b);
          const cpuName = `CPU${cpuSeats.indexOf(this.seat) + 1}`;
          state.seats[this.seat] = {
            seat: this.seat, gameSeat: state.seats[this.seat].gameSeat, kind: 'cpu', name: cpuName,
            connected: false, ready: false, isHost: false,
          };
          const successor = state.seats.find(seat => seat.kind === 'human').seat;
          state.hostSeat = successor;
          state.seats.forEach(seat => { seat.isHost = seat.seat === successor; });
          state.status = 'finalized';
          state.revision++;
          gameRevision++;
          result(this, message, true);
          broadcast();
          broadcastGame('game-state');
          sockets.filter(socket => socket !== this && socket.readyState === MockWebSocket.OPEN).forEach(socket => send(socket, {
            type: 'seat-taken-over', seat: this.seat, departedName, cpuName,
            hostChanged: true, hostSeat: successor, hostName: state.seats[successor].name,
          }));
          this.finish(4003, 'Participant left');
          return;
        }
        if (gameStarted) {
          gameStatus = 'aborted'; phase = 'awaiting-discard'; gameRevision++;
          state.status = 'closed'; state.hostSeat = null; state.revision++;
          result(this, message, true);
          broadcast();
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
      if (state.seats[this.seat].connected && state.status !== 'closed') {
        state.seats[this.seat].connected = false;
        state.seats[this.seat].ready = false;
        state.revision++;
        broadcast();
      }
      this.finish(code, reason);
    }
    forceDisconnect() {
      if (this.readyState !== MockWebSocket.OPEN) return;
      state.seats[this.seat].connected = false;
      state.seats[this.seat].ready = false;
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
      state.seats[1] = { seat: 1, gameSeat: null, kind: 'human', name: 'テスト参加者', connected: true, ready: false, isHost: false };
      state.revision++;
      broadcast();
      return guestToken;
    },
    setAdditionalGuests() {
      state.seats[2] = { seat: 2, gameSeat: null, kind: 'human', name: '参加者名がとても長いテスト表示用の名前', connected: true, ready: false, isHost: false };
      state.seats[3] = { seat: 3, gameSeat: null, kind: 'human', name: 'もう一人の長い参加者表示名テスト', connected: true, ready: true, isHost: false };
      state.revision++;
      broadcast();
    },
    clearAdditionalGuests() {
      state.seats[2] = empty(2);
      state.seats[3] = empty(3);
      state.revision++;
      broadcast();
    },
    setGuestReady(ready) {
      state.seats[1].ready = ready;
      state.revision++;
      broadcast();
    },
    setGuestAsHost() {
      state.hostSeat = 1;
      state.seats.forEach(seat => { seat.isHost = seat.seat === 1; });
    },
    simulateGuestExit() {
      const seat = 1;
      const departedName = state.seats[seat].name;
      const hostChanged = state.hostSeat === seat;
      state.seats[seat] = { seat, gameSeat: state.seats[seat].gameSeat, kind: 'cpu', name: '', connected: false, ready: false, isHost: false };
      if (hostChanged) state.hostSeat = state.seats.find(value => value.kind === 'human').seat;
      state.seats.forEach(value => { value.isHost = value.seat === state.hostSeat; });
      state.seats.filter(value => value.kind === 'cpu').sort((a, b) => a.seat - b.seat)
        .forEach((cpu, index) => { cpu.name = `CPU${index + 1}`; });
      state.revision++;
      gameRevision++;
      broadcast();
      broadcastGame('game-state');
      sockets.filter(socket => socket.seat !== seat && socket.readyState === MockWebSocket.OPEN).forEach(socket => send(socket, {
        type: 'seat-taken-over', seat, departedName, cpuName: 'CPU1', hostChanged,
        hostSeat: state.hostSeat, hostName: state.seats[state.hostSeat].name,
      }));
    },
    setViewerSeat(seat) {
      viewerOverride = seat;
      sockets.filter(socket => socket.readyState === MockWebSocket.OPEN).forEach(socket => {
        socket.seat = seat;
        send(socket, { type: 'game-state', view: makeView(seat) });
      });
    },
    setGameDisplayName(seat, name) {
      gameNameOverrides[seat] = name;
      broadcastGame('game-state');
    },
    showDeclarations(events) {
      for (const item of events) declarations.push({
        id: declarations.length + 1,
        roundNumber,
        dealerId: 0,
        honba: roundResult?.honba ?? 0,
        seat: item.seat,
        kind: item.kind,
        occurredAt: Date.now(),
      });
      gameRevision++;
      broadcastGame('game-state');
    },
    setSeatPresentation(seat, riichi, connected) {
      if (riichi && rivers[seat].length === 0) {
        rivers[seat] = [makeTile(`online-seat-riichi-${seat}-${gameRevision + 1}`, seat)];
      }
      declarationIndexes[seat] = riichi ? 0 : -1;
      state.seats[seat].connected = connected;
      gameRevision++;
      broadcastGame('game-state');
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
    setResultScenario(kind, viewerSeat) {
      if (!gameStarted) return;
      rivers = [[], [], [], []];
      declarationIndexes = [-1, -1, -1, -1];
      if (kind === 'kyuushu') {
        roundNumber = 1;
        gameStatus = 'round-ended';
        phase = 'wall-exhausted';
        decision = null;
        viewerOverride = viewerSeat;
        drawnTiles[2] = makeTile('online-kyuushu-draw', 7);
        roundResult = { reason: 'kyuushu-kyuuhai', abortiveDrawPlayerId: 2, roundNumber, dealerId: 0, honba: 0,
          before: [25000,25000,25000,25000], after: [25000,25000,25000,25000], deltas: [0,0,0,0],
          payments: [], deposits: null, tenpai: null, winners: [], matchEnded: false,
          next: { roundNumber: 1, dealerId: 0, honba: 1 } };
        gameRevision++;
        broadcastGame('game-state');
        return;
      }
      const winnerId = kind === 'opponent-tsumo' ? 3 : 0;
      const method = kind.endsWith('ron') ? 'ron' : 'tsumo';
      const discarderId = method === 'ron' ? (kind === 'self-ron' ? 1 : 2) : undefined;
      const matchEnded = kind === 'match-ended';
      roundNumber = matchEnded ? 4 : 1;
      gameStatus = matchEnded ? 'match-ended' : 'round-ended';
      phase = kind === 'draw' ? 'wall-exhausted' : 'won';
      decision = null;
      viewerOverride = viewerSeat;
      const before = [25000, 25000, 25000, 25000];
      let payments = [];
      let tenpai = null;
      let winners = [];
      if (kind === 'draw') {
        tenpai = [true, false, false, false];
        payments = [1, 2, 3].map(payerId => ({ payerId, recipientId: 0, basePoints: 0, honbaPoints: 0, notenPoints: 1000, points: 1000 }));
      } else {
        const payment = method === 'ron' ? 3900 : 1000;
        const payers = method === 'ron' ? [discarderId] : [0, 1, 2, 3].filter(seat => seat !== winnerId);
        payments = payers.map(payerId => ({ payerId, recipientId: winnerId, basePoints: payment, honbaPoints: method === 'ron' ? 300 : 100, notenPoints: 0, points: payment + (method === 'ron' ? 300 : 100) }));
        const winningTile = makeTile(`online-result-${kind}-${gameRevision + 1}`, 4);
        winners = [{ winnerId, method, ...(discarderId === undefined ? {} : { discarderId }), winningTile,
          totalPoints: payment * payers.length, han: method === 'ron' ? 4 : 4, yakuHan: 1, fu: 30, rawFu: 27, scoreTier: 'normal',
          yakumanCount: 0, yaku: [{ id: 'riichi', han: 1, yakuman: false }],
          dora: { normal: 1, ura: 1, red: 1 }, doraCounts: { normal: 1, ura: 1, red: 1 }, fuEntries: [] }];
        declarationIndexes[winnerId] = 0;
        rivers[winnerId] = [makeTile(`online-result-riichi-${kind}-${gameRevision + 1}`, winnerId)];
      }
      const after = [...before];
      for (const payment of payments) { after[payment.payerId] -= payment.points; after[payment.recipientId] += payment.points; }
      const honba = 1;
      roundResult = { reason: kind === 'draw' ? 'draw' : method, roundWind: matchEnded && state.format === 'tonnan' ? 'south' : 'east', roundNumber, dealerId: 0, honba, before, after,
        deltas: after.map((points, seat) => points - before[seat]), payments, deposits: null, tenpai, winners,
        matchEnded, next: matchEnded ? null : { roundNumber: roundNumber + 1, dealerId: 1, honba: 0 } };
      gameRevision++;
      broadcastGame('game-state');
    },
    endRound() { this.setResultScenario('self-tsumo', 0); },
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
    hiddenNonWinnerTileIds(viewerSeat) {
      const winners = new Set(roundResult?.winners?.map(winner => winner.winnerId) ?? []);
      if (roundResult?.reason === 'kyuushu-kyuuhai') winners.add(roundResult.abortiveDrawPlayerId);
      return hands.flatMap((hand, seat) => seat === viewerSeat || winners.has(seat) ? [] : [
        ...hand.map(tile => tile.id), ...(drawnTiles[seat] ? [drawnTiles[seat].id] : []),
      ]);
    },
    snapshot() {
      return { room: JSON.parse(JSON.stringify(state)), gameStatus, gameRevision, phase, turnPlayerId, roundNumber,
        points: roundResult?.after ?? [25000, 25000, 25000, 25000], roundResult: JSON.parse(JSON.stringify(roundResult)), rivers: JSON.parse(JSON.stringify(rivers)),
        hands: JSON.parse(JSON.stringify(hands)), drawnTiles: JSON.parse(JSON.stringify(drawnTiles)) };
    },
    forceDisconnect() { sockets.filter(socket => socket.readyState === MockWebSocket.OPEN).at(-1)?.forceDisconnect(); },
    dropNextGameResult() { dropNextGameResult = true; },
    get ticketRequests() { return tickets; },
    get gameActions() { return [...gameActions]; },
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
      const request = JSON.parse(init.body);
      state.format = request.rules?.matchFormat ?? request.format ?? 'tonpu';
      state.rules = request.rules ?? {schemaVersion: 1, matchFormat: state.format};
      value = { roomCode: code, participantToken: hostToken, playerSeat: 0, createdAt: state.createdAt, expiresAt: state.expiresAt, format: state.format, rules: state.rules, seats: state.seats };
    } else if (requestUrl.pathname === `/api/rooms/${code}/ticket`) {
      tickets++;
      value = { ticket: 'c'.repeat(64), expiresAt: Date.now() + 60000 };
    } else if (requestUrl.pathname === `/api/rooms/${code}/join`) {
      const displayName = JSON.parse(init.body).displayName;
      state.format = 'tonpu';
      state.rules = {schemaVersion: 1, matchFormat: 'tonpu'};
      state.status = 'waiting';
      state.hostSeat = 0;
      state.revision = 0;
      state.seats.splice(0, 4,
        { seat: 0, gameSeat: null, kind: 'human', name: '既存ホスト', connected: false, ready: false, isHost: true },
        { seat: 1, gameSeat: null, kind: 'human', name: displayName, connected: false, ready: false, isHost: false },
        empty(2), empty(3));
      gameStarted = false;
      gameStatus = 'playing';
      phase = 'awaiting-discard';
      turnPlayerId = 0;
      roundNumber = 1;
      decision = null;
      roundResult = null;
      declarations = [];
      viewerOverride = null;
      declarationIndexes = [-1, -1, -1, -1];
      rivers = [[], [], [], []];
      hands = [0, 1, 2, 3].map(seat => Array.from({ length: 13 }, (_, i) => makeTile(`rejoined-${seat}-${i}`, seat + i)));
      drawnTiles = [makeTile('rejoined-0-draw', 7), null, null, null];
      gameRevision = 0;
      nextSocketSeat = 1;
      value = { roomCode: code, participantToken: guestToken, playerSeat: 1, createdAt: state.createdAt, expiresAt: state.expiresAt, format: state.format, seats: state.seats };
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
  const nativeSetTimeout = window.setTimeout.bind(window);
  window.__shortNextActionTimeout = false;
  window.__shortExitNoticeTimeout = false;
  window.setTimeout = (callback, delay, ...args) => {
    if (window.__shortNextActionTimeout && delay === 15000) { window.__shortNextActionTimeout = false; delay = 20; }
    if (window.__shortExitNoticeTimeout && delay === 8000) { window.__shortExitNoticeTimeout = false; delay = 5000; }
    return nativeSetTimeout(callback, delay, ...args);
  };
})();
"""

with sync_playwright() as p:
    browser_type = getattr(p, ENGINE)
    launch_options = {}
    if ENGINE == 'chromium':
        launch_options = {
            'executable_path': os.environ.get('HEIBON_CHROMIUM') or shutil.which('chromium'),
            'args': ['--no-sandbox'],
        }
    browser = browser_type.launch(**launch_options)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    console_errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.on('dialog', lambda dialog: dialog.accept())
    page.add_init_script("""(() => {
      window.__nextRoundUnhandledErrors = [];
      window.addEventListener('error', event => window.__nextRoundUnhandledErrors.push(String(event.error || event.message)));
      window.addEventListener('unhandledrejection', event => window.__nextRoundUnhandledErrors.push(String(event.reason)));
    })()""")
    page.add_init_script(MOCK)

    def expose_app(route):
        response = route.fetch()
        source = fixed_seat_fixture(
            response.text(),
            '(_ms, signal) => new Promise(resolve => signal.addEventListener("abort", resolve, {once:true}))',
        )
        route.fulfill(response=response, body=source + '\nwindow.onlineUiTest = { controller, onlineGameController, resultDialog };\n')

    page.route('**/src/main.ts', expose_app)
    page.goto(BASE_URL)
    def wait_for(expression, **kwargs):
        try:
            return page.wait_for_function(expression, **kwargs)
        except PlaywrightTimeoutError as error:
            raise AssertionError(f'online browser UI wait timed out: {expression}: {error}') from error

    def capture_river_diagnostics(label, width, height, viewer, count, declaration_index):
      details = page.evaluate('''() => {
        const rect = element => {
          const box = element.getBoundingClientRect();
          return Object.fromEntries(['x','y','left','top','right','bottom','width','height'].map(key => [key, box[key]]));
        };
        const table = document.querySelector('#online-table');
        return {
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          userAgent: navigator.userAgent,
          viewport: {innerWidth, innerHeight, devicePixelRatio, screen: {width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight}, visualViewport: window.visualViewport ? {
            width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale,
            offsetLeft: window.visualViewport.offsetLeft, offsetTop: window.visualViewport.offsetTop,
          } : null},
          table: table ? {rect: rect(table), tileWidth: getComputedStyle(table).getPropertyValue('--table-tile-width').trim(), tileHeight: getComputedStyle(table).getPropertyValue('--table-tile-height').trim()} : null,
          rivers: [...document.querySelectorAll('[data-online-river]')].map(river => ({
            position: river.dataset.onlineRiver,
            rect: rect(river),
            riverTileWidth: getComputedStyle(river).getPropertyValue('--river-tile-width').trim(),
            riverTileHeight: getComputedStyle(river).getPropertyValue('--river-tile-height').trim(),
            riverGap: getComputedStyle(river).getPropertyValue('--river-gap').trim(),
            tiles: [...river.querySelectorAll('.river-tile')].map((item, index) => ({
              index, row: item.dataset.riverRow, column: item.dataset.riverColumn,
              declaration: item.dataset.riichiDeclaration,
              inline: {width: item.style.width, height: item.style.height, left: item.style.left, top: item.style.top},
              box: rect(item), face: rect(item.querySelector('svg')),
              faceStyle: (() => {
                const style = getComputedStyle(item.querySelector('svg'));
                return {position: style.position, left: style.left, top: style.top, width: style.width,
                  height: style.height, transform: style.transform, transformOrigin: style.transformOrigin,
                  transformBox: style.transformBox};
              })(),
              faceWrapper: (() => {
                const wrapper = item.querySelector('.river-tile-face');
                if (!wrapper) return null;
                const style = getComputedStyle(wrapper);
                return {rect: rect(wrapper), position: style.position, left: style.left, top: style.top,
                  width: style.width, height: style.height, transform: style.transform};
              })(),
            })),
          })),
          stability: JSON.parse((table || document.documentElement).dataset.riverStability || 'null'),
        };
      }''')
      screenshot = OUT / f'river-spacing-failure-{ENGINE}-{label}-{width}x{height}-viewer-{viewer}-count-{count}-declaration-{declaration_index}.png'
      try:
        page.screenshot(path=str(screenshot), full_page=True, timeout=5000)
      except Exception as error:
        screenshot_error = str(error)
      else:
        screenshot_error = None
      diagnostics = {
        'browser': ENGINE, 'stage': label, 'expectedViewport': [width, height],
        'viewer': viewer, 'count': count, 'declarationIndex': declaration_index,
        'pageErrors': errors, 'consoleErrors': console_errors,
        'screenshot': str(screenshot), 'screenshotError': screenshot_error,
        'dom': details,
      }
      diagnostics_file = screenshot.with_suffix('.json')
      diagnostics['diagnosticsFile'] = str(diagnostics_file)
      try:
        diagnostics_file.write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
      except OSError as error:
        diagnostics['diagnosticsFileError'] = str(error)
      return diagnostics

    def wait_for_stable_river_layout(label, width, height, viewer=None, count=None, declaration_index=None):
      page.evaluate("document.querySelector('#online-table')?.removeAttribute('data-river-stability')")
      try:
        page.wait_for_function('''expected => {
          const table = document.querySelector('#online-table');
          const stateElement = table || document.documentElement;
          let state;
          try { state = JSON.parse(stateElement.dataset.riverStability || 'null'); } catch { state = null; }
          if (!state) state = {stableFrames: 0, lastSignature: null, samples: []};
          const rivers = [...document.querySelectorAll('[data-online-river]')];
          const counts = rivers.map(river => {
            const items = [...river.querySelectorAll('.river-tile')];
            return {position: river.dataset.onlineRiver, count: items.length,
              declarations: items.filter(item => item.dataset.riichiDeclaration === 'true').length};
          });
          const sample = {time: performance.now(), viewport: [innerWidth, innerHeight], counts};
          const recordBlocked = reason => {
            sample.blocked = reason;
            state.stableFrames = 0;
            state.lastSignature = null;
            state.samples.push(sample);
            if (state.samples.length > 6) state.samples.shift();
            stateElement.dataset.riverStability = JSON.stringify(state);
            return false;
          };
          if (innerWidth !== expected.width || innerHeight !== expected.height) return recordBlocked('viewport');
          if (!table || rivers.length !== 4 || table.getBoundingClientRect().width <= 0) return recordBlocked('table-or-rivers');
          if (expected.count !== null && counts.some(river => river.count !== expected.count ||
              river.declarations !== (expected.declarationIndex >= 0 ? 1 : 0))) return recordBlocked('scenario-counts');
          const tableRect = table.getBoundingClientRect();
          const signature = JSON.stringify([
            [tableRect.width, tableRect.height],
            getComputedStyle(table).getPropertyValue('--table-tile-width'),
            getComputedStyle(table).getPropertyValue('--table-tile-height'),
            ...rivers.map(river => {
              const riverRect = river.getBoundingClientRect();
              return [river.dataset.onlineRiver, [riverRect.width, riverRect.height],
                ...[...river.querySelectorAll('.river-tile svg')].map(tile => {
                  const box = tile.getBoundingClientRect();
                  return [box.left - riverRect.left, box.top - riverRect.top, box.width, box.height];
                })];
            }),
          ]);
          state.stableFrames = signature === state.lastSignature ? state.stableFrames + 1 : 0;
          state.lastSignature = signature;
          sample.stableFrames = state.stableFrames;
          sample.signature = JSON.parse(signature);
          state.samples.push(sample);
          if (state.samples.length > 6) state.samples.shift();
          stateElement.dataset.riverStability = JSON.stringify(state);
          return state.stableFrames >= 2;
        }''', arg={'width': width, 'height': height, 'count': count, 'declarationIndex': declaration_index}, timeout=3000, polling=50)
      except PlaywrightTimeoutError as error:
        diagnostics = capture_river_diagnostics(label + '-layout-timeout', width, height, viewer, count, declaration_index)
        raise AssertionError(f'online river layout did not stabilize within 3000ms: {json.dumps(diagnostics, ensure_ascii=False)}') from error
      page.evaluate("document.querySelector('#online-table')?.removeAttribute('data-river-stability')")

    wait_for('typeof window.onlineUiTest === "object"')
    assert page.locator('#app-idle').is_visible(), 'application did not open in the idle state'
    assert page.locator('body').get_attribute('data-game-mode') == 'none', 'initial app mode was not none'
    page.locator('#main-menu-toggle').click()
    page.locator('#new-game').click()
    page.locator('#confirm-new-game').click()
    wait_for("document.body.dataset.gameMode === 'offline'")
    saved_rules_before_draft = page.evaluate("localStorage.getItem('heibon-mahjong-last-rules')")
    assert json.loads(saved_rules_before_draft)['rules']['matchFormat'] == 'tonpu', 'the initial accepted match did not save its rules'

    def assert_no_private_cpu_tile_ids_in_main(message):
        leaked_ids = page.evaluate('''() => {
          const controller = window.onlineUiTest.controller;
          if (!controller.hasGame) return [];
          const privateIds = controller.game.players.filter(player => player.control === 'cpu').flatMap(player => [
            ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []),
          ]).map(tile => tile.id);
          const html = document.querySelector('main').innerHTML;
          return privateIds.filter(tileId => html.includes(tileId));
        }''')
        assert not leaked_ids, f'{message}: {leaked_ids}'

    def select_menu_item(selector):
        if page.locator('#main-menu-items').is_hidden():
            page.locator('#main-menu-toggle').click()
        page.locator(selector).click()

    def assert_online_dialog_header(dialog_selector, close_selector, width):
        layout = page.evaluate('''({dialogSelector, closeSelector}) => {
          const dialog = document.querySelector(dialogSelector);
          const title = dialog.querySelector('h2').getBoundingClientRect();
          const close = dialog.querySelector(closeSelector);
          const closeBox = close.getBoundingClientRect();
          const dialogBox = dialog.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(close);
          return {
            titleRight: title.right, closeLeft: closeBox.left, closeRight: closeBox.right,
            dialogLeft: dialogBox.left, dialogRight: dialogBox.right,
            closeWidth: closeBox.width, closeHeight: closeBox.height,
            textLines: range.getClientRects().length,
            whiteSpace: getComputedStyle(close).whiteSpace,
            dialogScrollWidth: dialog.scrollWidth, dialogClientWidth: dialog.clientWidth,
            documentScrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
            noHorizontalOverflow: dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth,
          };
        }''', {'dialogSelector': dialog_selector, 'closeSelector': close_selector})
        assert layout['whiteSpace'] == 'nowrap' and layout['textLines'] == 1, f'{close_selector} wraps at {width}px: {layout}'
        assert layout['closeHeight'] >= 44, f'{close_selector} touch target is under 44px at {width}px: {layout}'
        assert layout['closeLeft'] >= layout['dialogLeft'] and layout['closeRight'] <= layout['dialogRight'], f'{close_selector} exceeds its dialog at {width}px: {layout}'
        assert layout['titleRight'] <= layout['closeLeft'], f'{dialog_selector} title overlaps close button at {width}px: {layout}'
        assert layout['noHorizontalOverflow'], f'{dialog_selector} has horizontal overflow at {width}px: {layout}'

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
            const scoreStrip = summary.querySelector('.score-strip');
            const scoreRows = [...scoreStrip.querySelectorAll(':scope > .seat-label')];
            const scoreStripStyle = getComputedStyle(scoreStrip);
            const seatRows = scoreRows.map(row => {
              const name = row.querySelector('.seat-name');
              const details = row.querySelector('.seat-details');
              const wind = details.querySelector('.seat-wind');
              const role = details.querySelector('.seat-role');
              const points = row.querySelector('.seat-points');
              const box = element => element.getBoundingClientRect();
              const rowBox = box(row);
              const nameBox = box(name);
              const detailsBox = box(details);
              const pointsBox = box(points);
              const nameStyle = getComputedStyle(name);
              return {
                position: online ? row.dataset.onlineLabel : row.dataset.seatPosition,
                id: row.id,
                order: Number(row.dataset.displayOrder),
                name: name.textContent,
                nameTitle: name.title,
                nameAriaLabel: name.getAttribute('aria-label'),
                nameOverflow: name.scrollWidth > name.clientWidth,
                nameWhiteSpace: nameStyle.whiteSpace,
                nameTextOverflow: nameStyle.textOverflow,
                nameHeight: nameBox.height,
                rowHeight: rowBox.height,
                details: details.textContent,
                wind: wind.textContent,
                role: role?.textContent ?? '',
                points: points.textContent,
                pointsRight: Number(pointsBox.right.toFixed(2)),
                contentsFit: nameBox.left >= rowBox.left && detailsBox.right <= rowBox.right && pointsBox.right <= rowBox.right,
                partsSequential: nameBox.right <= detailsBox.left && detailsBox.right <= pointsBox.left,
                directParts: row.children.length,
                status: row.querySelector('.seat-status') !== null,
                selfMarker: row.querySelector('.seat-self-marker') !== null,
                declaration: row.querySelector('.seat-declaration') !== null,
                active: row.dataset.active === 'true',
                activeBorder: getComputedStyle(row).borderColor,
              };
            });
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
              seatRows, seatStripColumns: scoreStripStyle.gridTemplateColumns.trim().split(' ').filter(Boolean).length,
              seatRowOrder: scoreRows.map(row => online ? row.dataset.onlineLabel : row.dataset.seatPosition),
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
    assert page.locator('.table').is_visible() and page.locator('#player-hand svg').count() > 0, 'the existing mahjong table did not render'
    assert_no_private_cpu_tile_ids_in_main('CPU private tile IDs leaked before opening the room')

    def assert_riichi_result_fixture():
      fixture = page.evaluate("""() => {
        const view = window.onlineUiTest.onlineGameController.view;
        const seat = view.seats[0];
        return {status: view.status, round: view.round.roundNumber, riichi: seat.riichi,
          reference: seat.riichiDeclarationTileId, river: seat.river.map(tile => tile.id)};
      }""")
      assert fixture['status'] == 'round-ended' and fixture['round'] == 1, fixture
      assert fixture['riichi'] and fixture['reference'] and fixture['reference'] in fixture['river'], fixture
      assert page.locator('[data-online-river] [data-riichi-declaration="true"]').count() == 1, 'riichi declaration tile was not rendered'
      return fixture

    def assert_next_round_transition():
      page.locator('#online-next-round').click()
      # A render exception occurs before the round label is updated. Observe the
      # received state or the exception first so that this failure is reported
      # directly instead of being mistaken for a round-label timeout.
      wait_for("window.onlineUiTest.onlineGameController.view?.round.roundNumber === 2 || window.__nextRoundUnhandledErrors.length > 0")
      unhandled = page.evaluate('window.__nextRoundUnhandledErrors')
      assert not unhandled and not errors, f'{ENGINE} next-round unhandled errors: {unhandled}, page errors: {errors}'
      next_view = page.evaluate("""() => {
        const view = window.onlineUiTest.onlineGameController.view;
        return {status: view.status, round: view.round.roundNumber, phase: view.phase,
          seats: view.seats.map(seat => ({river: seat.river, riichi: seat.riichi,
            reference: seat.riichiDeclarationTileId ?? null}))};
      }""")
      assert next_view['status'] == 'playing' and next_view['round'] == 2 and next_view['phase'] == 'awaiting-discard', next_view
      assert all(not seat['river'] and not seat['riichi'] and seat['reference'] is None for seat in next_view['seats']), next_view
      wait_for("document.querySelector('#online-table-round').innerText.includes('東2局')")
      assert page.locator('[data-online-river] .river-tile').count() == 0, 'old river tiles remained rendered'
      assert page.locator('#online-round-result').is_hidden(), 'the old round result remained after next-round transition'
      unhandled = page.evaluate('window.__nextRoundUnhandledErrors')
      assert not unhandled and not errors, f'{ENGINE} next-round unhandled errors: {unhandled}, page errors: {errors}'

    if NEXT_ROUND_ONLY:
      select_menu_item('#online-create-open')
      page.locator('#online-create-name').fill('テストホスト')
      page.locator('#online-create').click()
      wait_for("document.querySelector('#online-dialog').open && document.querySelector('#online-room-code').textContent === 'ABC234'")
      page.locator('#online-ready').click()
      wait_for('document.querySelector("#online-finalize").disabled === false')
      page.locator('#online-finalize').click()
      wait_for("document.querySelector('#online-finalized-message').hidden === false")
      page.locator('#online-start-game').click()
      wait_for("document.querySelector('#online-match').hidden === false")
      page.evaluate("window.onlineMock.setResultScenario('self-tsumo', 0)")
      wait_for("document.querySelector('#online-show-result').hidden === false")
      assert_riichi_result_fixture()
      page.locator('#online-show-result').click()
      assert page.locator('#result-dialog').evaluate('element => element.open'), 'result dialog did not open'
      assert '立直' in page.locator('#online-result-content').inner_text(), 'riichi result was not displayed'
      page.locator('#view-table').click()
      assert_next_round_transition()
      print(json.dumps({'browser': ENGINE, 'scenario': 'riichi result to next round', 'result': 'pass'}, ensure_ascii=False), flush=True)
      browser.close()
      raise SystemExit(0)

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
    assert all(button['height'] >= 44 and button['width'] >= 44 for button in menu_metrics['buttons']), menu_metrics
    assert [button['background'] for button in menu_metrics['buttons']] == [
      'rgb(248, 220, 145)', 'rgb(248, 247, 242)', 'rgb(248, 247, 242)',
      'rgb(248, 220, 145)', 'rgb(248, 220, 145)', 'rgb(248, 247, 242)',
    ], menu_metrics
    assert [item.inner_text() for item in page.locator('#main-menu-items button:not([hidden])').all()] == [
      'オフラインで新規対局', 'ルール確認', '河テスト', '新しくルームを作る', 'ルームに参加する', '診断ログ',
    ], 'the shared menu actions were not available in order'
    assert page.locator('#menu-room').is_hidden(), 'room operations were shown before joining a room'
    assert page.locator('#main-menu-toggle').get_attribute('aria-expanded') == 'true', 'menu expanded state was not announced'
    page.locator('#main-menu-toggle').click()
    assert page.locator('#main-menu-items').is_hidden(), 'the hamburger menu did not close on a second press'
    page.locator('#main-menu-toggle').press('Enter')
    assert page.locator('#new-game').evaluate('element => document.activeElement === element'), 'keyboard open did not focus the first menu item'
    page.keyboard.press('ArrowDown')
    assert page.locator('#menu-offline-rules').evaluate('element => document.activeElement === element'), 'arrow navigation did not reach active offline rules'
    page.keyboard.press('ArrowDown')
    assert page.locator('#river-test-open').evaluate('element => document.activeElement === element'), 'arrow navigation did not move through menu items'
    page.keyboard.press('Escape')
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'Escape did not return focus to the menu button'
    page.locator('#main-menu-toggle').click()
    page.locator('h1').click()
    assert page.locator('#main-menu-items').is_hidden(), 'clicking outside did not close the menu'
    select_menu_item('#new-game')
    assert page.locator('#new-game-dialog').evaluate('element => element.open'), 'new-game menu item did not open the existing confirmation'
    assert page.locator('#new-game-rules-summary').inner_text() == '現在：東風戦', 'offline rules did not default to East-only'
    page.locator('#new-game-rules').click()
    assert page.locator('#rule-settings-dialog').evaluate('element => element.open'), 'offline rule settings did not open'
    assert page.locator('input[name="rules-match-format"][value="tonpu"]').is_checked(), 'offline match format did not default to tonpu'
    format_layouts = []
    for width in [320, 375, 390, 414]:
      page.set_viewport_size({'width': width, 'height': 812})
      layout = page.evaluate('''() => {
        const dialog = document.querySelector('#rule-settings-dialog');
        const options = dialog.querySelector('.match-format-options').getBoundingClientRect();
        const labels = [...dialog.querySelectorAll('.match-format-options label')].map(label => {
          const box = label.getBoundingClientRect();
          return {height: box.height, fits: box.left >= 0 && box.right <= innerWidth};
        });
        return {noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth,
          optionsVisible: options.width > 0 && options.bottom <= innerHeight, labels};
      }''')
      assert layout['noHorizontalScroll'] and layout['optionsVisible'] and all(label['fits'] and label['height'] >= 44 for label in layout['labels']), f'rule settings layout failed at {width}px: {layout}'
      format_layouts.append({'width': width, **layout})
    page.locator('input[name="rules-match-format"][value="tonnan"]').check()
    page.set_viewport_size({'width': 320, 'height': 600})
    settings_layout = page.locator('#rule-settings-dialog').evaluate('''dialog => {
      const box = dialog.getBoundingClientRect();
      return {top: box.top, bottom: box.bottom, width: box.width, clientWidth: dialog.clientWidth,
        scrollWidth: dialog.scrollWidth, clientHeight: dialog.clientHeight, scrollHeight: dialog.scrollHeight,
        noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth};
    }''')
    assert settings_layout['top'] >= 0 and settings_layout['bottom'] <= 600 and settings_layout['scrollWidth'] <= settings_layout['clientWidth'] and settings_layout['noPageHorizontalOverflow'], f'rule settings dialog did not fit or scroll at 320x600: {settings_layout}'
    page.locator('#cancel-rule-settings').scroll_into_view_if_needed()
    assert page.locator('#cancel-rule-settings').is_visible(), 'rule settings cancel action was unreachable on a short screen'
    page.set_viewport_size({'width': 390, 'height': 812})
    page.locator('#cancel-rule-settings').click()
    assert page.locator('#new-game-rules-summary').inner_text() == '現在：東風戦', 'canceling rule settings changed the draft match format'
    page.locator('#new-game-rules').click()
    page.locator('input[name="rules-match-format"][value="tonnan"]').check()
    page.locator('#confirm-rule-settings').click()
    assert page.locator('#new-game-rules-summary').inner_text() == '現在：半荘戦', 'confirmed rules were not applied to the pending match'
    page.locator('#cancel-new-game').click()
    assert page.evaluate("localStorage.getItem('heibon-mahjong-last-rules')") == saved_rules_before_draft, 'canceling a new match overwrote the last-started rules'
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'dismissing the new-game dialog did not restore focus to the visible menu button'
    select_menu_item('#new-game')
    assert page.locator('#new-game-rules-summary').inner_text() == '現在：東風戦', 'unstarted rules replaced the last-started default'
    page.locator('#new-game-rules').click()
    page.locator('input[name="rules-match-format"][value="tonnan"]').check()
    page.locator('#confirm-rule-settings').click()
    page.locator('#confirm-new-game').click()
    assert page.evaluate('window.onlineUiTest.controller.match.format') == 'tonnan', 'offline selection was not stored in match state'
    assert page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-last-rules')).rules.matchFormat === 'tonnan'"), 'accepted offline start did not save the last rules'
    select_menu_item('#menu-offline-rules')
    assert '現在の対局開始時に確定' in page.locator('#online-rules-readonly-label').inner_text()
    assert page.locator('#online-rules-list dd').first.inner_text() == '半荘戦（東南戦）'
    page.locator('#online-rules-close').click()

    assert page.locator('#online-create-name').count() == 1 and page.locator('#online-join-name').count() == 1, 'create and join must have separate display-name fields'
    assert page.evaluate('''() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return new Set(ids).size === ids.length; }'''), 'the UI contains duplicate DOM IDs'
    assert page.locator('#online-create-name').get_attribute('maxlength') == '24' and page.locator('#online-join-name').get_attribute('maxlength') == '24', 'display-name length limit changed'
    select_menu_item('#online-create-open')
    assert page.locator('#main-menu-items').is_hidden(), 'selecting a menu item did not close the menu'
    assert page.locator('#online-create-dialog').evaluate('element => element.open'), 'room creation did not open its dedicated dialog'
    assert page.locator('#online-join-dialog').evaluate('element => !element.open'), 'room creation also opened the join dialog'
    assert page.locator('#online-create-dialog h2').inner_text() == '新しくルームを作る', 'room creation dialog title was not shown'
    assert page.locator('#online-create-dialog label[for="online-create-name"]').all_inner_texts() == ['表示名'], 'room creation dialog display-name label changed'
    assert page.locator('#online-create-rules').inner_text() == 'ルール設定', 'room creation dialog omitted rule settings'
    assert page.locator('#online-create-dialog #online-join').count() == 0, 'room creation dialog contains a join button'
    assert page.locator('#online-create-close').evaluate('element => document.activeElement === element'), 'opening the create dialog did not focus its close button'
    assert page.locator('#online-create-name').evaluate('element => document.activeElement !== element'), 'opening the create dialog focused its display-name input'
    page.keyboard.press('Tab')
    assert page.locator('#online-create-rules').evaluate('element => document.activeElement === element'), 'Tab did not move from the create close button to rule settings'
    page.keyboard.press('Tab')
    assert page.locator('#online-create-name').evaluate('element => document.activeElement === element'), 'Tab did not move from rule settings to the create display-name input'
    page.keyboard.press('Shift+Tab')
    assert page.locator('#online-create-rules').evaluate('element => document.activeElement === element'), 'Shift+Tab did not return to rule settings'
    page.keyboard.press('Shift+Tab')
    assert page.locator('#online-create-close').evaluate('element => document.activeElement === element'), 'Shift+Tab did not return to the create close button'
    assert page.locator('#online-create').is_disabled(), 'room creation was enabled without a display name'
    page.locator('#online-create-name').click()
    assert page.locator('#online-create-name').evaluate('element => document.activeElement === element'), 'manually selecting the create name input did not focus it'
    page.keyboard.type('   ')
    assert page.locator('#online-create-name').input_value() == '   ', 'typing after selecting the create name input did not work'
    assert page.locator('#online-create').is_disabled(), 'room creation was enabled for a whitespace-only display name'
    page.keyboard.press('Control+A')
    page.keyboard.type('テストホスト')
    assert page.locator('#online-create').is_enabled(), 'room creation remained disabled after entering a valid display name'
    assert page.locator('#online-create-name').input_value() == 'テストホスト', 'typing a valid create name did not update the input'
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the display name was not shared with the join form'
    create_form_layouts = []
    for width, height in [[320,700],[375,812],[390,844],[414,896]]:
      page.set_viewport_size({'width': width, 'height': height})
      assert_online_dialog_header('#online-create-dialog', '#online-create-close', width)
      layout = page.locator('#online-create-dialog').evaluate('''dialog => {
        const rect = dialog.getBoundingClientRect();
        const form = dialog.querySelector('#online-create-form');
        return {
          left: rect.left, right: rect.right, width: rect.width,
          dialogClientWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth,
          formClientWidth: form.clientWidth, formWidth: form.getBoundingClientRect().width, formScrollWidth: form.scrollWidth,
          controls: [...form.querySelectorAll('.match-format-options label, #online-create-name, button')].map(control => {
            const box = control.getBoundingClientRect(); return {width: box.width, height: box.height};
          }),
        };
      }''')
      assert layout['left'] >= 0 and layout['right'] <= width, (width, layout)
      assert layout['dialogScrollWidth'] <= layout['dialogClientWidth'], (width, layout)
      assert layout['formScrollWidth'] <= layout['formClientWidth'], (width, layout)
      assert all(control['width'] <= layout['formWidth'] and control['height'] >= 44 for control in layout['controls']), (width, layout)
      assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'create dialog caused horizontal overflow')
      create_form_layouts.append([width, round(layout['width'], 2)])
    page.set_viewport_size({'width': 390, 'height': 320})
    page.locator('#online-create-name').scroll_into_view_if_needed()
    assert page.locator('#online-create-name').evaluate('element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }'), 'the create name input could not be reached after manual selection and scrolling in a short viewport'
    page.locator('#online-create').scroll_into_view_if_needed()
    assert page.locator('#online-create').evaluate('element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }'), 'the create action could not be reached after manual selection and scrolling in a short viewport'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#online-create-close').click()
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'closing the create form did not restore menu focus'
    select_menu_item('#online-join-open')
    assert page.locator('#online-join-dialog').evaluate('element => element.open'), 'room joining did not open its dedicated dialog'
    assert page.locator('#online-create-dialog').evaluate('element => !element.open'), 'room joining also opened the create dialog'
    assert page.locator('#online-join-dialog h2').inner_text() == 'ルームに参加する', 'room join dialog title was not shown'
    assert page.locator('#online-join-dialog label').all_inner_texts() == ['表示名', 'ルームコード'], 'room join dialog did not show only its required fields'
    assert page.locator('#online-join-dialog #online-create').count() == 0, 'room join dialog contains a create button'
    assert page.locator('#online-join-close').evaluate('element => document.activeElement === element'), 'opening the join dialog did not focus its close button'
    assert page.locator('#online-join-name').evaluate('element => document.activeElement !== element'), 'opening the join dialog focused its display-name input'
    assert page.locator('#online-join-code').evaluate('element => document.activeElement !== element'), 'opening the join dialog focused its room-code input'
    page.keyboard.press('Tab')
    assert page.locator('#online-join-name').evaluate('element => document.activeElement === element'), 'Tab did not move from the join close button to its display-name input'
    page.keyboard.press('Tab')
    assert page.locator('#online-join-code').evaluate('element => document.activeElement === element'), 'Tab did not move from the join name to the room-code input'
    page.keyboard.press('Shift+Tab')
    assert page.locator('#online-join-name').evaluate('element => document.activeElement === element'), 'Shift+Tab did not return to the join display-name input'
    page.keyboard.press('Shift+Tab')
    assert page.locator('#online-join-close').evaluate('element => document.activeElement === element'), 'Shift+Tab did not return to the join close button'
    assert page.locator('#online-join-code').get_attribute('maxlength') == '6', 'room code length limit changed'
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the previous display name was not initially shown in the join dialog'
    page.locator('#online-join-name').click()
    assert page.locator('#online-join-name').evaluate('element => document.activeElement === element'), 'manually selecting the join name input did not focus it'
    page.keyboard.press('End')
    page.keyboard.type('X')
    assert page.locator('#online-join-name').input_value() == 'テストホストX', 'typing after selecting the join name input did not work'
    page.keyboard.press('Backspace')
    assert page.locator('#online-join-name').input_value() == 'テストホスト', 'the join name could not be corrected after typing'
    page.locator('#online-join-code').click()
    assert page.locator('#online-join-code').evaluate('element => document.activeElement === element'), 'manually selecting the room-code input did not focus it'
    page.keyboard.type('ABC234')
    assert page.locator('#online-join-code').input_value() == 'ABC234', 'typing after selecting the room-code input did not work'
    page.keyboard.press('Control+A')
    page.keyboard.press('Backspace')
    assert page.locator('#online-join').is_disabled(), 'room joining was enabled without a room code'
    join_form_layouts = []
    for width, height in [[320,700],[375,812],[390,844],[414,896]]:
      page.set_viewport_size({'width': width, 'height': height})
      assert_online_dialog_header('#online-join-dialog', '#online-join-close', width)
      layout = page.locator('#online-join-dialog').evaluate('''dialog => {
        const rect = dialog.getBoundingClientRect();
        const form = dialog.querySelector('#online-join-form');
        return {left: rect.left, right: rect.right, width: rect.width,
          dialogClientWidth: dialog.clientWidth, dialogScrollWidth: dialog.scrollWidth,
          formClientWidth: form.clientWidth, formWidth: form.getBoundingClientRect().width, formScrollWidth: form.scrollWidth,
          controls: [...form.querySelectorAll('input,button')].map(control => {
            const box = control.getBoundingClientRect(); return {width: box.width, height: box.height};
          })};
      }''')
      assert layout['left'] >= 0 and layout['right'] <= width, (width, layout)
      assert layout['dialogScrollWidth'] <= layout['dialogClientWidth'], (width, layout)
      assert layout['formScrollWidth'] <= layout['formClientWidth'], (width, layout)
      assert all(control['width'] <= layout['formWidth'] and control['height'] >= 44 for control in layout['controls']), (width, layout)
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
    page.locator('#online-join-name').scroll_into_view_if_needed()
    assert page.locator('#online-join-name').evaluate('element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }'), 'the join name input could not be reached after manual selection and scrolling in a short viewport'
    page.locator('#online-join-code').scroll_into_view_if_needed()
    assert page.locator('#online-join-code').evaluate('element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }'), 'the room-code input could not be reached after manual selection and scrolling in a short viewport'
    page.locator('#online-join').scroll_into_view_if_needed()
    assert page.locator('#online-join').evaluate('element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }'), 'the join action could not be reached after manual selection and scrolling in a short viewport'
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
    assert page.locator('#online-create-rules-summary').inner_text() == '設定：半荘戦', 'online creation did not restore the last started format'
    page.locator('#online-create-rules').click()
    assert page.locator('input[name="rules-match-format"][value="tonnan"]').is_checked(), 'online rules did not use the shared last-started setting'
    page.locator('#confirm-rule-settings').click()
    page.locator('#online-create').click()
    wait_for("document.querySelector('#online-dialog').open && document.querySelector('#online-room-code').textContent === 'ABC234'")
    assert not page.locator('#online-create-dialog').evaluate('element => element.open'), 'room creation form remained open after success'
    assert not page.locator('#online-join-dialog').evaluate('element => element.open'), 'join form opened after room creation'
    assert page.locator('#online-dialog #online-create-form, #online-dialog #online-join-form').count() == 0, 'input forms were mixed into the room management screen'
    assert page.evaluate("window.onlineMock.requests[0].body.rules.matchFormat === 'tonnan' && window.onlineMock.requests[0].body.rules.schemaVersion === 1"), 'host rules were not sent to the server'
    assert page.locator('#online-room-format').inner_text() == '対局形式：半荘戦', 'selected format was not shown in the waiting room'
    page.locator('#online-confirm-rules').click()
    assert page.locator('#online-rules-dialog').evaluate('element => element.open'), 'waiting-room rule confirmation did not open'
    assert '読み取り専用' in page.locator('#online-rules-readonly-label').inner_text(), 'rule confirmation was not marked read-only'
    assert 'ホストがルーム作成時に確定' in page.locator('#online-rules-readonly-label').inner_text(), 'offline viewer context leaked into the waiting room'
    assert page.locator('#online-rules-list').get_attribute('aria-label') == 'サーバーで確定したルール'
    assert '半荘戦' in page.locator('#online-rules-list').inner_text(), 'confirmed room rules did not show the host format'
    assert page.locator('#online-rules-dialog input, #online-rules-dialog select, #online-rules-dialog button:not(#online-rules-close)').count() == 0, 'read-only rule confirmation exposed editing controls'
    page.set_viewport_size({'width': 320, 'height': 600})
    readonly_layout = page.locator('#online-rules-dialog').evaluate('''dialog => {
      const box = dialog.getBoundingClientRect();
      return {top: box.top, bottom: box.bottom, clientWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth,
        noPageHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth};
    }''')
    assert readonly_layout['top'] >= 0 and readonly_layout['bottom'] <= 600 and readonly_layout['scrollWidth'] <= readonly_layout['clientWidth'] and readonly_layout['noPageHorizontalOverflow'], f'confirmed rules overflowed at 320x600: {readonly_layout}'
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#online-rules-close').click()
    if RULES_ONLY:
      print(json.dumps({'browser': ENGINE, 'scenario': 'online waiting-room read-only confirmed rules', 'result': 'pass'}, ensure_ascii=False))
      browser.close()
      raise SystemExit(0)
    assert page.locator('#online-status').is_hidden(), 'room creation still displays a redundant permanent success message'
    assert page.evaluate("window.onlineMock.requests[0].body.displayName === 'テストホスト'"), 'room creation did not send the common display name'
    assert page.locator('#menu-room').evaluate('element => !element.hidden'), 'room operations were not added to the menu for an online participant'
    wait_for("document.querySelector('#online-seats').children.length === 4 && document.querySelector('#online-seats').innerText.includes('テストホスト')")
    if EXIT_NOTICE_ONLY:
      wait_for("document.querySelector('#online-leave').hidden === false")
      page.evaluate('window.__shortExitNoticeTimeout = true')
      page.locator('#online-leave').click()
      wait_for("!document.querySelector('#online-dialog').open && sessionStorage.getItem('heibon-mahjong-online-session') === null && !document.querySelector('#online-exit-notice').hidden")
      wait_for("document.body.dataset.gameMode === 'none' && document.querySelector('#app-idle').hidden === false")
      assert page.locator('#online-exit-notice').inner_text() == 'ルームを退出しました。'
      assert page.locator('#app-idle').is_visible(), 'leaving the online room did not restore the idle state'
      notice_viewports = []
      for width, height in [(320,700),(375,812),(390,844),(414,896)]:
        page.set_viewport_size({'width': width, 'height': height})
        notice_layout = page.evaluate('''() => {
          const header = document.querySelector('.app-header').getBoundingClientRect();
          const notice = document.querySelector('#online-exit-notice');
          const box = notice.getBoundingClientRect();
          return {headerBottom: header.bottom, top: box.top, left: box.left, right: box.right,
            pointerEvents: getComputedStyle(notice).pointerEvents,
            scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth};
        }''')
        assert notice_layout['top'] >= notice_layout['headerBottom'] + 7, (ENGINE, width, notice_layout)
        assert notice_layout['left'] >= 0 and notice_layout['right'] <= width, (ENGINE, width, notice_layout)
        assert notice_layout['scrollWidth'] <= notice_layout['viewportWidth'], (ENGINE, width, notice_layout)
        assert notice_layout['pointerEvents'] == 'none', (ENGINE, width, notice_layout)
        notice_viewports.append({'width': width, **notice_layout})
      page.set_viewport_size({'width': 390, 'height': 844})
      page.locator('#main-menu-toggle').click()
      assert page.locator('#main-menu-toggle').get_attribute('aria-expanded') == 'true', (ENGINE, 'menu button was blocked by exit notice')
      page.locator('#main-menu-toggle').click()
      wait_for("document.querySelector('#online-exit-notice').hidden && document.querySelector('#online-exit-notice').textContent === ''", timeout=8000)
      assert not errors, f'{ENGINE} online exit notice browser errors: {errors}'
      print(json.dumps({'browser': ENGINE, 'onlineExitNoticeViewports': notice_viewports,
        'menuOperable': True, 'autoDismiss': True, 'returnsToIdle': True, 'result': 'pass'}), flush=True)
      browser.close()
      raise SystemExit(0)
    layout_results = []
    for width, height in [(320, 700), (375, 667), (375, 812), (390, 844), (414, 896), (1280, 900)]:
      page.set_viewport_size({'width': width, 'height': height})
      assert_online_dialog_header('#online-dialog', '#online-close', width)
      layout = page.evaluate('''() => {
        const dialog = document.querySelector('#online-dialog');
        const close = document.querySelector('#online-close').getBoundingClientRect();
        const actions = document.querySelector('#online-actions').getBoundingClientRect();
        const dialogBox = dialog.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('#online-actions button:not([hidden])')].map(button => button.getBoundingClientRect());
        return {
          dialogFits: dialogBox.top >= 0 && dialogBox.bottom <= innerHeight,
          noDialogScroll: dialog.scrollHeight <= dialog.clientHeight,
          actionsVisible: actions.top >= 0 && actions.bottom <= innerHeight && buttons.every(box => box.top >= 0 && box.bottom <= innerHeight),
          closeTarget: close.width >= 44 && close.height >= 44,
          noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth,
        };
      }''')
      assert layout['dialogFits'], f'online waiting dialog exceeds {width}x{height}: {layout}'
      assert layout['actionsVisible'], f'online waiting actions are not visible at {width}x{height}: {layout}'
      assert layout['closeTarget'], f'online waiting close target is under 44px at {width}x{height}: {layout}'
      assert layout['noHorizontalScroll'], f'online waiting dialog overflows horizontally at {width}x{height}: {layout}'
      if (width, height) != (375, 667):
        assert layout['noDialogScroll'], f'newly created room requires dialog scrolling at {width}x{height}: {layout}'
      layout_results.append({'viewport': f'{width}x{height}', **layout})
      if (width, height) == (375, 812):
        page.screenshot(path=str(OUT / 'online-waiting-375x812-created.png'))
    print(json.dumps({'onlineWaitingRoomLayouts': layout_results}, ensure_ascii=False))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('window.onlineMock.addGuest()')
    wait_for("document.querySelector('#online-seats').innerText.includes('テスト参加者')")
    seat_text = page.locator('#online-seats').inner_text()
    host_row = page.locator('#online-seats li').nth(0)
    assert host_row.locator('.online-seat-wind').is_hidden(), 'a seat wind was shown before seat finalization'
    assert host_row.locator('.online-seat-name').inner_text() == 'テストホスト', 'the current player name was not shown in the seat list'
    assert host_row.locator('.online-seat-role').inner_text() == '（自分・ホスト）', 'the current player and host roles were not identified in the seat list'
    assert host_row.locator('.online-seat-status').inner_text() == '接続中・未準備', 'the connection and ready state were not displayed in the seat list'
    assert 'テスト参加者' in seat_text and all(wind not in seat_text for wind in ('東', '南', '西', '北')), 'waiting list exposed a seat wind before finalization'
    assert page.locator('#online-my-seat, #online-host').count() == 0, 'self and host are still shown in separate fields'
    assert page.locator('#online-finalize').is_visible() and not page.locator('#online-finalize').is_enabled(), 'host finalize was enabled before both players were ready'
    assert '人間' not in seat_text and '空席' in seat_text, 'seat rows still contain redundant participant types or omit empty seats'
    page.evaluate('window.onlineMock.setAdditionalGuests()')
    wait_for("document.querySelector('#online-seats').innerText.includes('もう一人の長い参加者表示名テスト')")
    page.set_viewport_size({'width': 375, 'height': 812})
    full_seat_layout = page.evaluate('''() => {
      const dialog = document.querySelector('#online-dialog');
      const actions = document.querySelector('#online-actions').getBoundingClientRect();
      const seats = document.querySelector('#online-seats');
      const longNames = [...seats.querySelectorAll('.online-seat-name')];
      return {
        noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth && seats.scrollWidth <= seats.clientWidth,
        actionsVisible: actions.bottom <= innerHeight && [...document.querySelectorAll('#online-actions button:not([hidden])')].every(button => button.getBoundingClientRect().bottom <= innerHeight),
        longNamesEllipsized: longNames.filter(name => name.scrollWidth > name.clientWidth && getComputedStyle(name).textOverflow === 'ellipsis').length >= 2,
        windsHidden: [...seats.children].every(item => item.querySelector('.online-seat-wind').hidden),
      };
    }''')
    assert full_seat_layout['noHorizontalScroll'], f'long names caused horizontal scrolling: {full_seat_layout}'
    assert full_seat_layout['actionsVisible'], f'actions are hidden with four occupied seats: {full_seat_layout}'
    assert full_seat_layout['longNamesEllipsized'], f'long seat names were not ellipsized: {full_seat_layout}'
    assert full_seat_layout['windsHidden'], f'a seat wind was shown before finalization: {full_seat_layout}'
    page.screenshot(path=str(OUT / 'online-waiting-375x812-four-players.png'))
    page.evaluate('window.onlineMock.clearAdditionalGuests()')
    wait_for("document.querySelector('#online-seats').innerText.includes('空席')")
    page.set_viewport_size({'width': 390, 'height': 844})

    page.locator('#online-close').click()
    assert page.locator('#main-menu-toggle').evaluate('element => document.activeElement === element'), 'closing the room dialog did not restore focus to the visible menu button'
    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') !== null"), 'closing the dialog discarded the session token'
    assert [item.inner_text() for item in page.locator('#main-menu-items button:not([hidden])').all()] == [
      'オフラインで新規対局', 'ルール確認', '河テスト', '新しくルームを作る', 'ルームに参加する', 'ルーム操作', '診断ログ',
    ], 'the shared menu actions and room operation were not available during a room session'
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
    assert 'CPU1' in seat_text and 'CPU2' in seat_text, seat_text
    assert [wind.inner_text() for wind in page.locator('#online-seats .online-seat-wind').all()] == ['東', '南', '西', '北'], 'the finalized list did not show all actual game seats in order'
    assert [name.inner_text() for name in page.locator('#online-seats .online-seat-name').all()] == [
      'テスト参加者', 'CPU2', 'テストホスト', 'CPU1',
    ], 'the finalized winds did not match the saved participant-to-seat assignment'
    assert 'ホスト' in seat_text and '自分' in seat_text, seat_text
    assert page.locator('#online-dialog').evaluate('element => element.scrollWidth <= element.clientWidth'), 'online dialog content overflows horizontally'
    page.locator('#online-copy-code').click()
    wait_for("window.onlineMock.copied === 'ABC234'")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online dialog causes horizontal overflow at 390px'
    assert_no_private_cpu_tile_ids_in_main('CPU private tile IDs leaked while the waiting room was open')

    page.locator('#online-start-game').click()
    wait_for("document.querySelector('#online-dialog').open === false && document.querySelector('#online-match').hidden === false")
    wait_for("document.querySelectorAll('#online-player-hand button[data-tile-id]').length === 14")
    assert page.locator('#online-table').is_visible(), 'the online board was not displayed after host start'
    assert page.locator('#menu-offline-rules').is_hidden(), 'offline rules were offered during online play'
    assert page.locator('#online-score-strip').inner_text().count('CPU') == 2, 'the two CPU seats were not shown at the table'
    assert page.locator('[data-online-hand="right"] .tile-back').count() == 13, 'the other human hand was not shown as backs'
    assert page.locator('[data-online-hand="top"] .tile-back').count() == 13, 'the CPU hand was not shown as backs'
    if PUBLIC_HAND_ONLY:
        for scenario, viewer in [('kyuushu', 0), ('opponent-tsumo', 1), ('opponent-ron', 1), ('self-tsumo', 0)]:
            page.evaluate('args => window.onlineMock.setResultScenario(args.scenario, args.viewer)',
                          {'scenario': scenario, 'viewer': viewer})
            wait_for(f"""(() => {{
              const view=window.onlineUiTest.onlineGameController.view;
              return view?.status==='round-ended' && view.result?.reason &&
                document.querySelector('#online-show-result')?.hidden===false;
            }})()""")
            orientation = page.evaluate('''() => {
              const faces=[...document.querySelectorAll('#online-table .public-hand-tile')];
              const backs=[...document.querySelectorAll('#online-table .tile-back')];
              const ownTiles=[...document.querySelectorAll('#online-match .seat-bottom #online-player-hand .tile-choice')];
              const badFaces=faces.filter(tile=>getComputedStyle(tile).rotate!==
                (tile.closest('.seat-top')?'180deg':'none'));
              const badBacks=backs.filter(tile=>getComputedStyle(tile).rotate!=='none');
              const badOwnTiles=ownTiles.filter(tile=>getComputedStyle(tile).rotate!=='none');
              const hands=[...document.querySelectorAll('#online-table .seat-top .concealed-hand')]
                .filter(hand=>hand.querySelector('.public-hand-tile'));
              const reference=document.querySelector('#online-table .tile-back');
              const dimensions=e=>{const s=getComputedStyle(e);return [parseFloat(s.width),parseFloat(s.height)];};
              const referenceSize=reference?dimensions(reference):null;
              const topMetrics=hands.map(hand=>{
                const tiles=[...hand.querySelectorAll(':scope > .public-hand-tile')];
                const sizeDeltas=tiles.map(tile=>referenceSize
                  ?Math.max(...dimensions(tile).map((value,index)=>Math.abs(value-referenceSize[index]))):Infinity);
                const rects=tiles.map(tile=>tile.getBoundingClientRect());
                const gaps=rects.slice(1).map((rect,index)=>rect.left-rects[index].right);
                return {seat:hand.dataset.playerId,count:tiles.length,sizeDeltas,gaps,
                  order:tiles.map(tile=>tile.querySelector('svg')?.getAttribute('aria-label'))};
              });
              const unrotatedMelds=[...document.querySelectorAll('#online-table .open-meld,#online-table .open-meld .tile-svg')]
                .every(node=>getComputedStyle(node).rotate==='none');
              const unrotatedRivers=[...document.querySelectorAll('#online-table .river .river-tile .tile-svg')]
                .every(node=>getComputedStyle(node).rotate==='none');
              return {badFaces:badFaces.length,badBacks:badBacks.length,badOwnTiles:badOwnTiles.length,
                topMetrics,unrotatedMelds,unrotatedRivers};
            }''')
            assert orientation['badFaces'] == orientation['badBacks'] == orientation['badOwnTiles'] == 0, (ENGINE, scenario, orientation)
            assert orientation['unrotatedMelds'] and orientation['unrotatedRivers'], (ENGINE, scenario, orientation)
            for hand in orientation['topMetrics']:
                assert hand['count'] == 14 if scenario == 'kyuushu' else hand['count'] > 0, (ENGINE, scenario, hand)
                assert max(hand['sizeDeltas'], default=0) < .2, (ENGINE, scenario, hand)
                assert all(abs(gap-1) < .2 for gap in hand['gaps']), (ENGINE, scenario, hand)
                if scenario == 'kyuushu':
                    expected_labels = page.evaluate('''() => {
                      const tileLabel=tile=>tile.category==='honor'
                        ?({east:'東',south:'南',west:'西',north:'北',white:'白',green:'發',red:'中'}[tile.honor])
                        :`${tile.isRed?'赤':''}${tile.rank}${{man:'萬',pin:'筒',sou:'索'}[tile.suit]}`;
                      return window.onlineUiTest.onlineGameController.view.seats.find(seat=>seat.seat===2)
                        .revealedHand.map(publicTile=>tileLabel(publicTile.tile));
                    }''')
                    assert hand['order'] == expected_labels, (ENGINE, scenario, hand, expected_labels)
        assert not errors, f'{ENGINE} online public-hand browser errors: {errors}'
        print(json.dumps({'browser': ENGINE, 'onlinePublicHandScenarios': ['kyuushu','opponent-tsumo','opponent-ron','self-tsumo'], 'result': 'pass'}), flush=True)
        browser.close()
        raise SystemExit(0)
    page.evaluate("window.onlineMock.showDeclarations([{seat: 0, kind: 'riichi'}, {seat: 2, kind: 'ron'}])")
    wait_for("document.querySelectorAll('#online-table .declaration-bubble').length === 2")
    online_bubbles = page.locator('#online-table .declaration-bubble').evaluate_all('''nodes => Object.fromEntries(nodes.map(node => [node.dataset.seat, {
      label: node.textContent, classes: [...node.classList], pointerEvents: getComputedStyle(node).pointerEvents,
    }]))''')
    assert online_bubbles['0']['label'] == 'リーチ' and 'declaration-bubble-bottom' in online_bubbles['0']['classes'], online_bubbles
    assert online_bubbles['2']['label'] == 'ロン' and 'declaration-bubble-top' in online_bubbles['2']['classes'], online_bubbles
    assert all(bubble['pointerEvents'] == 'none' for bubble in online_bubbles.values()), online_bubbles
    hidden_online_ids = page.evaluate('window.onlineMock.privateTileIds(0)')
    assert all(tile_id not in page.locator('#online-match').inner_html() for tile_id in hidden_online_ids), 'an opponent tile ID reached the online DOM'
    assert page.locator('#online-score-strip [data-online-label="bottom"]').inner_text().startswith('テストホスト'), 'the viewer seat was not placed at the bottom'
    assert page.locator('#online-score-strip [data-online-label="right"]').inner_text().startswith('テスト参加者'), 'the adjacent seat was not placed on the right'
    cpu_one = page.locator('#online-score-strip [data-online-label="top"]').inner_text()
    cpu_two = page.locator('#online-score-strip [data-online-label="left"]').inner_text()
    assert cpu_one.startswith('CPU1') and '西' in cpu_one, f'CPU1 and its west wind were not shown separately: {cpu_one}'
    assert cpu_two.startswith('CPU2') and '北' in cpu_two, f'CPU2 and its north wind were not shown separately: {cpu_two}'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'online table causes horizontal overflow at 390px'

    online_long_name = 'あいうえおかきくけこさしすせそたちつてとなにぬね'
    assert len(online_long_name) == 24, 'the long-name browser fixture must stay within the existing limit'
    page.evaluate('(name) => window.onlineMock.setGameDisplayName(0, name)', online_long_name)
    wait_for(f"document.querySelector('#online-score-strip [data-online-label=bottom] .seat-name')?.title === '{online_long_name}'")
    assert page.locator('#online-score-strip .seat-label').count() == 4, 'online player information did not contain four rows'
    assert page.locator('#local-score-strip .seat-label').count() == 4, 'offline player information did not contain four rows'
    assert page.locator('#online-score-strip .seat-label').evaluate_all("rows => rows.map(row => row.dataset.onlineLabel)") == ['bottom','right','top','left'], 'online seats were not ordered from the viewer through relative seats'
    assert page.locator('#local-score-strip .seat-label').evaluate_all("rows => rows.map(row => row.dataset.seatPosition)") == ['bottom','right','top','left'], 'offline seats were not ordered self, CPU1, CPU2, CPU3'
    assert page.locator('#online-score-strip .seat-name').all_text_contents() == [online_long_name,'テスト参加者','CPU1','CPU2'], 'online rows did not use the current display names in relative seat order'
    assert page.locator('#local-score-strip .seat-name').all_text_contents() == ['自分','CPU1','CPU2','CPU3'], 'offline player names or their order changed'
    assert page.locator('#online-score-strip .seat-details').all_text_contents() == ['東・親','南','西','北'], 'online wind or dealer information was missing or assigned to the wrong seat'
    assert page.locator('#local-score-strip .seat-details').all_text_contents() == ['東・親','南','西','北'], 'offline wind or dealer information was missing or assigned to the wrong seat'
    assert page.locator('#online-score-strip .seat-label[data-active="true"]').count() == 1 and page.locator('#online-score-strip .seat-label[data-active="true"]').evaluate("row => getComputedStyle(row).borderColor === 'rgb(255, 218, 125)'") , 'online turn emphasis was not preserved'
    assert page.locator('#local-score-strip .seat-label[data-active="true"]').count() == 1 and page.locator('#local-score-strip .seat-label[data-active="true"]').evaluate("row => getComputedStyle(row).borderColor === 'rgb(255, 218, 125)'") , 'offline turn emphasis was not preserved'
    page.evaluate('window.onlineMock.setSeatPresentation(1, true, false)')
    wait_for("document.querySelector('#online-score-strip [data-online-label=right]')?.dataset.displayOrder === '1'")
    guest_row_text = page.locator('#online-score-strip [data-online-label="right"]').inner_text()
    assert 'リーチ' not in guest_row_text and '切断中' not in guest_row_text and page.locator('#online-score-strip [data-online-label="right"] .seat-status, #online-score-strip [data-online-label="right"] .seat-self-marker').count() == 0, f'online auxiliary player status was displayed: {guest_row_text}'
    page.evaluate('window.onlineMock.setSeatPresentation(1, false, true)')

    for width, height in [(320,700),(355,745),(375,812),(390,844),(430,932),(1280,900)]:
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
      for mode in ['online','local']:
        seat_rows = geometry[mode]['seatRows']
        assert len(seat_rows) == 4 and geometry[mode]['seatStripColumns'] == 1, f'{mode} player information was not four rows in one column at {width}px'
        assert geometry[mode]['seatRowOrder'] == ['bottom','right','top','left'], f'{mode} DOM order changed at {width}px'
        assert all(row['order'] == index and row['directParts'] == 3 for index,row in enumerate(seat_rows)), f'{mode} rows did not contain one name, one wind/dealer cell, and one score at {width}px: {seat_rows}'
        assert all(row['contentsFit'] and row['partsSequential'] and row['nameWhiteSpace'] == 'nowrap' and row['nameTextOverflow'] == 'ellipsis' and row['nameHeight'] <= row['rowHeight'] for row in seat_rows), f'{mode} seat information wrapped, overlapped, or overflowed at {width}px: {seat_rows}'
        assert all(not row['status'] and not row['selfMarker'] and not row['declaration'] for row in seat_rows), f'{mode} auxiliary player marker leaked into a row at {width}px: {seat_rows}'
        assert len({row['pointsRight'] for row in seat_rows}) == 1, f'{mode} scores were not right-aligned at {width}px: {seat_rows}'
        assert sum(row['role'] == '・親' for row in seat_rows) == 1, f'{mode} dealer marker was not shown exactly once at {width}px'
      assert geometry['online']['seatRows'][0]['name'] == online_long_name and geometry['online']['seatRows'][0]['nameTitle'] == online_long_name and geometry['online']['seatRows'][0]['nameAriaLabel'] == online_long_name, f'24-character online name was lost or inaccessible at {width}px'
      if width == 320:
        assert geometry['online']['seatRows'][0]['nameOverflow'], 'long online name was not ellipsized in the narrow viewport'
      for mode in ['online','local']:
        assert abs(geometry[mode]['table']['width']-geometry[mode]['table']['height']) <= .5, f'{mode} square table changed at {width}px'
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
    assert page.locator('#online-score-strip [data-online-label="left"] .seat-name').inner_text() == online_long_name, 'seat rotation was wrong for the south player'
    assert page.locator('#online-score-strip [data-online-label="top"]').inner_text().startswith('CPU2'), 'CPU2 name changed when the viewer seat rotated'
    assert page.locator('#online-score-strip [data-online-label="right"]').inner_text().startswith('CPU1'), 'CPU1 name changed when the viewer seat rotated'
    assert page.locator('#online-score-strip .seat-label').evaluate_all("rows => rows.map(row => row.dataset.onlineLabel)") == ['bottom','right','top','left'], 'the online score strip DOM order did not follow the viewer seat after rotation'
    assert page.locator('#online-score-strip .seat-name').all_text_contents() == ['テスト参加者','CPU1','CPU2',online_long_name], 'CPU and human names were assigned to the wrong relative seat after rotation'
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

    spacing_viewports = [(320,568),(375,812),(390,844),(414,896)] if RIVER_SPACING_ONLY else [(320,700),(355,812),(375,812),(390,844),(414,896),(430,932),(1280,900)]
    spacing_repeats = 3 if RIVER_SPACING_ONLY else 1
    spacing_cases = 0
    spacing_measurements = 0
    for repetition in range(spacing_repeats):
      for width, height in spacing_viewports:
        page.set_viewport_size({'width': width, 'height': height})
        for count in ([6] if RIVER_SPACING_ONLY else [1, 6, 7, 12, 18]):
          declaration_cases = [5] if RIVER_SPACING_ONLY else ([-1, count-1] if count < 18 else [-1, 0, 5, 6, 17])
          for viewer in range(4):
            for declaration_index in declaration_cases:
              page.evaluate('args => window.onlineMock.showRiverScenario(args.viewer, args.count, args.declaration)', {
                'viewer': viewer, 'count': count, 'declaration': declaration_index,
              })
              wait_for_stable_river_layout(f'scenario-repeat-{repetition + 1}', width, height, viewer, count, declaration_index)
              metrics = page.evaluate('''() => {
                const overlaps = (a,b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
                const info = document.querySelector('[data-online-center-info]').getBoundingClientRect();
                const rivers = [...document.querySelectorAll('[data-online-river]')].map(river => {
                  const rect = river.getBoundingClientRect();
                  const items = [...river.querySelectorAll('.river-tile')];
                  const tiles = items.map(item => item.querySelector('svg').getBoundingClientRect());
                  let tileOverlap = false;
                  for (let i=0; i<tiles.length; i++) for (let j=i+1; j<tiles.length; j++) tileOverlap ||= overlaps(tiles[i],tiles[j]);
                  const declaration = river.querySelector('[data-riichi-declaration="true"] svg');
                  const declarationRect = declaration?.getBoundingClientRect();
                  const side = river.dataset.onlineRiver === 'left' || river.dataset.onlineRiver === 'right';
                  const declarationDirection = !declarationRect || (side ? declarationRect.width < declarationRect.height : declarationRect.width > declarationRect.height);
                  const mainSpacing = [];
                  for (let i=0; i<items.length; i++) for (let j=i+1; j<items.length; j++) {
                    const rowI=+items[i].dataset.riverRow, columnI=+items[i].dataset.riverColumn;
                    const rowJ=+items[j].dataset.riverRow, columnJ=+items[j].dataset.riverColumn;
                    const axisI=side?rowI:columnI, axisJ=side?rowJ:columnJ;
                    const lineI=side?columnI:rowI, lineJ=side?columnJ:rowJ;
                    if (lineI!==lineJ || Math.abs(axisI-axisJ)!==1) continue;
                    const [first,second,firstIndex,secondIndex]=axisI<axisJ
                      ? [tiles[i],tiles[j],i,j] : [tiles[j],tiles[i],j,i];
                    const gap=side?second.top-first.bottom:second.left-first.right;
                    const firstSize=side?first.height:first.width, secondSize=side?second.height:second.width;
                    mainSpacing.push({
                      river: river.dataset.onlineRiver,
                      firstIndex, secondIndex,
                      firstCell: {row: items[firstIndex].dataset.riverRow, column: items[firstIndex].dataset.riverColumn},
                      secondCell: {row: items[secondIndex].dataset.riverRow, column: items[secondIndex].dataset.riverColumn},
                      firstFace: {left: first.left, top: first.top, width: first.width, height: first.height},
                      secondFace: {left: second.left, top: second.top, width: second.width, height: second.height},
                      gap, centerStep:side?second.top+second.height/2-first.top-first.height/2:second.left+second.width/2-first.left-first.width/2,
                      expectedCenterStep:(firstSize+secondSize)/2+1,
                      hasDeclaration:items[firstIndex].dataset.riichiDeclaration==='true'||items[secondIndex].dataset.riichiDeclaration==='true',
                    });
                  }
                  return {position: river.dataset.onlineRiver, count: tiles.length, infoOverlap: overlaps(rect,info), tileOverlap, declarationDirection, mainSpacing, tilesInRiver: tiles.every(tile =>
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
              spacing_cases += 1
              spacing_measurements += sum(len(river['mainSpacing']) for river in metrics['rivers'])
              assert not metrics['overflow'] and metrics['tableInsideViewport'], f'online table overflow at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {metrics}'
              assert all(river['count'] == count for river in metrics['rivers']), f'online river count failed at {width}px: {metrics}'
              assert all(not river['infoOverlap'] and not river['tileOverlap'] and river['declarationDirection'] and river['tilesInRiver'] for river in metrics['rivers']), f'online river geometry overlapped at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {metrics}'
              for river in metrics['rivers']:
                for pair in river['mainSpacing']:
                  if abs(pair['gap']-1) >= .35 or abs(pair['centerStep']-pair['expectedCenterStep']) >= .35:
                    diagnostics = capture_river_diagnostics(f'repeat-{repetition + 1}-{river["position"]}', width, height, viewer, count, declaration_index)
                    raise AssertionError(f'online river spacing failed: {json.dumps({"metrics": pair, "diagnostics": diagnostics}, ensure_ascii=False)}')
                  assert abs(pair['gap']-1)<.35, f'online main-axis edge gap is not 1px at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {pair}'
                  assert abs(pair['centerStep']-pair['expectedCenterStep'])<.35, f'online main-axis center spacing does not match displayed face sizes at {width}px, viewer {viewer}, {count} discards, declaration {declaration_index}: {pair}'
      if not RIVER_SPACING_ONLY:
        page.screenshot(path=str(OUT / f'step14-2-online-rivers-{width}.png'), full_page=True)
    if RIVER_SPACING_ONLY:
      assert not errors, f'{ENGINE} online river spacing page errors: {errors}'
      print(json.dumps({'browser': ENGINE, 'riverSpacing': {'viewports': spacing_viewports, 'repetitions': spacing_repeats, 'scenarioCases': spacing_cases, 'measuredPairs': spacing_measurements, 'consoleErrors': console_errors, 'result': 'pass'}}, ensure_ascii=False), flush=True)
      browser.close()
      raise SystemExit(0)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('window.onlineMock.resetRivers()')
    page.evaluate("window.onlineMock.setGameDisplayName(0, 'テストホスト')")

    page.evaluate('window.onlineMock.endRound()')
    wait_for("document.querySelector('#online-round-result').hidden === false")
    assert 'ツモ' in page.locator('#online-round-result').inner_text(), 'round result was not displayed'
    assert page.locator('#online-next-round').is_visible() and page.locator('#online-next-round').is_enabled(), 'the host could not advance to the next round'
    page.screenshot(path=str(OUT / 'step14-2-online-game-390.png'), full_page=True)

    result_scenarios = [
      ('self-tsumo', 0, ['ツモ和了！', '和了者：テストホスト', '立直 1翻', '通常ドラ：1枚（1翻）', '裏ドラ：1枚（1翻）', '赤ドラ：1枚（1翻）', '符：30符', 'CPU1（子） → テストホスト', '局終了後の持ち点']),
      ('opponent-ron', 1, ['ロン和了！', '和了者：テストホスト', '放銃者：CPU1', '支払い', '局終了後の持ち点']),
      ('opponent-tsumo', 1, ['ツモ和了！', '和了者：CPU2', '局終了後の持ち点']),
      ('self-ron', 0, ['ロン和了！', '和了者：テストホスト', '放銃者：テスト参加者', '局終了後の持ち点']),
      ('draw', 1, ['荒牌流局', 'テスト参加者：ノーテン', '供託：1本を次局へ持ち越し', '局終了後の持ち点']),
      ('kyuushu', 0, ['途中流局（九種九牌）', '宣言者：CPU1', '局終了後の持ち点']),
      ('match-ended', 1, ['南4局 1本場', '半荘戦終了', '1位 テストホスト', '局終了後の持ち点']),
    ]
    for scenario_index, (scenario, viewer, expected) in enumerate(result_scenarios):
      viewport = {'width': 375, 'height': 667} if scenario_index == 0 else {'width': 320, 'height': 568}
      page.set_viewport_size(viewport)
      if scenario_index:
        page.evaluate('args => window.onlineMock.setResultScenario(args.scenario, args.viewer)', {'scenario': scenario, 'viewer': viewer})
      expected_status = 'match-ended' if scenario == 'match-ended' else 'round-ended'
      expected_reason = 'draw' if scenario == 'draw' else 'kyuushu-kyuuhai' if scenario == 'kyuushu' else 'ron' if scenario.endswith('ron') else 'tsumo'
      expected_winner = None if scenario in ('draw', 'kyuushu') else 3 if scenario == 'opponent-tsumo' else 0
      wait_for(f"""(() => {{
        const view = window.onlineUiTest.onlineGameController.view;
        return view?.status === '{expected_status}' && view.result?.reason === '{expected_reason}' &&
          ({'true' if expected_winner is None else f'view.result.winners?.[0]?.winnerId === {expected_winner}'}) &&
          document.querySelector('#online-show-result').hidden === false && document.querySelector('#result-dialog').open === false;
      }})()""")
      orientation = page.evaluate('''() => {
        const faces=[...document.querySelectorAll('#online-table .public-hand-tile')];
        const backs=[...document.querySelectorAll('#online-table .tile-back')];
        const ownTiles=[...document.querySelectorAll('#online-match .seat-bottom #online-player-hand .tile-choice')];
        const badFaces=faces.filter(tile=>getComputedStyle(tile).rotate!==
          (tile.closest('.seat-top')?'180deg':'none'));
        const badBacks=backs.filter(tile=>getComputedStyle(tile).rotate!=='none');
        const badOwnTiles=ownTiles.filter(tile=>getComputedStyle(tile).rotate!=='none');
        const hands=[...document.querySelectorAll('#online-table .seat-top .concealed-hand')]
          .filter(hand=>hand.querySelector('.public-hand-tile'));
        const reference=document.querySelector('#online-table .tile-back');
        const dimensions=e=>{const s=getComputedStyle(e);return [parseFloat(s.width),parseFloat(s.height)];};
        const referenceSize=reference?dimensions(reference):null;
        const topMetrics=hands.map(hand=>{
          const tiles=[...hand.querySelectorAll(':scope > .public-hand-tile')];
          const sizeDeltas=tiles.map(tile=>referenceSize
            ?Math.max(...dimensions(tile).map((value,index)=>Math.abs(value-referenceSize[index]))):Infinity);
          const rects=tiles.map(tile=>tile.getBoundingClientRect());
          const gaps=rects.slice(1).map((rect,index)=>({actual:rect.left-rects[index].right,
            expected:parseFloat(getComputedStyle(hand).columnGap)||parseFloat(getComputedStyle(hand).gap)||0}));
          return {seat:hand.dataset.playerId,count:tiles.length,sizeDeltas,gaps,
            order:tiles.map(tile=>tile.querySelector('svg')?.getAttribute('aria-label'))};
        });
        const unrotatedMelds=[...document.querySelectorAll('#online-table .open-meld,#online-table .open-meld .tile-svg')]
          .every(node=>getComputedStyle(node).rotate==='none');
        const unrotatedRivers=[...document.querySelectorAll('#online-table .river .river-tile .tile-svg')]
          .every(node=>getComputedStyle(node).rotate==='none');
        return {badFaces:badFaces.length,badBacks:badBacks.length,badOwnTiles:badOwnTiles.length,
          topMetrics,unrotatedMelds,unrotatedRivers};
      }''')
      assert orientation['badFaces'] == orientation['badBacks'] == orientation['badOwnTiles'] == 0, f'{scenario}: public tile orientation: {orientation}'
      assert orientation['unrotatedMelds'] and orientation['unrotatedRivers'], f'{scenario}: meld or river rotation changed: {orientation}'
      for hand in orientation['topMetrics']:
        assert hand['count'] == 14 if scenario == 'kyuushu' else hand['count'] > 0, f'{scenario}: top hand missing tiles: {hand}'
        assert max(hand['sizeDeltas'], default=0) < .2, f'{scenario}: public tile dimensions changed: {hand}'
        assert all(abs(pair['actual']-pair['expected']) < .2 and pair['actual'] >= .9 for pair in hand['gaps']), f'{scenario}: public hand spacing changed: {hand}'
        if scenario == 'kyuushu':
          expected_labels = page.evaluate('''() => {
            const tileLabel=tile=>tile.category==='honor'
              ?({east:'東',south:'南',west:'西',north:'北',white:'白',green:'發',red:'中'}[tile.honor])
              :`${tile.isRed?'赤':''}${tile.rank}${{man:'萬',pin:'筒',sou:'索'}[tile.suit]}`;
            return window.onlineUiTest.onlineGameController.view.seats.find(seat=>seat.seat===2)
              .revealedHand.map(publicTile=>tileLabel(publicTile.tile));
          }''')
          assert hand['order'] == expected_labels, f'{scenario}: visible hand order changed: {hand}, expected {expected_labels}'
      if scenario in ('draw', 'kyuushu'):
        overview = page.evaluate('''() => {
          const view=window.onlineUiTest.onlineGameController.view, result=view.result;
          const text=selector=>[...document.querySelector(selector).querySelectorAll('h2,p')].map(node=>node.innerText);
          const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const table=rect('#online-table'), summary=rect('#online-round-result'), controls=rect('#online-game-controls');
          const show=rect('#online-show-result'), next=rect('#online-next-round'), visual=window.visualViewport;
          const ready=result.tenpai?.map((yes,seat)=>yes?view.seats[seat].control==='cpu'
            ? `CPU${view.seats.filter(s=>s.control==='cpu').sort((a,b)=>a.seat-b.seat).findIndex(s=>s.seat===seat)+1}`
            : view.seats[seat].name:null).filter(Boolean) ?? [];
          const expected=result.reason==='draw'
            ? [`東${result.roundNumber}局 ${result.honba}本場・流局`,`テンパイ：${ready.length?ready.join('、'):'なし'}`]
            : ['途中流局（九種九牌）'];
          const bottom=(visual?.offsetTop??0)+(visual?.height??innerHeight);
          return {lines:text('#online-round-result'),expected,table,summary,controls,show,next,bottom,
            square:Math.abs(table.width-table.height)<1,
            actionsVisible:show.bottom<=bottom&&next.bottom<=bottom,
            actionsBeside:Math.abs(show.top-next.top)<1&&show.right<=next.left+1,
            belowTable:summary.top>=table.bottom-1&&controls.top>=summary.bottom-1&&show.top>=table.bottom,
            noForbidden:/点数：|支払い|持ち点|増減/.test(document.querySelector('#online-round-result').innerText)};
        }''')
        assert overview['lines'] == overview['expected'], f'{scenario}: inconsistent compact online overview: {overview}'
        assert overview['square'] and overview['actionsVisible'] and overview['actionsBeside'] and overview['belowTable'] and not overview['noForbidden'], f'{scenario}: online result layout: {overview}'
      if scenario == 'kyuushu':
        assert page.locator('#online-match .public-hand-tile').count() == 14, 'online 九種九牌 must reveal exactly 14 tiles on the table'
        assert page.locator('#online-result-content .winning-hand li').count() == 14, 'online result must contain 14 declared tiles'
        assert page.locator('#online-result-content').inner_text().count('宣言者：CPU1') == 1
      before_result_open = page.evaluate('JSON.stringify(window.onlineUiTest.onlineGameController.view)')
      before_action_count = page.evaluate('window.onlineMock.gameActions.length')
      page.locator('#online-show-result').click()
      assert page.locator('#result-dialog').evaluate('element => element.open'), f'{scenario}: actual online result button click did not open the shared dialog'
      result_text = page.locator('#online-result-content').inner_text()
      assert all(label in result_text for label in expected), f'{scenario}: expected result detail was missing: {expected}; got {result_text}'
      assert page.locator('#online-result-content .result-dora').count() == (0 if scenario in ('draw', 'kyuushu') else 2), f'{scenario}: public dora rows did not match the result'
      assert page.locator('#result-new-game').is_hidden(), f'{scenario}: the offline new-game action appeared during an online match'
      assert page.evaluate('''() => {
        const dialog = document.querySelector('#result-dialog').getBoundingClientRect();
        const body = document.querySelector('#result-body');
        return dialog.left >= -1 && dialog.top >= -1 && dialog.right <= innerWidth + 1 && dialog.bottom <= innerHeight + 1 &&
          getComputedStyle(body).overflowY === 'auto' && document.documentElement.scrollWidth <= innerWidth;
      }'''), f'{scenario}: shared result dialog did not fit or scroll at {viewport["width"]}x{viewport["height"]}'
      hidden_result_ids = page.evaluate('viewer => window.onlineMock.hiddenNonWinnerTileIds(viewer)', viewer)
      assert all(tile_id not in page.locator('#online-result-content').inner_html() for tile_id in hidden_result_ids), f'{scenario}: a nonwinning private tile ID reached the result details'
      if scenario_index == 0:
        page.screenshot(path=str(OUT / 'step14-2-online-result-375x667.png'))
      elif scenario_index == 1:
        page.screenshot(path=str(OUT / 'step14-2-online-result-320x568.png'))
      assert page.evaluate('JSON.stringify(window.onlineUiTest.onlineGameController.view)') == before_result_open, f'{scenario}: opening the result changed game state'
      assert page.evaluate('window.onlineMock.gameActions.length') == before_action_count, f'{scenario}: opening the result sent a game action'
      page.locator('#view-table').click()
      assert not page.locator('#result-dialog').evaluate('element => element.open'), f'{scenario}: 卓を見る did not close the result dialog'
      assert page.locator('#online-show-result').evaluate('element => document.activeElement === element'), f'{scenario}: close did not restore focus to the online result button'
      assert page.evaluate('JSON.stringify(window.onlineUiTest.onlineGameController.view)') == before_result_open, f'{scenario}: closing the result changed game state'
      assert page.evaluate('window.onlineMock.gameActions.length') == before_action_count, f'{scenario}: closing the result sent a game action'
      page.locator('#online-show-result').click()
      assert page.locator('#result-dialog').evaluate('element => element.open'), f'{scenario}: the result could not be reopened'
      assert page.evaluate('JSON.stringify(window.onlineUiTest.onlineGameController.view)') == before_result_open, f'{scenario}: reopening the result changed game state'
      assert page.evaluate('window.onlineMock.gameActions.length') == before_action_count, f'{scenario}: reopening the result sent a game action'
      page.locator('#view-table').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("window.onlineMock.setResultScenario('self-tsumo', 0)")
    wait_for("document.querySelector('#online-show-result').hidden === false")
    page.set_viewport_size({'width': 390, 'height': 320})
    page.locator('#online-show-result').click()
    page.set_viewport_size({'width': 320, 'height': 568})
    page.evaluate("""() => {
      const controller = window.onlineUiTest.onlineGameController;
      const original = structuredClone(controller.view);
      const dialog = document.querySelector('#result-dialog');
      const body = document.querySelector('#result-body');
      const content = document.querySelector('#online-result-content');
      const firstChild = content.firstChild;
      body.scrollTop = 80;
      const scroll = body.scrollTop;
      if (scroll <= 0) throw new Error('Result fixture must overflow to verify scroll retention');
      const observer = new MutationObserver(() => {});
      observer.observe(content, { childList: true, subtree: true, characterData: true });
      controller.receive({ type: 'game-state', view: { ...original, gameRevision: original.gameRevision + 1 } });
      if (!dialog.open || body.scrollTop !== scroll || content.firstChild !== firstChild || observer.takeRecords().length) {
        throw new Error('Peer readiness rebuilt or closed the result dialog or changed its scroll');
      }
      controller.receive({ type: 'game-state', view: {
        ...original, gameRevision: original.gameRevision + 2,
        self: { ...original.self, nextRoundReady: true },
      } });
      if (!dialog.open || body.scrollTop !== scroll || content.firstChild !== firstChild || observer.takeRecords().length) {
        throw new Error('Own readiness rebuilt the result dialog');
      }
      observer.disconnect();
      const nextRound = document.querySelector('#online-next-round');
      if (nextRound.hidden || !nextRound.disabled || nextRound.textContent !== '他のプレイヤーを待っています…') {
        throw new Error('The ready state did not show a disabled waiting label');
      }
      const actionsBeforeDisabledClick = window.onlineMock.gameActions.length;
      nextRound.click();
      if (window.onlineMock.gameActions.length !== actionsBeforeDisabledClick) {
        throw new Error('The disabled waiting label sent a game action');
      }
      const buttonBox = nextRound.getBoundingClientRect();
      const resultBox = document.querySelector('#online-show-result').getBoundingClientRect();
      if (buttonBox.width < resultBox.width - 1 || buttonBox.right > innerWidth + 1 || buttonBox.left < -1 ||
          document.documentElement.scrollWidth > innerWidth) {
        throw new Error('The waiting label button did not fit the mobile action row');
      }
      window.readyOriginalView = original;
    }""")
    page.set_viewport_size({'width': 390, 'height': 320})
    page.locator('#view-table').click()
    page.locator('#online-show-result').click()
    assert page.locator('#result-dialog').evaluate('element => element.open'), 'ready players could not reopen results'
    page.locator('#view-table').click()
    page.evaluate("window.onlineUiTest.onlineGameController.receive({ type: 'game-started', view: window.readyOriginalView })")
    page.set_viewport_size({'width': 390, 'height': 844})
    assert_riichi_result_fixture()
    assert_next_round_transition()

    round_before_reconnect = page.locator('#online-table-round').inner_text()
    wall_before_reconnect = page.locator('#online-wall-count').inner_text()
    center_before_reconnect = page.locator('[data-online-center-info]').inner_text()
    assert '東2局' in round_before_reconnect, round_before_reconnect
    assert '東風戦' not in center_before_reconnect and '半荘戦' not in center_before_reconnect, center_before_reconnect
    hand_before_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    tickets_before_reconnect = page.evaluate('window.onlineMock.ticketRequests')
    page.evaluate('window.onlineMock.forceDisconnect()')
    assert page.locator('body').get_attribute('data-game-mode') == 'online', 'a temporary disconnection left online mode'
    wait_for(f'window.onlineMock.ticketRequests > {tickets_before_reconnect}', timeout=10000)
    wait_for("document.querySelectorAll('#online-player-hand button[data-tile-id]').length === 14", timeout=10000)
    assert page.locator('body').get_attribute('data-game-mode') == 'online', 'reconnection switched into another game mode'
    assert page.locator('#online-table-round').inner_text() == round_before_reconnect, 'the round display changed after reconnect'
    assert page.locator('#online-wall-count').inner_text() == wall_before_reconnect, 'the wall count changed after reconnect'
    center_after_reconnect = page.locator('[data-online-center-info]').inner_text()
    assert '東風戦' not in center_after_reconnect and '半荘戦' not in center_after_reconnect, center_after_reconnect
    hand_after_reconnect = page.locator('#online-player-hand button[data-tile-id]').evaluate_all("nodes => nodes.map(node => node.dataset.tileId).join(',')")
    assert hand_after_reconnect == hand_before_reconnect, 'the online hand was not restored after reconnect'
    page.evaluate('''() => {
      window.onlineMock.dropNextGameResult();
      window.__shortNextActionTimeout = true;
      window.onlineUiTest.onlineGameController.send({ type: 'discard', tileId: 'diagnostic-invalid-tile' });
    }''')
    wait_for("localStorage.getItem('heibon-mahjong-diagnostics-v2')?.includes('game_action_response_timeout') === true", timeout=5000)
    diagnostic_records = page.evaluate("JSON.parse(localStorage.getItem('heibon-mahjong-diagnostics-v2'))")
    diagnostic_events = [entry['event'] for entry in diagnostic_records]
    assert 'game_action_rejected' in diagnostic_events and 'game_state_sync_requested' in diagnostic_events, diagnostic_events
    assert any(entry['event'] == 'game_action_response_timeout' and entry['details'].get('requestId') for entry in diagnostic_records), diagnostic_records
    select_menu_item('#menu-diagnostics')
    diagnostic_text = page.locator('#diagnostic-entries').inner_text()
    assert 'game_action_completed' in diagnostic_text and 'actionType' in diagnostic_text and 'discard' in diagnostic_text, 'the completed online discard was not recorded'
    assert 'websocket_disconnected' in diagnostic_text and 'reconnect_started' in diagnostic_text, 'disconnect and reconnect were not recorded'
    assert 'game_state_updated' in diagnostic_text and 'requestId' in diagnostic_text, 'game revisions and request IDs were not recorded'
    assert all(tile_id not in diagnostic_text for tile_id in hidden_guest_ids), 'a concealed tile identifier was recorded in diagnostics'
    page.locator('#diagnostic-close').click()

    page.evaluate('''() => { window.onlineMock.setGuestAsHost(); window.onlineMock.simulateGuestExit(); }''')
    wait_for("document.querySelector('#online-game-action-status').innerText.includes('テスト参加者が退出し、CPU1が席を引き継ぎました。 新ホストはテストホストです。')")
    wait_for("document.querySelector('#online-score-strip [data-online-label=right]')?.innerText.startsWith('CPU1')")
    after_guest_handoff = page.evaluate('window.onlineMock.snapshot()')
    assert after_guest_handoff['room']['seats'][1]['kind'] == 'cpu' and after_guest_handoff['room']['seats'][1]['name'] == 'CPU1', after_guest_handoff['room']
    assert after_guest_handoff['gameStatus'] == 'playing' and after_guest_handoff['room']['hostSeat'] == 0, 'a non-host exit ended the game or changed its host'
    assert after_guest_handoff['roundNumber'] == 2 and after_guest_handoff['points'] == [25000] * 4, 'a CPU handoff changed the current round or points'
    assert page.locator('#online-match').is_visible() and page.locator('[data-online-hand="right"] .tile-back').count() == 13, 'the replacement CPU hand was shown in public'
    assert all(tile_id not in page.locator('#online-match').inner_html() for tile_id in hidden_guest_ids), 'the replacement CPU private hand leaked after handoff'

    page.evaluate("window.onlineMock.setResultScenario('match-ended', 0)")
    wait_for("window.onlineUiTest.onlineGameController.view?.status === 'match-ended' && document.querySelector('#online-return-local').hidden === false")
    page.locator('#online-return-local').click()
    assert page.locator('body').get_attribute('data-game-mode') == 'none', 'returning from online match results started offline play'
    assert page.locator('#app-idle').is_visible(), 'returning from online match results did not restore the idle screen'
    assert page.locator('#online-match').is_hidden() and page.locator('#online-game-controls').is_hidden(), 'online game content remained visible after returning to idle'

    select_menu_item('#menu-room')
    before_exit = page.evaluate('window.onlineMock.snapshot()')
    page.evaluate('window.__shortExitNoticeTimeout = true')
    page.locator('#online-leave').click()
    wait_for("!document.querySelector('#online-dialog').open && sessionStorage.getItem('heibon-mahjong-online-session') === null && !document.querySelector('#online-exit-notice').hidden")
    after_exit = page.evaluate('window.onlineMock.snapshot()')
    assert after_exit['room']['status'] == 'closed' and after_exit['room']['hostSeat'] is None, after_exit['room']
    assert after_exit['gameStatus'] == 'aborted' and after_exit['roundNumber'] == before_exit['roundNumber'], 'the final human exit did not end the CPU-only room'
    assert after_exit['points'] == before_exit['points'] and after_exit['rivers'] == before_exit['rivers'], 'the explicit exit changed public game state'
    assert after_exit['hands'] == before_exit['hands'] and after_exit['drawnTiles'] == before_exit['drawnTiles'], 'the explicit exit changed a concealed hand or draw'
    assert page.locator('#online-exit-notice').inner_text() == 'ルームを退出しました。', 'the departing player was not told that they left the room'

    notice_viewports = []
    for width, height in [(320,700),(375,812),(390,844),(414,896)]:
      page.set_viewport_size({'width': width, 'height': height})
      notice_layout = page.evaluate('''() => {
        const header = document.querySelector('.app-header').getBoundingClientRect();
        const notice = document.querySelector('#online-exit-notice');
        const box = notice.getBoundingClientRect();
        return {headerBottom: header.bottom, top: box.top, left: box.left, right: box.right,
          width: box.width, pointerEvents: getComputedStyle(notice).pointerEvents,
          scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth};
      }''')
      assert notice_layout['top'] >= notice_layout['headerBottom'] + 7, (width, notice_layout)
      assert notice_layout['left'] >= 0 and notice_layout['right'] <= width, (width, notice_layout)
      assert notice_layout['scrollWidth'] <= notice_layout['viewportWidth'], (width, notice_layout)
      assert notice_layout['pointerEvents'] == 'none', (width, notice_layout)
      notice_viewports.append({'width': width, **notice_layout})

    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('#main-menu-toggle').click()
    assert page.locator('#main-menu-toggle').get_attribute('aria-expanded') == 'true', 'the menu button could not be operated while the exit notice was visible'
    page.locator('#main-menu-toggle').click()
    wait_for("document.querySelector('#online-exit-notice').hidden && document.querySelector('#online-exit-notice').textContent === ''", timeout=8000)

    assert page.evaluate("sessionStorage.getItem('heibon-mahjong-online-session') === null"), 'successful leave did not remove the session'
    assert page.locator('#menu-room').is_hidden(), 'room operations remained in the menu after leaving'
    wait_for("document.body.dataset.gameMode === 'none' && document.querySelector('#app-idle').hidden === false")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'exit notice causes horizontal overflow after leaving'
    assert page.locator('#local-table').is_hidden() and page.locator('#local-game-controls').is_hidden(), 'offline play or its controls remained active after online exit'
    assert ' '.join(page.locator('#app-idle').inner_text().split()) == '対局待機中 メニューから対局を開始してください'
    assert_no_private_cpu_tile_ids_in_main('CPU private tile IDs leaked after leaving the room')

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

    report = {'step': '14.6', 'viewports': [[320,700],[375,812],[390,844],[414,896],[1280,900]], 'formatChooserViewports': format_layouts, 'createFormViewports': create_form_layouts, 'joinFormViewports': join_form_layouts, 'exitNoticeViewports': notice_viewports, 'scenario': 'separate create/join forms, close-button single-line layout and title spacing at mobile viewport widths, close-button initial focus, Tab navigation, manual name/code input, shared display name, host format propagation and waiting-room visibility, offline format selection at 320/375/390/414px, short-viewport scrolling, input-gated actions, session-safe menu actions, compact hamburger menu, 4-seat river rotation, 1/6/7/18 discards, riichi spacing, action layout, private hands, sync, result, next round, reconnect, surviving host notice after CPU takeover, last-human room close and exit notice placement, menu interaction and auto-dismiss at 320/375/390/414px', 'result': 'pass'}
    print(json.dumps(report, ensure_ascii=False), flush=True)
    (OUT / 'step14-6-online-room-ui.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    page.close()
    browser.close()
