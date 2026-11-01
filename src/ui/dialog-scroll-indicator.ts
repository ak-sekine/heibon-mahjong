/** Keeps the small, always-visible scroll thumb in sync on browsers that hide native scrollbars. */
export function mountDialogScrollIndicators(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.dialog-scroll-panel').forEach(panel => {
    const content = panel.querySelector<HTMLElement>('.dialog-scroll-content');
    const track = panel.querySelector<HTMLElement>('.dialog-scroll-indicator');
    const thumb = track?.querySelector<HTMLElement>('span');
    if (!content || !track || !thumb) return;

    const update = (): void => {
      const scrollRange = content.scrollHeight - content.clientHeight;
      if (scrollRange <= 1) {
        track.hidden = true;
        thumb.style.removeProperty('height');
        thumb.style.removeProperty('transform');
        return;
      }

      // A hidden track reports zero height. Reveal it before measuring so a
      // dialog opened after initialization can still get its first thumb.
      track.hidden = false;
      const trackHeight = track.clientHeight;
      if (trackHeight <= 0) {
        track.hidden = true;
        return;
      }

      const thumbHeight = Math.min(trackHeight, Math.max(20, trackHeight * content.clientHeight / content.scrollHeight));
      const thumbTravel = trackHeight - thumbHeight;
      const thumbTop = thumbTravel * Math.min(1, Math.max(0, content.scrollTop / scrollRange));
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${thumbTop}px)`;
    };

    content.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(panel);
      resizeObserver.observe(content);
      resizeObserver.observe(track);
      content.querySelectorAll<HTMLElement>(':scope > *').forEach(child => resizeObserver.observe(child));
      const mutationObserver = new MutationObserver(() => {
        content.querySelectorAll<HTMLElement>(':scope > *').forEach(child => resizeObserver.observe(child));
        update();
      });
      mutationObserver.observe(content, { childList: true, subtree: true, characterData: true, attributes: true });
    }

    update();
  });
}
