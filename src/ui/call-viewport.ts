/** Keep the in-flow call panel inside Safari's visual viewport, without overlays.
 * Observe entry separately so ordinary renders never move the user's scroll. */
export function installCallViewport(): void {
  const panels = [document.querySelector<HTMLElement>('#ron-controls')!,document.querySelector<HTMLElement>('#call-controls')!,document.querySelector<HTMLElement>('#kan-controls')!].filter(Boolean);
  const panel=panels[0];
  const main = panel.closest('main')!;
  let pending = false;
  const reveal = () => {
    const panel=panels.find(p=>!p.hidden) ?? panels[0];
    const viewport = window.visualViewport;
    // Safari may shrink only the visual viewport. Reserve enough document tail
    // to let the entire panel scroll above the browser chrome.
    const inset = panel.hidden ? 0 : Math.max(0, window.innerHeight -
      (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0));
    main.style.setProperty('--call-viewport-inset', `${inset}px`);
    if (panel.hidden || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (panel.hidden) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const rect = panel.getBoundingClientRect();
      // Padding includes the home indicator safe area; leave a small touch gap.
      const padding = parseFloat(getComputedStyle(panel.parentElement!).paddingBottom) + 8;
      const delta = rect.bottom + padding > bottom ? rect.bottom + padding - bottom
        : rect.top < top ? rect.top - top : 0;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
    });
  };
  for(const panel of panels) new MutationObserver(reveal).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  window.visualViewport?.addEventListener('resize', reveal);
  window.visualViewport?.addEventListener('scroll', reveal);
  window.addEventListener('resize', reveal);
  reveal();
}
