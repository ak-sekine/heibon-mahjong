import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  latestGameMessage,
  waitForClientMessage,
  waitForCpuProgress,
  waitForHumanTurn,
} from './online-production-sync.mjs';

class FakeSocket extends EventEmitter {
  readyState = 1;

  close(): void {
    this.readyState = 3;
    this.emit('close', 1000);
  }
}

function makeClient(diagnosticLabel: string) {
  return {
    socket: new FakeSocket(),
    messages: [] as Array<Record<string, any>>,
    waiters: new Set<(message: Record<string, any>) => void>(),
    decisionAttempts: new Set<string>(),
    diagnosticLabel,
  };
}

function makeView(gameRevision: number, options: Record<string, any> = {}) {
  const viewerSeat = options.viewerSeat ?? 0;
  const turnPlayerId = options.turnPlayerId ?? 2;
  const rivers: number[] = options.cpuRivers ?? [0, 0, 0, 0];
  const seats = [0, 1, 2, 3].map(seat => ({
    seat,
    control: seat < 2 ? 'human' : 'cpu',
    river: Array.from({ length: rivers[seat] ?? 0 }, (_, index) => ({ id: `river-${seat}-${index}` })),
  }));
  return {
    gameRevision,
    status: options.status ?? 'playing',
    phase: options.phase ?? 'awaiting-draw',
    viewerSeat,
    turnPlayerId,
    seats,
    self: {
      seat: options.selfSeat ?? viewerSeat,
      discardableTileIds: options.discardableTileIds ?? ['discard-candidate'],
      decision: options.decision ?? null,
    },
  };
}

function decision(type: 'call' | 'ron', windowId: string, expectedGameRevision: number) {
  return { type, windowId, expectedGameRevision, answered: false };
}

function publishState(client: ReturnType<typeof makeClient>, view: ReturnType<typeof makeView>, type = 'game-state') {
  const message = { type, view };
  client.messages.push(message);
  for (const waiter of [...client.waiters]) waiter(message);
  return message;
}

function timerTracker() {
  const active = new Set<ReturnType<typeof setTimeout>>();
  return {
    active,
    setTimer(callback: () => void, delay: number) {
      let timer: ReturnType<typeof setTimeout>;
      timer = setTimeout(() => {
        active.delete(timer);
        callback();
      }, delay);
      active.add(timer);
      return timer;
    },
    clearTimer(timer: ReturnType<typeof setTimeout>) {
      clearTimeout(timer);
      active.delete(timer);
    },
  };
}

function assertReleased(clients: Array<ReturnType<typeof makeClient>>, timers: ReturnType<typeof timerTracker>) {
  assert.equal(timers.active.size, 0, 'the synchronization deadline timer was cleared');
  for (const client of clients) {
    assert.equal(client.waiters.size, 0, `${client.diagnosticLabel} message listener was removed`);
    assert.equal(client.socket.listenerCount('close'), 0, `${client.diagnosticLabel} close listener was removed`);
    assert.equal(client.socket.listenerCount('error'), 0, `${client.diagnosticLabel} error listener was removed`);
  }
}

const noDecision = async () => ({ ok: true, gameRevision: 0 });

test('accepts a valid host human turn while the guest remains on an older revision', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  publishState(host, makeView(3));
  publishState(guest, makeView(1));

  const waiting = waitForHumanTurn([host, guest], 4, {
    timeoutMs: 500,
    sendDecision: noDecision,
    ...timers,
  });
  queueMicrotask(() => {
    publishState(host, makeView(4, { phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0 }));
    publishState(guest, makeView(0));
  });

  const humanTurn = await waiting;
  assert.equal(humanTurn.gameRevision, 4);
  assert.equal(latestGameMessage(guest)?.view.gameRevision, 1, 'a late lower revision did not replace the guest state');
  assertReleased([host, guest], timers);
});

