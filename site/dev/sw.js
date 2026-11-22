'use strict';
const ROOT = "/heibon-mahjong/dev/";
const CACHE = "heibon-mahjong-dev-shell-a3c71004d62d2721b6df";
const PRECACHE = ["/heibon-mahjong/dev/","/heibon-mahjong/dev/index.html","/heibon-mahjong/dev/manifest.webmanifest","/heibon-mahjong/dev/icons/icon-180.png","/heibon-mahjong/dev/icons/icon-192.png","/heibon-mahjong/dev/icons/icon-512.png","/heibon-mahjong/dev/icons/icon-maskable-512.png","/heibon-mahjong/dev/assets/main-C98vpl_r.css","/heibon-mahjong/dev/assets/main-KzSyn2nQ.js","/heibon-mahjong/dev/assets/page-CWqWbNCs.js","/heibon-mahjong/dev/assets/style-BWCBAXPO.js","/heibon-mahjong/dev/assets/style-DOorKaLM.css","/heibon-mahjong/dev/assets/test-C_hoNXGq.js"];
const PATHS = new Set(PRECACHE);
const owns = pathname => pathname.startsWith(ROOT) && true;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("heibon-mahjong-dev-shell-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (!event.source || !owns(new URL(event.source.url).pathname)) return;
  if (event.data?.type === 'CLAIM_DEVELOPMENT_CLIENTS') { event.waitUntil(self.clients.claim()); return; }
  if (!event.data || event.data.type !== 'ACTIVATE_UPDATE') return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const scoped = clients.filter(client => {
      try { const url = new URL(client.url); return url.origin === self.location.origin && owns(url.pathname); }
      catch { return false; }
    });
    if (scoped.length > 1) {
      if (event.source) event.source.postMessage({ type: 'UPDATE_BLOCKED', reason: 'multiple-tabs' });
      return;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(ROOT) || !owns(url.pathname)) return;
  if (request.mode === 'navigate') {
    if (url.pathname !== ROOT && url.pathname !== ROOT + 'index.html') return;
    event.respondWith((async () => {
      try { const response = await fetch(new Request(request, { cache: 'no-store' })); if (response.ok) return response; } catch { /* Offline. */ }
      const cache = await caches.open(CACHE);
      return await cache.match(ROOT) || Response.error();
    })());
    return;
  }
  if (!PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.pathname) || fetch(request);
  })());
});
