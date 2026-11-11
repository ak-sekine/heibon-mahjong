// Generate a versioned, self-contained offline shell without adding build dependencies.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

export const PWA_BASE = '/heibon-mahjong/';
const CACHE_PREFIX = 'heibon-mahjong-shell-';
export const DEV_PWA_BASE = '/heibon-mahjong/dev/';
// Outside the legacy production prefix: old installed workers cannot delete this cache.
export const DEV_CACHE_PREFIX = 'heibon-mahjong-dev-shell-';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}

function rounded(x, y, left, top, width, height, radius) {
  const cx = Math.max(left + radius, Math.min(x, left + width - radius));
  const cy = Math.max(top + radius, Math.min(y, top + height - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** A compact, generated RGBA Mahjong-tile icon (no runtime dependency or font). */
export function makeIcon(size, maskable = false) {
  if (!Number.isInteger(size) || size < 1 || size > 1024) throw new Error('Unsupported icon size');
  const data = Buffer.alloc((size * 4 + 1) * size);
  const tile = maskable
    ? { left: 0.28, top: 0.27, width: 0.44, height: 0.46, radius: 0.055 }
    : { left: 0.19, top: 0.14, width: 0.62, height: 0.72, radius: 0.075 };
  for (let y = 0; y < size; y += 1) {
    const ny = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const tx = (nx - tile.left) / tile.width;
      const ty = (ny - tile.top) / tile.height;
      let rgb = [24, 86, 64];
      if (rounded(nx, ny, tile.left, tile.top, tile.width, tile.height, tile.radius)) {
        rgb = [245, 241, 221];
        if (ty > 0.92) rgb = [194, 216, 198];
        if (tx > 0.17 && tx < 0.83 && ty > 0.15 && ty < 0.84) {
          const stem = ((tx > 0.25 && tx < 0.34) || (tx > 0.455 && tx < 0.545) || (tx > 0.66 && tx < 0.75)) && ty > 0.38 && ty < 0.76;
          if (stem) rgb = [20, 94, 62];
          const dots = [0.295, 0.5, 0.705];
          if (dots.some(cx => (tx - cx) ** 2 + (ty - 0.32) ** 2 < 0.055 ** 2)) rgb = [180, 53, 46];
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(data, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function filesUnder(folder, prefix = '') {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(absolute, relative) : [relative];
  }).sort();
}

/** Service Worker handles only this site's immutable build assets and its app shell. */
export function serviceWorkerSource(cacheName, urls, environment = 'production') {
  const root = environment === 'development' ? DEV_PWA_BASE : PWA_BASE;
  const prefix = environment === 'development' ? DEV_CACHE_PREFIX : CACHE_PREFIX;
  return [
    "'use strict';",
    'const ROOT = ' + JSON.stringify(root) + ';',
    'const CACHE = ' + JSON.stringify(cacheName) + ';',
    'const PRECACHE = ' + JSON.stringify(urls) + ';',
    'const PATHS = new Set(PRECACHE);',
    'const owns = pathname => pathname.startsWith(ROOT) && ' + (environment === 'development' ? 'true' : '!pathname.startsWith(' + JSON.stringify(DEV_PWA_BASE) + ')') + ';',
    "self.addEventListener('install', event => {",
    "  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))));",
    '});',
    "self.addEventListener('activate', event => {",
    '  event.waitUntil((async () => {',
    '    const keys = await caches.keys();',
    '    await Promise.all(keys.filter(key => key.startsWith(' + JSON.stringify(prefix) + ') && key !== CACHE).map(key => caches.delete(key)));',
    // A root claim would steal active dev clients; first production visit activates on next navigation.
    ...(environment === 'development' ? ['    await self.clients.claim();'] : []),
    '  })());',
    '});',
    "self.addEventListener('message', event => {",
    '  if (!event.source || !owns(new URL(event.source.url).pathname)) return;',
    ...(environment === 'development' ? [
      "  if (event.data?.type === 'CLAIM_DEVELOPMENT_CLIENTS') { event.waitUntil(self.clients.claim()); return; }",
    ] : []),
    "  if (!event.data || event.data.type !== 'ACTIVATE_UPDATE') return;",
    '  event.waitUntil((async () => {',
    "    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });",
    '    const scoped = clients.filter(client => {',
    '      try { const url = new URL(client.url); return url.origin === self.location.origin && owns(url.pathname); }',
    '      catch { return false; }',
    '    });',
    '    if (scoped.length > 1) {',
    "      if (event.source) event.source.postMessage({ type: 'UPDATE_BLOCKED', reason: 'multiple-tabs' });",
    '      return;',
    '    }',
    '    await self.skipWaiting();',
    '  })());',
    '});',
    "self.addEventListener('fetch', event => {",
    '  const request = event.request;',
    "  if (request.method !== 'GET') return;",
    '  const url = new URL(request.url);',
    '  if (url.origin !== self.location.origin || !url.pathname.startsWith(ROOT) || !owns(url.pathname)) return;',
    "  if (request.mode === 'navigate') {",
    "    if (url.pathname !== ROOT && url.pathname !== ROOT + 'index.html') return;",
    '    event.respondWith((async () => {',
    "      try { const response = await fetch(new Request(request, { cache: 'no-store' })); if (response.ok) return response; } catch { /* Offline. */ }",
    '      const cache = await caches.open(CACHE);',
    '      return await cache.match(ROOT) || Response.error();',
    '    })());',
    '    return;',
    '  }',
    '  if (!PATHS.has(url.pathname)) return;',
    '  event.respondWith((async () => {',
    '    const cache = await caches.open(CACHE);',
    '    return await cache.match(url.pathname) || fetch(request);',
    '  })());',
    '});',
    '',
  ].join('\n');
}

export function buildPwa(distDir, environment = 'production') {
  if (!['production', 'development'].includes(environment)) throw new Error('Unknown PWA environment');
  const root = environment === 'development' ? DEV_PWA_BASE : PWA_BASE;
  const prefix = environment === 'development' ? DEV_CACHE_PREFIX : CACHE_PREFIX;
  for (const name of ['index.html', 'manifest.webmanifest']) {
    if (!existsSync(path.join(distDir, name))) throw new Error('Missing build asset: ' + name);
  }
  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest, { id: root, start_url: root, scope: root });
  if (environment === 'development') Object.assign(manifest, { name: 'Heibon Mahjong DEV', short_name: 'Heibon DEV' });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const assets = filesUnder(path.join(distDir, 'assets'))
    .filter(name => /\.(?:js|css|svg|png|webp|woff2?)$/i.test(name))
    .map(name => 'assets/' + name);
  if (!assets.some(name => name.endsWith('.js')) || !assets.some(name => name.endsWith('.css'))) {
    throw new Error('Missing required JS/CSS build assets');
  }

  const iconDir = path.join(distDir, 'icons');
  mkdirSync(iconDir, { recursive: true });
  for (const [name, size, maskable] of [
    ['icon-180.png', 180, false],
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
  ]) {
    const iconPath = path.join(iconDir, name);
    // Vite copies public/ into dist/ before this script runs. Keep those
    // supplied assets intact; generate a fallback only for a missing icon.
    if (!existsSync(iconPath)) writeFileSync(iconPath, makeIcon(size, maskable));
  }

  const iconPaths = ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(name => 'icons/' + name);
  const paths = ['index.html', 'manifest.webmanifest', ...iconPaths, ...assets];
  const digest = createHash('sha256');
  for (const name of paths) {
    digest.update(name);
    digest.update(readFileSync(path.join(distDir, name)));
  }
  const cacheName = prefix + digest.digest('hex').slice(0, 20);
  const urls = [root, ...paths.map(name => root + name)];
  writeFileSync(path.join(distDir, 'sw.js'), serviceWorkerSource(cacheName, urls, environment), 'utf8');
  return { cacheName, urls };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const environment = process.argv[2] ?? 'production';
  const result = buildPwa(path.resolve(environment === 'development' ? 'dist-dev' : 'dist'), environment);
  process.stdout.write('PWA shell: ' + result.cacheName + ', precached URLs: ' + result.urls.length + '\n');
}