test('observes a new call window delivered after the wait started with no decision', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const actions: Array<Record<string, any>> = [];
  publishState(host, makeView(5));
  publishState(guest, makeView(4));

  const waiting = waitForHumanTurn([host, guest], 5, {
    timeoutMs: 500,
    sendDecision: async (client, action, expectedGameRevision) => {
      actions.push({ client: client.diagnosticLabel, ...action, expectedGameRevision });
      publishState(client, makeView(7, { phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1 }), 'game-started');
      return { ok: true, gameRevision: 7 };
    },
    ...timers,
  });
  setTimeout(() => publishState(guest, makeView(6, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('call', 'call-window-000123', 5),
  })), 5);

  const humanTurn = await waiting;
  assert.equal(humanTurn.viewerSeat, 1);
  assert.deepEqual(actions, [{
    client: 'guest', type: 'pass-call', windowId: 'call-window-000123', expectedGameRevision: 5,
  }]);
  assert.equal(guest.decisionAttempts.size, 1);
  assertReleased([host, guest], timers);
});

test('handles a call state that was already received before synchronization registered', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const actions: string[] = [];
  publishState(host, makeView(5));
  publishState(guest, makeView(4));
  // This is the state that arrived just after an earlier no-pending scan returned.
  publishState(guest, makeView(6, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('call', 'queued-call-before-wait', 5),
  }));

  const result = await waitForHumanTurn([host, guest], 5, {
    timeoutMs: 500,
    sendDecision: async (client, action) => {
      actions.push(`${client.diagnosticLabel}:${action.type}`);
      publishState(client, makeView(7, { phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1 }));
      return { ok: true, gameRevision: 7 };
    },
    ...timers,
  });

  assert.equal(result.gameRevision, 7);
  assert.deepEqual(actions, ['guest:pass-call']);
  assertReleased([host, guest], timers);
});

test('answers a delayed ron window and only then accepts the human turn', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const actions: string[] = [];
  publishState(host, makeView(5));
  publishState(guest, makeView(4));
  const waiting = waitForHumanTurn([host, guest], 5, {
    timeoutMs: 500,
    sendDecision: async (client, action) => {
      actions.push(`${client.diagnosticLabel}:${action.type}`);
      publishState(client, makeView(8, { phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0 }));
      return { ok: true, gameRevision: 8 };
    },
    ...timers,
  });
  setTimeout(() => publishState(host, makeView(7, {
    phase: 'awaiting-ron', turnPlayerId: 2, viewerSeat: 0,
    decision: decision('ron', 'ron-window-000456', 6),
  })), 5);

  const humanTurn = await waiting;
  assert.equal(humanTurn.gameRevision, 8);
  assert.deepEqual(actions, ['host:pass-ron']);
  assertReleased([host, guest], timers);
});

test('does not send twice when the same decision state is received repeatedly', async () => {
  const client = makeClient('guest');
  const timers = timerTracker();
  const pending = makeView(6, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('call', 'call-window-duplicate', 5),
  });
  publishState(client, pending);
  let sends = 0;
  const waiting = waitForHumanTurn([client], 6, {
    timeoutMs: 500,
    sendDecision: async (target, _action, _expectedRevision, signal) => {
      sends++;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('action aborted'));
        }, { once: true });
      });
      publishState(target, pending);
      publishState(target, { ...pending });
      publishState(target, makeView(7, { phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1 }));
      return { ok: true, gameRevision: 7 };
    },
    ...timers,
  });

  const result = await waiting;
  assert.equal(result.gameRevision, 7);
  assert.equal(sends, 1);
  assertReleased([client], timers);
});

test('handles consecutive call and ron windows during one human-turn wait', async () => {
  const client = makeClient('host');
  const timers = timerTracker();
  const actions: string[] = [];
  publishState(client, makeView(4, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 0,
    decision: decision('call', 'call-window-first', 3),
  }));
  const waiting = waitForHumanTurn([client], 4, {
    timeoutMs: 500,
    sendDecision: async (target, action) => {
      actions.push(action.type);
      if (action.type === 'pass-call') {
        publishState(target, makeView(5, {
          phase: 'awaiting-ron', turnPlayerId: 3, viewerSeat: 0,
          decision: decision('ron', 'ron-window-second', 4),
        }));
        return { ok: true, gameRevision: 5 };
      }
      publishState(target, makeView(6, { phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0 }));
      return { ok: true, gameRevision: 6 };
    },
    ...timers,
  });

  const result = await waiting;
  assert.equal(result.gameRevision, 6);
  assert.deepEqual(actions, ['pass-call', 'pass-ron']);
  assertReleased([client], timers);
});

