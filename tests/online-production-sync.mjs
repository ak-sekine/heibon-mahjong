import { isDeepStrictEqual } from 'node:util';

function isGameState(message) {
  return (message?.type === 'game-state' || message?.type === 'game-started') &&
    Number.isSafeInteger(message.view?.gameRevision);
}

export function waitForClientMessage(client, predicate, {
  afterIndex = 0,
  timeoutMs = 10000,
  description = 'protocol response',
  signal,
  diagnostic = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const waitStartedAt = Date.now();
  const existing = client.messages.slice(afterIndex).find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearTimer(timer);
      client.waiters.delete(onMessage);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error, message) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(message);
    };
    const onAbort = () => {
      const error = new Error(`Waiting for ${description} was cancelled.`);
      error.name = 'AbortError';
      finish(error);
    };
    const onMessage = message => {
      if (predicate(message)) finish(null, message);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timer = setTimer(() => {
      const recentTypes = client.messages.slice(afterIndex).slice(-8).map(message => message.type).join(', ') || 'none';
      diagnostic('wait-for-message-timeout', {
        client: client.diagnosticLabel,
        description,
        timeoutMs,
        waitElapsedMs: Date.now() - waitStartedAt,
        recentTypes,
      });
      finish(new Error(`Timed out waiting for ${description}; recent protocol message types: ${recentTypes}.`));
    }, timeoutMs);
    client.waiters.add(onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function latestGameMessage(client) {
  let latest;
  for (const message of client.messages) {
    if (!isGameState(message)) continue;
    if (!latest || message.view.gameRevision >= latest.view.gameRevision) latest = message;
  }
  return latest;
}

// PlayerGameView exposes these fields only to the authenticated player. Everything
// else (including revealed hands, rivers, melds and connection flags) is public.
function commonGameState(view) {
  const { viewerSeat, self, seats, ...common } = view;
  return {
    ...common,
    seats: seats.map(({ hand, drawnTile, ...seat }) => seat),
  };
}

function validSnapshot(view, roomCode, viewerSeat) {
  const isSeat = seat => Number.isInteger(seat) && seat >= 0 && seat < 4;
  const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
  return view?.type === 'game-state' && view.roomCode === roomCode &&
    Number.isSafeInteger(view.gameRevision) && view.gameRevision >= 1 &&
    ['playing', 'round-ended', 'match-ended'].includes(view.status) &&
    ['awaiting-draw', 'awaiting-call', 'awaiting-ron', 'awaiting-discard', 'wall-exhausted', 'won'].includes(view.phase) &&
    view.viewerSeat === viewerSeat && view.self?.seat === viewerSeat &&
    isSeat(view.turnPlayerId) && nonnegativeInteger(view.liveWallCount) &&
    isSeat(view.round?.dealerId) && Number.isSafeInteger(view.round?.roundNumber) && view.round.roundNumber >= 1 &&
    nonnegativeInteger(view.round?.honba) &&
    Array.isArray(view.round?.points) && view.round.points.length === 4 && view.round.points.every(Number.isFinite) &&
    Array.isArray(view.doraIndicators) && Array.isArray(view.seats) && view.seats.length === 4 &&
    view.seats.every((seat, index) => seat?.seat === index &&
      ['human', 'cpu'].includes(seat.control) && typeof seat.connected === 'boolean' &&
      Number.isFinite(seat.points) && nonnegativeInteger(seat.concealedCount) &&
      Array.isArray(seat.river) && Array.isArray(seat.melds)) &&
    view.seats[viewerSeat].control === 'human' && Array.isArray(view.seats[viewerSeat].hand);
}

export function waitForMatchingGameStates(clients, {
  roomCode,
  viewerSeats,
  minimumRevision,
  requestState,
  timeoutMs = 15000,
  diagnostic = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
} = {}) {
  if (clients.length !== 2 || new Set(clients).size !== 2 ||
      !Array.isArray(viewerSeats) || viewerSeats.length !== 2 || new Set(viewerSeats).size !== 2 ||
      !viewerSeats.every(seat => Number.isInteger(seat) && seat >= 0 && seat < 4) ||
      typeof roomCode !== 'string' || !roomCode || !Number.isSafeInteger(minimumRevision) || minimumRevision < 1 ||
      !Number.isFinite(timeoutMs) || timeoutMs < 0 || typeof requestState !== 'function') {
    throw new Error('Two distinct authenticated players, a room, revision, snapshot requester and bounded timeout are required.');
  }
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  // Existing messages establish a floor only; they can never satisfy this wait.
  const revisionFloor = Math.max(minimumRevision, ...clients.map(client => latestGameMessage(client)?.view.gameRevision ?? 0));
  const latest = new Map();
  const listeners = [];
  let timer;
  let settled = false;
  let comparedRevision = null;
  return new Promise((resolve, reject) => {
    const details = () => ({
      minimumRevision: revisionFloor,
      timeoutMs,
      startedAt,
      waitElapsedMs: now() - startedAt,
      clients: clients.map(client => ({
        ...stateSummary(client, latest.get(client)?.message),
        receivedAt: latest.get(client)?.receivedAt ?? null,
      })),
    });
    const finish = (reason, error, value) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimer(timer);
      for (const { client, onMessage, onClose, onError } of listeners) {
        client.waiters.delete(onMessage);
        client.socket.off('close', onClose);
        client.socket.off('error', onError);
      }
      diagnostic(error ? 'snapshot-sync-failed' : 'snapshot-sync-satisfied', {
        ...details(), reason, comparedRevision,
      });
      if (error) reject(error);
      else resolve(value);
    };
    const fail = (reason, message) => finish(reason, new Error(message));
    const timeout = () => fail('timeout', 'Timed out waiting for matching post-reconnect game snapshots.');
    const evaluate = () => {
      if (settled) return;
      if (now() >= deadline) return timeout();
      if (clients.some(client => client.socket.readyState !== 1)) {
        fail('disconnect', 'A WebSocket is not open while comparing game snapshots.');
        return;
      }
      if (clients.some(client => !latest.get(client)?.reconnected)) return;
      const snapshots = clients.map(client => latest.get(client)?.message);
      if (snapshots.some(message => !message)) return;
      const [host, guest] = snapshots.map(message => message.view);
      if (host.gameRevision !== guest.gameRevision) {
        diagnostic('snapshot-sync-revision-pending', details());
        return;
      }
      comparedRevision = host.gameRevision;
      const common = snapshots.map(message => commonGameState(message.view));
      const mismatchedFields = [...new Set(common.flatMap(Object.keys))]
        .filter(key => !isDeepStrictEqual(common[0][key], common[1][key]));
      if (mismatchedFields.length) {
        diagnostic('snapshot-sync-state-mismatch', {
          ...details(), comparedRevision: host.gameRevision, mismatchedFields,
        });
        fail('state-mismatch', `Common game state differed at revision ${host.gameRevision} (${mismatchedFields.join(', ')}).`);
        return;
      }
      finish('matched', null, { gameRevision: host.gameRevision, messages: snapshots });
    };

    diagnostic('snapshot-sync-start', { ...details(), viewerSeats });
    for (const [index, client] of clients.entries()) {
      const onMessage = message => {
        if (settled || !['game-state', 'game-started'].includes(message?.type)) return;
        if (now() >= deadline) return timeout();
        const view = message.view;
        if (!validSnapshot(view, roomCode, viewerSeats[index])) {
          diagnostic('snapshot-sync-invalid-state', {
            ...details(), rejected: { ...stateSummary(client, message), receivedAt: now() },
            reason: 'wrong-room-authentication-status-or-shape',
          });
          fail('invalid-state', `Invalid post-reconnect game snapshot from ${client.diagnosticLabel}.`);
          return;
        }
        const previous = latest.get(client)?.message.view.gameRevision;
        if (view.gameRevision < revisionFloor || (previous !== undefined && view.gameRevision < previous)) {
          diagnostic('snapshot-sync-stale-state-ignored', {
            ...details(), client: client.diagnosticLabel, ignoredRevision: view.gameRevision,
          });
          return;
        }
        const reconnected = viewerSeats.every(seat => view.seats[seat].connected === true);
        latest.set(client, { message, receivedAt: now(), reconnected });
        // Connection flags do not increment gameRevision. A snapshot that still
        // shows either authenticated human disconnected cannot prove reconnect.
        if (!reconnected) {
          diagnostic('snapshot-sync-reconnect-pending', details());
          return;
        }
        diagnostic('snapshot-sync-state-received', details());
        evaluate();
      };
      const onClose = () => fail('disconnect', `WebSocket ${client.diagnosticLabel} closed while waiting for matching game snapshots.`);
      const onError = () => fail('socket-error', `WebSocket ${client.diagnosticLabel} failed while waiting for matching game snapshots.`);
      client.waiters.add(onMessage);
      client.socket.on('close', onClose);
      client.socket.on('error', onError);
      listeners.push({ client, onMessage, onClose, onError });
    }
    timer = setTimer(timeout, Math.max(0, deadline - now()));
    // Register both listeners before requesting either snapshot. Requests are
    // sent once; ongoing broadcasts may bring the latest revisions together.
    for (const client of clients) {
      if (settled) break;
      if (client.socket.readyState !== 1) {
        fail('disconnect', `WebSocket ${client.diagnosticLabel} is not open for game snapshot synchronization.`);
        break;
      }
    }
    if (now() >= deadline && !settled) timeout();
    for (const client of clients) {
      if (settled) break;
      try { requestState(client); }
      catch { fail('request-failed', `Game snapshot request failed for ${client.diagnosticLabel}.`); }
    }
  });
}

function pendingDecision(view) {
  const decision = view?.self?.decision;
  return decision && !decision.answered ? decision : null;
}

function windowIdSuffix(decision) {
  return typeof decision?.windowId === 'string' ? decision.windowId.slice(-6) : null;
}

function socketState(client) {
  return ['connecting', 'open', 'closing', 'closed'][client.socket.readyState] ?? 'unknown';
}

function stateSummary(client, message) {
  const view = message?.view;
  const decision = view?.self?.decision;
  return {
    client: client.diagnosticLabel,
    gameRevision: Number.isSafeInteger(view?.gameRevision) ? view.gameRevision : null,
    status: view?.status ?? null,
    phase: view?.phase ?? null,
    turnPlayerId: view?.turnPlayerId ?? null,
    decisionPending: Boolean(pendingDecision(view)),
    decisionType: decision?.type ?? null,
    decisionWindowIdSuffix: windowIdSuffix(decision),
    decisionAnswered: decision ? Boolean(decision.answered) : null,
    socketState: socketState(client),
  };
}

function actionableHumanTurn(view) {
  return view?.status === 'playing' && view.phase === 'awaiting-discard' &&
    view.turnPlayerId === view.viewerSeat && view.self?.seat === view.viewerSeat &&
    view.seats?.[view.turnPlayerId]?.control === 'human' &&
    Array.isArray(view.self?.discardableTileIds) && view.self.discardableTileIds.length > 0 &&
    !pendingDecision(view);
}

function asError(error, fallback) {
  return error instanceof Error ? error : new Error(fallback);
}

async function waitForGameCondition(clients, {
  waitKind,
  afterRevision,
  timeoutMs,
  qualifies,
  sendDecision,
  handleView,
  diagnostic = () => {},
  onTimeout: onTimeoutHook,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error('A nonnegative game-state wait timeout is required.');
  if (typeof sendDecision !== 'function') throw new Error('A game decision sender is required.');
  const watchedClients = [...new Set(clients)];
  if (watchedClients.length === 0) throw new Error('At least one WebSocket client is required.');

  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const controller = new AbortController();
  const latestByClient = new Map();
  const attemptedByClient = new Map();
  const activeOperations = new Set();
  const listeners = [];
  let timer;
  let active = true;
  let cleaned = false;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  diagnostic('game-sync-wait-start', {
    waitKind,
    afterRevision,
    timeoutMs,
    clients: watchedClients.map(client => stateSummary(client, latestGameMessage(client))),
  });

  const diagnosticDetails = () => ({
    waitKind,
    afterRevision,
    timeoutMs,
    waitElapsedMs: Date.now() - startedAt,
    clients: watchedClients.map(client => stateSummary(client, latestByClient.get(client))),
  });

  const cleanup = reason => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    if (timer !== undefined) clearTimer(timer);
    for (const listener of listeners) {
      listener.client.waiters.delete(listener.onMessage);
      listener.client.socket.off('close', listener.onClose);
      listener.client.socket.off('error', listener.onError);
    }
    diagnostic('game-sync-wait-released', {
      waitKind,
      reason,
      clientCount: listeners.length,
      listenerCount: listeners.length * 3,
      waitElapsedMs: Date.now() - startedAt,
    });
    controller.abort();
  };

  const finish = (error, value, reason) => {
    if (!active) return;
    cleanup(reason);
    if (error) rejectCompletion(error);
    else resolveCompletion(value);
  };

  const fail = error => finish(asError(error, 'Game-state synchronization failed.'), undefined, 'error');

  const startOperation = (operation, onSuccess) => {
    if (!active) return;
    let task;
    task = Promise.resolve().then(operation).then(result => {
      if (!active) return;
      onSuccess?.(result);
    }).catch(error => {
      if (active) fail(error);
    }).finally(() => {
      activeOperations.delete(task);
      evaluate();
    });
    activeOperations.add(task);
  };

  const startDecision = (client, message) => {
    const view = message.view;
    const decision = pendingDecision(view);
    if (!decision) return;
    if ((decision.type !== 'ron' && decision.type !== 'call') ||
        typeof decision.windowId !== 'string' || !Number.isSafeInteger(decision.expectedGameRevision)) {
      fail(new Error(`Unexpected ${waitKind} game decision state.`));
      return;
    }
    let attempted = attemptedByClient.get(client);
    if (!attempted) {
      attempted = client.decisionAttempts instanceof Set ? client.decisionAttempts : new Set();
      client.decisionAttempts = attempted;
      attemptedByClient.set(client, attempted);
    }
    if (attempted.has(decision.windowId)) return;

    // Claim the window before sending so duplicate or repeated state messages cannot send twice.
    attempted.add(decision.windowId);
    diagnostic('game-sync-decision-detected', {
      waitKind,
      client: client.diagnosticLabel,
      gameRevision: view.gameRevision,
      decisionType: decision.type,
      windowIdSuffix: windowIdSuffix(decision),
      expectedGameRevision: decision.expectedGameRevision,
    });
    const action = decision.type === 'ron' ? 'pass-ron' : 'pass-call';
    startOperation(() => sendDecision(client, {
      type: action,
      windowId: decision.windowId,
    }, decision.expectedGameRevision, controller.signal), resultValue => {
      const result = resultValue?.result ?? resultValue;
      if (!result || typeof result.ok !== 'boolean' ||
          (!result.ok && result.code !== 'stale_revision' && result.code !== 'stale_decision')) {
        const code = typeof result?.code === 'string' ? result.code : 'missing_result';
        throw new Error(`Unexpected ${action} response (${code}).`);
      }
      diagnostic('game-sync-decision-response', {
        waitKind,
        client: client.diagnosticLabel,
        gameRevision: Number.isSafeInteger(result.gameRevision) ? result.gameRevision : null,
        decisionType: decision.type,
        windowIdSuffix: windowIdSuffix(decision),
        ok: result.ok,
        code: result.code ?? null,
      });
    });
  };

  function updateLatest(client, message) {
    const previous = latestByClient.get(client);
    const revision = message.view.gameRevision;
    if (previous && revision < previous.view.gameRevision) {
      diagnostic('game-sync-stale-state-ignored', {
        waitKind,
        client: client.diagnosticLabel,
        gameRevision: revision,
        latestGameRevision: previous.view.gameRevision,
      });
      return false;
    }
    latestByClient.set(client, message);
    const previousDecision = pendingDecision(previous?.view);
    const nextDecision = message.view?.self?.decision;
    if (previousDecision && (previousDecision.windowId !== nextDecision?.windowId || nextDecision?.answered)) {
      diagnostic('game-sync-decision-resolved', {
        waitKind,
        client: client.diagnosticLabel,
        gameRevision: revision,
        decisionType: previousDecision.type,
        windowIdSuffix: windowIdSuffix(previousDecision),
        resolution: nextDecision?.windowId === previousDecision.windowId && nextDecision.answered
          ? 'answered' : nextDecision && !nextDecision.answered ? 'replaced' : 'cleared',
      });
    }
    return true;
  }

  function evaluate() {
    if (!active) return;
    for (const client of watchedClients) {
      const message = latestByClient.get(client);
      if (!message) continue;
      const view = message.view;
      startDecision(client, message);
      if (!active) return;
      if (handleView) {
        try {
          const handled = handleView(client, view, controller.signal);
          if (handled && typeof handled.then === 'function') startOperation(() => handled);
        } catch (error) {
          fail(error);
          return;
        }
      }
    }
    if (!active || activeOperations.size > 0) return;
    for (const client of watchedClients) {
      const message = latestByClient.get(client);
      if (message && qualifies(message.view, client)) {
        const revision = message.view.gameRevision;
        const pendingAtCandidateRevision = watchedClients.some(otherClient => {
          const other = latestByClient.get(otherClient);
          return other && other.view.gameRevision >= revision && pendingDecision(other.view);
        });
        if (pendingAtCandidateRevision) continue;
        diagnostic('game-sync-wait-satisfied', {
          waitKind,
          client: client.diagnosticLabel,
          gameRevision: message.view.gameRevision,
          status: message.view.status,
          phase: message.view.phase,
          turnPlayerId: message.view.turnPlayerId,
          waitElapsedMs: Date.now() - startedAt,
        });
        finish(null, { client, message, view: message.view }, 'success');
        return;
      }
    }
  }

  const timeoutCallback = () => {
    if (!active) return;
    const details = diagnosticDetails();
    diagnostic('game-sync-wait-timeout', details);
    try {
      onTimeoutHook?.(details);
    } catch (error) {
      finish(error, undefined, 'timeout-diagnostic-error');
      return;
    }
    finish(new Error(`Timed out waiting for ${waitKind}.`), undefined, 'timeout');
  };

  for (const client of watchedClients) {
    const onMessage = message => {
      if (!active || !isGameState(message)) return;
      if (!updateLatest(client, message)) return;
      evaluate();
    };
    const onClose = () => {
      if (!active) return;
      diagnostic('game-sync-wait-disconnected', {
        waitKind,
        client: client.diagnosticLabel,
        waitElapsedMs: Date.now() - startedAt,
      });
      finish(new Error(`WebSocket ${client.diagnosticLabel} closed while waiting for ${waitKind}.`), undefined, 'disconnect');
    };
    const onError = () => {
      if (!active) return;
      diagnostic('game-sync-wait-disconnected', {
        waitKind,
        client: client.diagnosticLabel,
        socketEvent: 'error',
        waitElapsedMs: Date.now() - startedAt,
      });
      finish(new Error(`WebSocket ${client.diagnosticLabel} failed while waiting for ${waitKind}.`), undefined, 'socket-error');
    };
    client.waiters.add(onMessage);
    client.socket.on('close', onClose);
    client.socket.on('error', onError);
    listeners.push({ client, onMessage, onClose, onError });
  }

  timer = setTimer(timeoutCallback, Math.max(0, deadline - Date.now()));
  for (const client of watchedClients) {
    if (client.socket.readyState === 3) {
      const onClose = listeners.find(listener => listener.client === client)?.onClose;
      onClose?.();
      break;
    }
    const message = latestGameMessage(client);
    if (message) updateLatest(client, message);
  }
  if (active) evaluate();
  return completion.finally(async () => {
    cleanup('settled');
    await Promise.allSettled([...activeOperations]);
  });
}

function humanTurnQualifies(view, minimumRevision) {
  if (!Number.isSafeInteger(view?.gameRevision) || view.gameRevision < minimumRevision) return false;
  if (view.status !== 'playing') return true;
  return actionableHumanTurn(view);
}

export async function waitForHumanTurn(clients, minimumRevision, {
  timeoutMs = 20000,
  sendDecision,
  diagnostic,
  onTimeout,
  setTimer,
  clearTimer,
} = {}) {
  const result = await waitForGameCondition(clients, {
    waitKind: 'human-turn',
    afterRevision: minimumRevision,
    timeoutMs,
    sendDecision,
    diagnostic,
    onTimeout,
    setTimer,
    clearTimer,
    qualifies: view => humanTurnQualifies(view, minimumRevision),
  });
  return result.view;
}

export async function waitForCpuProgress(clients, afterRevision, previousRivers, {
  timeoutMs = 15000,
  sendDecision,
  handleHumanTurn,
  diagnostic,
  onTimeout,
  setTimer,
  clearTimer,
} = {}) {
  const handledHumanTurns = new Map();
  const progressed = view => {
    if (!view || Number(view.gameRevision) <= afterRevision) return false;
    if (view.status !== 'playing') return true;
    return Array.isArray(view.seats) && view.seats.some(seat => seat.control === 'cpu' &&
      seat.river.length > (previousRivers[seat.seat] ?? 0));
  };
  const handleView = handleHumanTurn ? (client, view, signal) => {
    if (!actionableHumanTurn(view) || Number(view.gameRevision) <= afterRevision) return undefined;
    const key = `${view.viewerSeat}:${view.gameRevision}`;
    let handled = handledHumanTurns.get(client);
    if (!handled) {
      handled = new Set();
      handledHumanTurns.set(client, handled);
    }
    if (handled.has(key)) return undefined;
    handled.add(key);
    return handleHumanTurn(client, view, signal);
  } : undefined;
  const result = await waitForGameCondition(clients, {
    waitKind: 'cpu-progress',
    afterRevision,
    timeoutMs,
    sendDecision,
    handleView,
    diagnostic,
    onTimeout,
    setTimer,
    clearTimer,
    qualifies: progressed,
  });
  return result.view;
}
