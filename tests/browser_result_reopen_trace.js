() => {
  const selectors = {
    button: '#show-result',
    panel: '#local-game-controls',
    match: '#match-result-dialog',
    result: '#result-dialog',
    close: '#match-result-close',
    reopenMatch: '#show-match-result',
    viewTable: '#view-table',
    newGame: '#new-game-dialog',
  };
  const tracked = Object.values(selectors).join(',');
  const nodes = new WeakMap();
  let nextId = 0;
  const identify = node => {
    if (!node) return null;
    if (!nodes.has(node)) nodes.set(node, ++nextId);
    if (!(node instanceof Element)) return { token: nodes.get(node), type: node === window ? 'window' : node.nodeName };
    return {
      token: nodes.get(node), tag: node.localName,
      role: Object.keys(selectors).find(key => node.matches(selectors[key])) ?? null,
    };
  };
  const limit = 480;
  const durationMs = 10000;
  const timeline = [];
  const marks = [];
  let dropped = 0;
  let stopped;
  let frame;
  let timer;
  let previousFrame;
  const start = performance.now();
  const current = key => document.querySelector(selectors[key]);
  const rect = node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  };
  const state = () => {
    const button = current('button');
    const box = button && rect(button);
    const style = button && getComputedStyle(button);
    const viewport = window.visualViewport;
    return {
      button: button && { ...identify(button), connected: button.isConnected, hidden: button.hidden,
        disabled: button.disabled, display: style.display, visibility: style.visibility,
        pointerEvents: style.pointerEvents, rect: box },
      panel: identify(current('panel')),
      active: identify(document.activeElement),
      matchOpen: current('match')?.open,
      resultOpen: current('result')?.open,
      newGameOpen: current('newGame')?.open,
      hit: box && identify(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      visualViewport: viewport && { width: viewport.width, height: viewport.height,
        offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop, scale: viewport.scale },
    };
  };
  const append = entry => {
    if (stopped) return;
    if (timeline.length >= limit) { dropped++; return; }
    timeline.push({ at: performance.now(), ...entry });
  };
  const mark = name => {
    if (!stopped && marks.length < 16) marks.push({ at: performance.now(), name, state: state() });
  };
  const listeners = new AbortController();
  const sampleEvent = (event, phase) => {
    const path = event.composedPath();
    // Global capture detects retargeted events as well as events on the expected button.
    append({ kind: 'event', type: event.type, phase, target: identify(event.target),
      currentTarget: identify(event.currentTarget), path: path.slice(0, 16).map(identify),
      input: { x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        pointerType: event.pointerType, button: event.button },
      defaultPrevented: event.defaultPrevented, isTrusted: event.isTrusted, state: state() });
  };
  const eventTypes = ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture',
    'mousedown', 'mouseup', 'click', 'focus', 'blur', 'focusin', 'focusout'];
  const add = (node, phase, capture) => {
    for (const name of eventTypes) {
      node.addEventListener(name, event => sampleEvent(event, phase), {
        capture, passive: true, signal: listeners.signal,
      });
    }
  };
  add(window, 'window-capture', true);
  add(window, 'window-bubble', false);
  for (const key of ['button', 'panel']) {
    const node = current(key);
    if (node) {
      add(node, key + '-capture', true);
      add(node, key + '-bubble', false);
    }
  }

  // Keep structural identifiers only. Never serialize text, class/style values, or data attributes.
  const matching = node => {
    if (!(node instanceof Element)) return [];
    return [...(node.matches(tracked) ? [node] : []), ...node.querySelectorAll(tracked)].map(identify);
  };
  const observer = new MutationObserver(records => {
    for (const entry of records) {
      const added = [...entry.addedNodes].flatMap(matching);
      const removed = [...entry.removedNodes].flatMap(matching);
      if (entry.target.matches?.(tracked) || added.length || removed.length ||
          (entry.type === 'attributes' && entry.target.querySelector?.(tracked))) {
        append({ kind: 'mutation', type: entry.type, target: identify(entry.target),
          attribute: entry.attributeName, added, removed });
      }
    }
  });
  // Observe additions and removals even when a tracked node is temporarily disconnected.
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['id', 'class', 'style', 'hidden', 'disabled', 'open', 'inert', 'aria-hidden'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  const resize = new ResizeObserver(entries => {
    append({ kind: 'resize', targets: entries.map(entry => identify(entry.target)), state: state() });
  });
  for (const key of ['button', 'panel', 'match', 'result']) {
    const node = current(key);
    if (node) resize.observe(node);
  }
  const tick = () => {
    const sample = state();
    const key = JSON.stringify(sample);
    if (key !== previousFrame) append({ kind: 'frame', state: sample });
    previousFrame = key;
    frame = requestAnimationFrame(tick);
  };
  const stop = reason => {
    if (stopped) return;
    stopped = { at: performance.now(), reason };
    listeners.abort();
    observer.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
  frame = requestAnimationFrame(tick);
  timer = setTimeout(() => stop('deadline'), durationMs);
  window.resultReopenTrace = {
    mark,
    finish: () => {
      stop('test-finished');
      return { start, durationMs, limit, dropped, stopped, marks, timeline };
    },
  };
}
