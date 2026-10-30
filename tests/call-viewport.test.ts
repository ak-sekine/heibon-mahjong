import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installCallViewport } from '../src/ui/call-viewport.ts';
import { diagnosticLog } from '../src/online/diagnostics.ts';

type MockPanel = HTMLElement & {
  id: string;
  hidden: boolean;
  parentElement: HTMLElement;
  rect: { top: number; bottom: number; left: number; right: number };
};

function viewportFixture() {
  const values = new Map<string, string>();
  const main = { style: {
    getPropertyValue: (key: string) => values.get(key) ?? '',
    setProperty: (key: string, value: string) => values.set(key, value),
  } } as unknown as HTMLElement;
  const panelNames = ['ron-controls','call-controls','kan-controls','online-ron-controls','online-call-controls','online-kan-controls'];
  const panels = new Map<string, MockPanel>();
  for (const id of panelNames) panels.set(`#${id}`, {
    id,
    hidden: true,
    parentElement: { style: { paddingBottom: '12px' } } as unknown as HTMLElement,
    rect: { top: 200, bottom: 400, left: 0, right: 300 },
    closest: () => main,
    getClientRects: () => ({ length: 1 }) as unknown as DOMRectList,
    getBoundingClientRect() { return { ...this.rect, width: 300, height: this.rect.bottom - this.rect.top } as DOMRect; },
  } as unknown as MockPanel);
  const observers: Array<{ target: MockPanel | null; trigger: () => void }> = [];
  class MockMutationObserver {
    private target: MockPanel | null = null;
    private readonly callback: MutationCallback;
    constructor(callback: MutationCallback) { this.callback = callback; }
    observe(target: Node): void { this.target = target as MockPanel; }
    disconnect(): void {}
    trigger(): void { this.callback([], this as unknown as MutationObserver); }
    get observedTarget(): MockPanel | null { return this.target; }
  }
  const frames: FrameRequestCallback[] = [];
  const scrollCalls: number[] = [];
  const visualViewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  const mockWindow = Object.assign(new EventTarget(), {
    innerHeight: 844,
    visualViewport,
    scrollY: 0,
    scrollBy: ({ top }: ScrollToOptions) => {
      const amount = Number(top ?? 0);
      scrollCalls.push(amount);
      for (const panel of panels.values()) panel.rect = { ...panel.rect, top: panel.rect.top - amount, bottom: panel.rect.bottom - amount };
    },
  });
  const original = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    MutationObserver: Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver'),
    requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame'),
    getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle'),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: (selector: string) => panels.get(selector) ?? null } });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: class extends MockMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      const thisObserver = this;
      observers.push({ get target() { return thisObserver.observedTarget; }, trigger: () => thisObserver.trigger() });
    }
  } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; } });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: (element: HTMLElement) => element.style });
  return {
    panels, observers, frames, scrollCalls, values, visualViewport, mockWindow,
    observerFor(panel: MockPanel) { return observers.find(observer => observer.target === panel)!; },
    restore() {
      for (const key of Object.keys(original) as (keyof typeof original)[]) {
        const descriptor = original[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function dispatchTouch(target: EventTarget, type: string, touches: Array<{ clientX: number; clientY: number }>): void {
  const event = new Event(type);
  Object.defineProperty(event, 'touches', { value: touches });
  target.dispatchEvent(event);
}

test('call viewport performs one initial correction and viewport events only recalculate the inset', () => {
  const fixture = viewportFixture();
  diagnosticLog.clear();
  try {
    installCallViewport();
    const panel = fixture.panels.get('#call-controls')!;
    panel.hidden = false;
    panel.rect = { top: 700, bottom: 920, left: 0, right: 300 };
    fixture.observerFor(panel).trigger();
    assert.equal(fixture.frames.length, 1);
    fixture.frames.shift()!(0);
    assert.equal(fixture.scrollCalls.length, 1);
    assert.ok(fixture.scrollCalls[0]! > 0);
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_correction_applied' && entry.details.reason === 'initial_display_outside_viewport'));

    fixture.visualViewport.height = 500;
    fixture.visualViewport.offsetTop = 20;
    fixture.visualViewport.dispatchEvent(new Event('scroll'));
    assert.equal(fixture.values.has('--call-viewport-inset'), false);
    fixture.visualViewport.dispatchEvent(new Event('resize'));
    fixture.mockWindow.dispatchEvent(new Event('resize'));
    assert.equal(fixture.scrollCalls.length, 1);
    assert.equal(fixture.values.get('--call-viewport-inset'), '324px');
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_correction_suppressed' && entry.details.reason === 'viewport_event_does_not_reposition'));
  } finally { fixture.restore(); diagnosticLog.clear(); }
});

test('manual touch movement suppresses call correction during and after movement; ron and kan remain in flow', () => {
  const fixture = viewportFixture();
  diagnosticLog.clear();
  try {
    installCallViewport();
    const call = fixture.panels.get('#call-controls')!;
    dispatchTouch(fixture.mockWindow, 'touchstart', [{ clientX: 10, clientY: 200 }]);
    call.hidden = false;
    call.rect = { top: 700, bottom: 920, left: 0, right: 300 };
    fixture.observerFor(call).trigger();
    dispatchTouch(fixture.mockWindow, 'touchmove', [{ clientX: 10, clientY: 130 }]);
    fixture.frames.shift()!(0);
    assert.equal(fixture.scrollCalls.length, 0);
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_correction_suppressed' && entry.details.reason === 'manual_scroll_active'));

    dispatchTouch(fixture.mockWindow, 'touchend', []);
    call.hidden = true;
    fixture.observerFor(call).trigger();
    call.hidden = false;
    fixture.observerFor(call).trigger();
    fixture.frames.shift()!(0);
    assert.equal(fixture.scrollCalls.length, 0);
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_correction_suppressed' && entry.details.reason === 'recent_manual_scroll'));

    call.hidden = true;
    fixture.observerFor(call).trigger();
    for (const selector of ['#ron-controls', '#kan-controls']) {
      const panel = fixture.panels.get(selector)!;
      panel.hidden = false;
      panel.rect = { top: 200, bottom: 400, left: 0, right: 300 };
      fixture.observerFor(panel).trigger();
      fixture.frames.shift()!(0);
      panel.hidden = true;
      fixture.observerFor(panel).trigger();
    }
    fixture.visualViewport.dispatchEvent(new Event('resize'));
    fixture.visualViewport.dispatchEvent(new Event('scroll'));
    assert.equal(fixture.scrollCalls.length, 0);
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_panel_displayed' && entry.details.panelType === 'ron'));
    assert.ok(diagnosticLog.all().some(entry => entry.event === 'call_viewport_panel_displayed' && entry.details.panelType === 'kan'));
  } finally { fixture.restore(); diagnosticLog.clear(); }
});