test('CPU progress wait answers a late decision before confirming a CPU river increase', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const actions: string[] = [];
  publishState(host, makeView(10));
  publishState(guest, makeView(9));
  const waiting = waitForCpuProgress([host, guest], 10, [0, 0, 0, 0], {
    timeoutMs: 500,
    sendDecision: async (client, action, expectedGameRevision) => {
      actions.push(`${client.diagnosticLabel}:${action.type}:${expectedGameRevision}`);
      publishState(client, makeView(12, { phase: 'awaiting-draw', turnPlayerId: 2, viewerSeat: 1 }));
      setTimeout(() => publishState(host, makeView(13, { cpuRivers: [0, 0, 1, 0] })), 5);
      return { ok: true, gameRevision: 12 };
    },
    ...timers,
  });
  setTimeout(() => publishState(guest, makeView(11, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('call', 'cpu-call-delayed', 10),
  })), 5);

  const progress = await waiting;
  assert.equal(progress.gameRevision, 13);
  assert.deepEqual(actions, ['guest:pass-call:10']);
  assert.equal(progress.seats[2].river.length, 1);
  assertReleased([host, guest], timers);
});

test('CPU wait can discard an intervening human turn and continue monitoring decisions', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  let humanDiscards = 0;
  let decisionPasses = 0;
  publishState(host, makeView(10));
  publishState(guest, makeView(10));
  const waiting = waitForCpuProgress([host, guest], 10, [0, 0, 0, 0], {
    timeoutMs: 500,
    sendDecision: async (client, action) => {
      decisionPasses++;
      publishState(client, makeView(13, { phase: 'awaiting-draw', turnPlayerId: 2, viewerSeat: 1 }));
      setTimeout(() => publishState(host, makeView(14, { cpuRivers: [0, 0, 1, 0] })), 5);
      assert.equal(action.type, 'pass-call');
      return { ok: true, gameRevision: 13 };
    },
    handleHumanTurn: async (client, view) => {
      humanDiscards++;
      assert.equal(view.viewerSeat, 1);
      publishState(client, makeView(12, {
        phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
        decision: decision('call', 'call-after-intermediate-human', 11),
      }));
      return { ok: true };
    },
    ...timers,
  });
  setTimeout(() => publishState(guest, makeView(11, {
    phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1,
  })), 5);

  const progress = await waiting;
  assert.equal(progress.gameRevision, 14);
  assert.equal(humanDiscards, 1);
  assert.equal(decisionPasses, 1);
  assertReleased([host, guest], timers);
});

test('stale responses refresh state and never retry the same decision window', async () => {
  const client = makeClient('guest');
  const timers = timerTracker();
  const pending = makeView(6, {
    phase: 'awaiting-call', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('call', 'stale-call-window', 5),
  });
  publishState(client, pending);
  let sends = 0;
  const diagnostics: Array<Record<string, any>> = [];
  const waiting = waitForHumanTurn([client], 6, {
    timeoutMs: 500,
    sendDecision: async (target) => {
      sends++;
      publishState(target, { ...pending, gameRevision: 7 });
      publishState(target, { ...pending, gameRevision: 7 });
      setTimeout(() => publishState(target, makeView(8, {
        phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1,
      })), 5);
      return { ok: false, code: 'stale_revision', gameRevision: 7 };
    },
    diagnostic: (event, details = {}) => diagnostics.push({ event, ...details }),
    ...timers,
  });

  const result = await waiting;
  assert.equal(result.gameRevision, 8);
  assert.equal(sends, 1);
  assert.equal(diagnostics.filter(item => item.event === 'game-sync-decision-detected').length, 1);
  assertReleased([client], timers);
});

