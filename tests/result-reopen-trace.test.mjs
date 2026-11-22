import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./browser_result_reopen_trace.js', import.meta.url), 'utf8');

function setup() {
  const sinks = [];
  const observers = [];
  class Element {
    constructor(selector) {
      this.selector = selector;
      this.localName = 'button';
      this.isConnected = true;
      this.hidden = false;
      this.disabled = false;
    }
    matches(selectors) { return selectors.split(',').includes(this.selector); }
    querySelectorAll() { return []; }
    addEventListener(...args) { sinks.push(args); }
    getBoundingClientRect() { return { x: 5, y: 10, width: 100, height: 40 }; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.ended = true; }
  }
  const button = new Element('#show-result');
  const panel = new Element('#local-game-controls');
  const window = { addEventListener: (...args) => sinks.push(args), visualViewport: null };
  const document = {
    body: panel, documentElement: new Element('html'), activeElement: button,
    querySelector: selector => [button, panel].find(node => node.matches(selector)),
    elementFromPoint: () => button,
  };
  let time = 0;
  let expire;
  const context = { Element, window, document, AbortController, innerWidth: 1280, innerHeight: 800,
    scrollX: 0, scrollY: 0, performance: { now: () => time++ },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
    MutationObserver: Observer, ResizeObserver: Observer, requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}, setTimeout: callback => { expire = callback; return 2; }, clearTimeout() {},
  };
  vm.runInNewContext(`(${source})()`, context);
  const emit = type => {
    const [, listener, options] = sinks.find(([name, , opts]) => name === type && opts.capture);
    assert.equal(options.passive, true);
    listener({ type, target: button, currentTarget: window, composedPath: () => [button, panel, window],
      clientX: 55, clientY: 30, pointerId: 1, pointerType: 'mouse', button: 0, defaultPrevented: false,
      isTrusted: true, privateTileId: 'sensitive' });
  };
  return { trace: window.resultReopenTrace, emit, sinks, observers, expire };
}

test('records the press/release sequence without inventing a click and strips page data', () => {
  const { trace, emit, sinks, observers } = setup();
  trace.mark('before');
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) emit(type);
  trace.mark('after');
  const result = JSON.parse(JSON.stringify(trace.finish()));
  assert.deepEqual(result.timeline.map(event => event.type), ['pointerdown', 'mousedown', 'pointerup', 'mouseup']);
  assert.equal(result.timeline[0].target.role, 'button');
  assert.equal(result.timeline[0].path[1].role, 'panel');
  assert.equal(result.timeline[0].input.pointerId, 1);
  assert.equal(result.timeline[0].isTrusted, true);
  assert.equal(result.timeline[0].defaultPrevented, false);
  assert(!JSON.stringify(result).includes('sensitive'));
  assert(result.marks[1].at > result.timeline.at(-1).at);
  assert(sinks.every(([, , options]) => options.signal.aborted));
  assert(observers.every(observer => observer.ended));
});

test('caps the event timeline and disconnects when the observation deadline expires', () => {
  const { trace, emit, expire, observers } = setup();
  for (let i = 0; i < 500; i++) emit('pointercancel');
  expire();
  emit('click');
  const result = trace.finish();
  assert.equal(result.timeline.length, 480);
  assert.equal(result.dropped, 20);
  assert.equal(result.durationMs, 10000);
  assert.equal(result.stopped.reason, 'deadline');
  assert(observers.every(observer => observer.ended));
});
