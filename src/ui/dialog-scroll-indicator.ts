/** Synchronizes the visible scroll thumb and supports mouse dragging on its track. */
export function mountDialogScrollIndicators(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.dialog-scroll-panel').forEach(panel => {
    const content = panel.querySelector<HTMLElement>('.dialog-scroll-content');
    const track = panel.querySelector<HTMLElement>('.dialog-scroll-indicator');
    const thumb = track?.querySelector<HTMLElement>('span');
    if (!content || !track || !thumb) return;

    // The content remains the accessible, native scrolling region. Keep the
    // decorative mouse shortcut out of the tab order and preserve touch panning.
    content.tabIndex = 0;
    let drag: { pointerId: number; grabOffset: number } | undefined;

    const endDrag = (): void => {
      if (!drag) return;
      const { pointerId } = drag;
      drag = undefined;
      if (track.hasPointerCapture(pointerId)) track.releasePointerCapture(pointerId);
    };

    const update = (): void => {
      const scrollRange = content.scrollHeight - content.clientHeight;
      if (scrollRange <= 1) {
        endDrag();
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

    const scrollToPointer = (clientY: number, grabOffset: number): void => {
      const travel = track.clientHeight - thumb.getBoundingClientRect().height;
      if (travel <= 0) return;
      const top = clientY - track.getBoundingClientRect().top - grabOffset;
      const ratio = Math.min(1, Math.max(0, top / travel));
      content.scrollTop = ratio * (content.scrollHeight - content.clientHeight);
      update();
    };

    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || drag) return;
      update();
      if (track.hidden) return;
      const thumbRect = thumb.getBoundingClientRect();
      const grabOffset = event.target === thumb ? event.clientY - thumbRect.top : thumbRect.height / 2;
      track.setPointerCapture(event.pointerId);
      drag = { pointerId: event.pointerId, grabOffset };
      event.preventDefault();
      content.focus({ preventScroll: true });
      scrollToPointer(event.clientY, grabOffset);
    });
    track.addEventListener('pointermove', event => {
      if (drag?.pointerId !== event.pointerId) return;
      scrollToPointer(event.clientY, drag.grabOffset);
    });
    const finishPointer = (event: PointerEvent): void => {
      if (drag?.pointerId === event.pointerId) endDrag();
    };
    track.addEventListener('pointerup', finishPointer);
    track.addEventListener('pointercancel', finishPointer);
    track.addEventListener('lostpointercapture', finishPointer);
    window.addEventListener('blur', endDrag);

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
