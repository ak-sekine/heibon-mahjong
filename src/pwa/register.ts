/**
 * PWA registration is kept outside game state and runs only for the real production
 * application, not the test/kan pages or local development server.
 */
export function registerPwa(): void {
  // itch.io hosts the game below a CDN subpath inside an iframe. PWA scope and
  // Service Worker update handling belong only to the GitHub Pages build.
  if (import.meta.env.MODE === 'itch') return;
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const root = import.meta.env.BASE_URL;
  if (location.pathname !== root && location.pathname !== root + 'index.html') return;

  let reloadRequested = false;
  let notice: HTMLElement | null = null;
  let noticeText: HTMLParagraphElement | null = null;

  const showUpdate = (registration: ServiceWorkerRegistration): void => {
    if (!navigator.serviceWorker.controller || !registration.waiting) return;
    if (!notice) {
      notice = document.createElement('section');
      notice.id = 'pwa-update-notice';
      notice.className = 'pwa-update-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      noticeText = document.createElement('p');
      noticeText.id = 'pwa-update-status';
      noticeText.textContent = '新しいバージョンがあります。対局の区切りで更新してください。';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ui-button ui-button--a';
      button.textContent = '更新あり';
      button.setAttribute('aria-describedby', 'pwa-update-status');
      button.addEventListener('click', () => {
        const waiting = registration.waiting;
        if (!waiting) return;
        if (!window.confirm('更新すると現在の画面が再読み込みされ、進行中の対局は終了します。更新しますか？')) return;
        reloadRequested = true;
        waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      });
      notice.append(noticeText, button);
      document.querySelector('.app-header .main-menu-shell')?.before(notice);
    }
  };

  void navigator.serviceWorker.register(root + 'sw.js', {
    scope: root,
    updateViaCache: 'none',
  }).then(registration => {
    const checkUpdate = (): void => {
      if (registration.waiting) showUpdate(registration);
    };
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', checkUpdate);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadRequested) window.location.reload();
    });
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type !== 'UPDATE_BLOCKED') return;
      reloadRequested = false;
      const message = '別のタブでも開かれています。ほかのタブを閉じてから更新してください。';
      if (noticeText) noticeText.textContent = message;
      window.alert(message);
    });
    const requestUpdate = (): void => { void registration.update().catch(() => { /* Offline. */ }); };
    window.addEventListener('online', requestUpdate);
    window.addEventListener('pageshow', requestUpdate);
    checkUpdate();
  }).catch(error => {
    console.warn('PWA registration failed; the browser version remains available.', error);
  });
}

registerPwa();