test('stale_decision also refreshes without resending the invalid window', async () => {
  const client = makeClient('guest');
  const timers = timerTracker();
  const pending = makeView(6, {
    phase: 'awaiting-ron', turnPlayerId: 2, viewerSeat: 1,
    decision: decision('ron', 'stale-ron-window', 5),
  });
  publishState(client, pending);
  let sends = 0;
  const waiting = waitForHumanTurn([client], 6, {
    timeoutMs: 500,
    sendDecision: async target => {
      sends++;
      publishState(target, { ...pending, gameRevision: 7 });
      setTimeout(() => publishState(target, makeView(8, {
        phase: 'awaiting-discard', turnPlayerId: 1, viewerSeat: 1,
      })), 5);
      return { ok: false, code: 'stale_decision', gameRevision: 7 };
    },
    ...timers,
  });

  const result = await waiting;
  assert.equal(result.gameRevision, 8);
  assert.equal(sends, 1);
  assertReleased([client], timers);
});

test('decision responses do not restart the common CPU wait deadline', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  let sends = 0;
  publishState(host, makeView(10));
  publishState(guest, makeView(9, {
    phase: 'awaiting-call', decision: decision('call', 'deadline-call-first', 8),
  }));

  await assert.rejects(waitForCpuProgress([host, guest], 10, [0, 0, 0, 0], {
    timeoutMs: 35,
    sendDecision: async (client, _action, _expectedRevision, signal) => {
      sends++;
      if (sends === 1) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 8);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('decision wait aborted'));
          }, { once: true });
        });
        publishState(client, makeView(11, {
          phase: 'awaiting-ron', decision: decision('ron', 'deadline-ron-second', 9),
        }));
        return { ok: true, gameRevision: 11 };
      }
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('action exceeded shared deadline')), 200);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('decision wait aborted'));
        }, { once: true });
      });
    },
    ...timers,
  }), /Timed out waiting for cpu-progress/u);

  assert.equal(sends, 2);
  assertReleased([host, guest], timers);
});

test('does not treat a playing revision change with no CPU action as progress', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const diagnostics: Array<Record<string, any>> = [];
  publishState(host, makeView(10));
  publishState(guest, makeView(10));
  setTimeout(() => publishState(host, makeView(11, { turnPlayerId: 3 })), 5);

  await assert.rejects(waitForCpuProgress([host, guest], 10, [0, 0, 0, 0], {
    timeoutMs: 25,
    sendDecision: noDecision,
    diagnostic: (event, details = {}) => diagnostics.push({ event, ...details }),
    ...timers,
  }), /Timed out waiting for cpu-progress/u);
  assert.equal(diagnostics.some(item => item.event === 'game-sync-wait-timeout' && item.waitKind === 'cpu-progress'), true);
  assertReleased([host, guest], timers);
});

test('timeout diagnostics include both clients and release all wait resources', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  const diagnostics: Array<Record<string, any>> = [];
  let timeoutHookCalls = 0;
  publishState(host, makeView(5));
  publishState(guest, makeView(4, {
    phase: 'awaiting-call', decision: decision('call', 'diagnostic-window', 3),
  }));

  await assert.rejects(waitForHumanTurn([host, guest], 6, {
    timeoutMs: 25,
    sendDecision: async () => ({ ok: true, gameRevision: 5 }),
    diagnostic: (event, details = {}) => diagnostics.push({ event, ...details }),
    onTimeout: () => { timeoutHookCalls++; },
    ...timers,
  }), /Timed out waiting for human-turn/u);
  const timeout = diagnostics.find(item => item.event === 'game-sync-wait-timeout');
  assert.deepEqual(timeout.clients.map((entry: Record<string, any>) => entry.client), ['host', 'guest']);
  assert.equal(diagnostics.some(item => item.event === 'game-sync-decision-detected'), true);
  assert.equal(timeoutHookCalls, 1);
  assertReleased([host, guest], timers);
});

test('a socket disconnect cancels the shared wait and removes every listener', async () => {
  const host = makeClient('host');
  const guest = makeClient('guest');
  const timers = timerTracker();
  publishState(host, makeView(5));
  publishState(guest, makeView(4));
  const waiting = waitForHumanTurn([host, guest], 6, {
    timeoutMs: 500,
    sendDecision: noDecision,
    ...timers,
  });
  host.socket.close();

  await assert.rejects(waiting, /WebSocket host closed/u);
  assertReleased([host, guest], timers);
});

