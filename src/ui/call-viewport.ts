import { diagnosticLog } from '../online/diagnostics.ts';

const SCROLL_LOG_QUIET_MS = 350;
const SCROLL_LOG_MIN_INTERVAL_MS = 750;
const MANUAL_SCROLL_GRACE_MS = 1000;

/** Keep action panels in normal flow and leave page position under user control. */
export function installCallViewport(): void {
  const panels = ['#ron-controls','#call-controls','#kan-controls','#online-ron-controls','#online-call-controls','#online-kan-controls']
    .map(selector => document.querySelector<HTMLElement>(selector))
    .filter((panel): panel is HTMLElement => panel !== null);
  const main = panels[0]?.closest('main');
  if (!main) return;

  const visiblePanels = new WeakSet<HTMLElement>();
  const heightByPanel = new WeakMap<HTMLElement, number>();
  const viewportChangeLogged = new WeakSet<HTMLElement>();
  let manualScrollUntil = 0;
  let touchStart: { x: number; y: number } | null = null;
  let pointerStart: { x: number; y: number } | null = null;
  let scrollTimer = 0;
  let lastScrollLogAt = 0;
  let pendingScrollSource: 'user' | 'programmatic_or_layout' = 'programmatic_or_layout';

  const panelType = (panel: HTMLElement): string => panel.id.includes('ron') ? 'ron' : panel.id.includes('kan') ? 'kan' : 'call';
  const viewportInset = (): number => {
    const viewport = window.visualViewport;
    return Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0));
  };
  const updateInset = (): void => {
    const visible = panels.some(panel => !panel.hidden && panel.getClientRects().length > 0);
    const next = visible ? viewportInset() : 0;
    const current = Number.parseFloat(main.style.getPropertyValue('--call-viewport-inset')) || 0;
    if (Math.abs(current - next) >= 1) main.style.setProperty('--call-viewport-inset', `${next}px`);
  };
  const recordPanelHeight = (panel: HTMLElement): void => {
    const height = panel.getBoundingClientRect().height;
    const previous = heightByPanel.get(panel);
    heightByPanel.set(panel, height);
    if (previous === undefined || Math.abs(previous - height) < 1) return;
    const candidateCount = panel.querySelectorAll('[data-action-choice]').length;
    diagnosticLog.record('INFO', 'call_viewport_panel_height_changed', {
      panelType: panelType(panel), previousHeight: Math.round(previous), panelHeight: Math.round(height), candidateCount,
    });
  };
  const inspectPanels = (recalculateInset = true): void => {
    if (recalculateInset) updateInset();
    for (const panel of panels) {
      const visible = !panel.hidden && panel.getClientRects().length > 0;
      if (!visible) {
        visiblePanels.delete(panel);
        viewportChangeLogged.delete(panel);
        heightByPanel.delete(panel);
      } else {
        recordPanelHeight(panel);
        if (!visiblePanels.has(panel)) {
          visiblePanels.add(panel);
          const viewport = window.visualViewport;
          diagnosticLog.record('INFO', 'call_viewport_panel_displayed', {
            panelType: panelType(panel), source: 'initial_display_no_page_scroll',
            panelHeight: Math.round(panel.getBoundingClientRect().height),
            candidateCount: panel.querySelectorAll('[data-action-choice]').length,
            scrollY: Math.round(window.scrollY),
            visualViewportHeight: Math.round(viewport?.height ?? window.innerHeight),
            offsetTop: Math.round(viewport?.offsetTop ?? 0),
          });
        }
      }
    }
  };
  const recordViewportChange = (): void => {
    const active = panels.find(panel => !panel.hidden && panel.getClientRects().length > 0);
    if (active && !viewportChangeLogged.has(active)) {
      viewportChangeLogged.add(active);
      const viewport = window.visualViewport;
      diagnosticLog.record('INFO', 'call_viewport_adjustment_skipped', {
        panelType: panelType(active), reason: 'viewport_change_does_not_reposition',
        scrollY: Math.round(window.scrollY),
        visualViewportHeight: Math.round(viewport?.height ?? window.innerHeight),
        offsetTop: Math.round(viewport?.offsetTop ?? 0),
      });
    }
  };
  const markManualScroll = (): void => { manualScrollUntil = Date.now() + MANUAL_SCROLL_GRACE_MS; };
  const finishScrollLog = (): void => {
    const now = Date.now();
    if (now - lastScrollLogAt < SCROLL_LOG_MIN_INTERVAL_MS) {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(finishScrollLog, SCROLL_LOG_MIN_INTERVAL_MS - (now - lastScrollLogAt));
      return;
    }
    lastScrollLogAt = now;
    const active = panels.find(panel => !panel.hidden && panel.getClientRects().length > 0);
    diagnosticLog.record('INFO', pendingScrollSource === 'user' ? 'call_viewport_user_scroll' : 'call_viewport_unattributed_scroll', {
      source: pendingScrollSource,
      scrollY: Math.round(window.scrollY),
      panelType: active ? panelType(active) : 'none',
      panelHeight: active ? Math.round(active.getBoundingClientRect().height) : 0,
    });
  };

  for (const panel of panels) new MutationObserver(() => inspectPanels()).observe(panel, {
    attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true,
  });
  window.visualViewport?.addEventListener('resize', () => { inspectPanels(); recordViewportChange(); });
  window.visualViewport?.addEventListener('scroll', () => { inspectPanels(false); recordViewportChange(); });
  window.addEventListener('resize', () => { inspectPanels(); recordViewportChange(); });
  window.addEventListener('scroll', () => {
    pendingScrollSource = Date.now() < manualScrollUntil ? 'user' : 'programmatic_or_layout';
    if (pendingScrollSource === 'user') markManualScroll();
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(finishScrollLog, SCROLL_LOG_QUIET_MS);
  }, { passive: true });
  window.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    const touch = event.touches[0];
    if (touch && touchStart && (Math.abs(touch.clientX - touchStart.x) > 4 || Math.abs(touch.clientY - touchStart.y) > 4)) markManualScroll();
  }, { passive: true });
  const finishTouch = (): void => {
    if (touchStart && Date.now() < manualScrollUntil) markManualScroll();
    touchStart = null;
  };
  window.addEventListener('touchend', finishTouch, { passive: true });
  window.addEventListener('touchcancel', finishTouch, { passive: true });
  window.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; }, { passive: true });
  window.addEventListener('pointermove', event => {
    if (pointerStart && (Math.abs(event.clientX - pointerStart.x) > 4 || Math.abs(event.clientY - pointerStart.y) > 4)) markManualScroll();
  }, { passive: true });
  const finishPointer = (): void => {
    if (pointerStart && Date.now() < manualScrollUntil) markManualScroll();
    pointerStart = null;
  };
  window.addEventListener('pointerup', finishPointer, { passive: true });
  window.addEventListener('pointercancel', finishPointer, { passive: true });
  window.addEventListener('wheel', markManualScroll, { passive: true });
  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) markManualScroll();
  });
  inspectPanels();
}
