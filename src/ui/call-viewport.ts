import { diagnosticLog } from '../online/diagnostics.ts';

const RECENT_MANUAL_SCROLL_MS = 750;

/** Keep the in-flow action panels reachable without fighting the user's scroll. */
export function installCallViewport(): void {
  const panels = ['#ron-controls','#call-controls','#kan-controls','#online-ron-controls','#online-call-controls','#online-kan-controls']
    .map(selector => document.querySelector<HTMLElement>(selector))
    .filter((panel): panel is HTMLElement => panel !== null);
  const main = panels[0]?.closest('main');
  if (!main) return;

  let pendingPanel: HTMLElement | null = null;
  let correctionPending = false;
  let touchStart: { x: number; y: number } | null = null;
  let pointerStart: { x: number; y: number } | null = null;
  let manualScrollUntil = 0;
  const visiblePanels = new WeakSet<HTMLElement>();
  const viewportSuppressionLogged = new WeakSet<HTMLElement>();

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
  const onViewportChange = (recalculateInset = true): void => {
    if (recalculateInset) updateInset();
    const active = panels.find(panel => !panel.hidden && panel.getClientRects().length > 0);
    if (active && !viewportSuppressionLogged.has(active)) {
      viewportSuppressionLogged.add(active);
      diagnosticLog.record('INFO', 'call_viewport_correction_suppressed', {
        panelType: active.id.includes('ron') ? 'ron' : active.id.includes('kan') ? 'kan' : 'call',
        reason: 'viewport_event_does_not_reposition',
      });
    }
  };
  const recordSuppressed = (panel: HTMLElement, reason: string): void => {
    diagnosticLog.record('INFO', 'call_viewport_correction_suppressed', {
      panelType: panel.id.includes('ron') ? 'ron' : panel.id.includes('kan') ? 'kan' : 'call',
      reason,
    });
  };
  const correctInitialPosition = (panel: HTMLElement): void => {
    if (correctionPending) return;
    correctionPending = true;
    pendingPanel = panel;
    requestAnimationFrame(() => {
      correctionPending = false;
      const active = pendingPanel;
      pendingPanel = null;
      if (!active || active.hidden || active.getClientRects().length === 0) return;
      const now = Date.now();
      if (touchStart) {
        recordSuppressed(active, 'manual_scroll_active');
        return;
      }
      if (now < manualScrollUntil) {
        recordSuppressed(active, 'recent_manual_scroll');
        return;
      }

      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const rect = active.getBoundingClientRect();
      const parent = active.parentElement;
      const padding = (parent ? Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0) + 8;
      const delta = rect.bottom + padding > bottom ? rect.bottom + padding - bottom
        : rect.top < top ? rect.top - top : 0;
      if (Math.abs(delta) <= 1) {
        recordSuppressed(active, 'already_in_viewport');
        return;
      }

      diagnosticLog.record('INFO', 'call_viewport_correction_applied', {
        panelType: active.id.includes('ron') ? 'ron' : active.id.includes('kan') ? 'kan' : 'call',
        reason: 'initial_display_outside_viewport',
        delta: Math.round(delta),
      });
      window.scrollBy({ top: delta, behavior: 'instant' });
    });
  };
  const inspectPanels = (): void => {
    updateInset();
    const active = panels.find(panel => !panel.hidden && panel.getClientRects().length > 0);
    for (const panel of panels) {
      const visible = !panel.hidden && panel.getClientRects().length > 0;
      if (!visible) {
        visiblePanels.delete(panel);
        viewportSuppressionLogged.delete(panel);
      }
      else if (!visiblePanels.has(panel)) {
        visiblePanels.add(panel);
        diagnosticLog.record('INFO', 'call_viewport_panel_displayed', {
          panelType: panel.id.includes('ron') ? 'ron' : panel.id.includes('kan') ? 'kan' : 'call',
        });
        if (panel === active) correctInitialPosition(panel);
      }
    }
  };
  const markManualScroll = (): void => { manualScrollUntil = Date.now() + RECENT_MANUAL_SCROLL_MS; };

  for (const panel of panels) new MutationObserver(inspectPanels).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  window.visualViewport?.addEventListener('resize', () => onViewportChange(true));
  window.visualViewport?.addEventListener('scroll', () => onViewportChange(false));
  window.addEventListener('resize', () => onViewportChange(true));
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