test('message waiters clear their timers and listeners on success, timeout, and abort', async () => {
  const client = makeClient('host');
  const timers = timerTracker();
  const successfulWait = waitForClientMessage(client, message => message.type === 'action-result', {
    timeoutMs: 500,
    ...timers,
  });
  const resultMessage = { type: 'action-result', ok: true };
  client.messages.push(resultMessage);
  for (const waiter of [...client.waiters]) waiter(resultMessage);
  assert.equal(await successfulWait, resultMessage);
  assertReleased([client], timers);

  await assert.rejects(waitForClientMessage(client, message => message.type === 'missing', {
    timeoutMs: 10,
    ...timers,
  }), /Timed out waiting for protocol response/u);
  assertReleased([client], timers);

  const controller = new AbortController();
  const abortedWait = waitForClientMessage(client, message => message.type === 'never', {
    timeoutMs: 500,
    signal: controller.signal,
    ...timers,
  });
  controller.abort();
  await assert.rejects(abortedWait, error => error.name === 'AbortError');
  assertReleased([client], timers);
});

test('disconnect aborts an in-flight decision response waiter and its timer', async () => {
  const client = makeClient('guest');
  const timers = timerTracker();
  publishState(client, makeView(6, {
    phase: 'awaiting-call', decision: decision('call', 'disconnect-call-window', 5),
  }));
  const waiting = waitForHumanTurn([client], 7, {
    timeoutMs: 1000,
    sendDecision: (target, _action, _expectedRevision, signal) => waitForClientMessage(
      target, message => message.type === 'game-action-result', {
        timeoutMs: 10000,
        signal,
        ...timers,
      },
    ),
    ...timers,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.waiters.size, 2, 'the sync and action response listeners are both active');
  assert.equal(timers.active.size, 2, 'the shared deadline and action response timers are both active');
  client.socket.close();

  await assert.rejects(waiting, /WebSocket guest closed/u);
  assertReleased([client], timers);
});

test('an unexpected decision operation error fails the wait instead of being swallowed', async () => {
  const client = makeClient('host');
  const timers = timerTracker();
  publishState(client, makeView(6, {
    phase: 'awaiting-ron', turnPlayerId: 2, viewerSeat: 0,
    decision: decision('ron', 'unexpected-error-window', 5),
  }));

  await assert.rejects(waitForHumanTurn([client], 7, {
    timeoutMs: 500,
    sendDecision: async () => ({ ok: false, code: 'invalid_action', gameRevision: 6 }),
    ...timers,
  }), /Unexpected pass-ron response \(invalid_action\)/u);
  assertReleased([client], timers);
});

test('requires the authenticated viewer seat and an operable human hand', async () => {
  const client = makeClient('host');
  const timers = timerTracker();
  const diagnostics: Array<Record<string, any>> = [];
  publishState(client, makeView(5, {
    phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0, selfSeat: 1,
  }));
  const waiting = waitForHumanTurn([client], 5, {
    timeoutMs: 500,
    sendDecision: async (target, action) => {
      assert.equal(action.type, 'pass-call', 'a pending decision cannot satisfy a human-turn wait');
      publishState(target, makeView(7, {
        phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0,
        discardableTileIds: [],
      }));
      publishState(target, makeView(8, {
        phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0,
      }));
      return { ok: true, gameRevision: 8 };
    },
    diagnostic: (event, details = {}) => diagnostics.push({ event, ...details }),
    ...timers,
  });
  publishState(client, makeView(6, {
    phase: 'awaiting-discard', turnPlayerId: 0, viewerSeat: 0,
    decision: decision('call', 'human-turn-pending-window', 5),
  }));

  const result = await waiting;
  assert.equal(result.gameRevision, 8);
  assert.equal(diagnostics.some(item => item.event === 'game-sync-wait-satisfied' && item.gameRevision === 6), false);
  assertReleased([client], timers);
});
