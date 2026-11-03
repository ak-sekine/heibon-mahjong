import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPwa, makeIcon, PWA_BASE, serviceWorkerSource } from '../scripts/build-pwa.mjs';

test('manifest is scoped to GitHub Pages and has all Android icon purposes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.id, PWA_BASE);
  assert.equal(manifest.start_url, PWA_BASE);
  assert.equal(manifest.scope, PWA_BASE);
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(new Set(manifest.icons.map(icon => icon.purpose)), new Set(['any', 'maskable']));
  assert.deepEqual(manifest.icons.map(({ src, sizes, purpose }) => [src, sizes, purpose]), [
    ['icons/icon-192.png', '192x192', 'any'],
    ['icons/icon-512.png', '512x512', 'any'],
    ['icons/icon-maskable-512.png', '512x512', 'maskable'],
  ]);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/heibon-mahjong\/icons\/icon-180\.png"/);
});

test('provided PWA icon PNGs have the requested dimensions', () => {
  for (const [name, size] of [
    ['icon-180.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ]) {
    const icon = readFileSync(new URL(`../public/icons/${name}`, import.meta.url));
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} PNG signature`);
    assert.equal(icon.readUInt32BE(16), size, `${name} width`);
    assert.equal(icon.readUInt32BE(20), size, `${name} height`);
  }
});

test('generated icons are valid RGBA PNGs with correct dimensions', () => {
  for (const size of [180, 192, 512]) {
    const icon = makeIcon(size);
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
    assert.equal(icon[25], 6);
  }
  assert.notDeepEqual(makeIcon(512, true), makeIcon(512, false));
});

test('offline shell uses a content-versioned cache and never caches Worker traffic', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'heibon-pwa-'));
  try {
    mkdirSync(path.join(tmp, 'assets'));
    writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(path.join(tmp, 'manifest.webmanifest'), readFileSync(new URL('../public/manifest.webmanifest', import.meta.url)));
    writeFileSync(path.join(tmp, 'assets', 'app-abc.js'), 'console.log(1)');
    writeFileSync(path.join(tmp, 'assets', 'app-def.css'), 'body{}');

    const first = buildPwa(tmp);
    const worker = readFileSync(path.join(tmp, 'sw.js'), 'utf8');
    assert(first.urls.includes(PWA_BASE));
    assert(first.urls.includes(PWA_BASE + 'assets/app-abc.js'));
    assert(first.urls.includes(PWA_BASE + 'icons/icon-192.png'));
    assert.match(worker, /request\.mode === 'navigate'/);
    assert.match(worker, /new Request\(url, \{ cache: 'reload' \}\)/);
    assert.match(worker, /new Request\(request, \{ cache: 'no-store' \}\)/);
    assert.match(worker, /await fetch\(new Request\(request, \{ cache: 'no-store' \}\)\)/);
    assert.match(worker, /url\.origin !== self\.location\.origin/);
    assert.match(worker, /ACTIVATE_UPDATE/);
    assert.match(worker, /scoped\.length > 1/);
    assert(!worker.includes('workers.dev'));
    assert(!worker.includes('api/rooms'));
    assert.match(worker, /await self\.skipWaiting\(\)/); // Only inside the message handler.

    const second = buildPwa(tmp);
    assert.equal(first.cacheName, second.cacheName, 'identical build assets must retain the cache key');
    writeFileSync(path.join(tmp, 'assets', 'app-abc.js'), 'console.log(2)');
    const third = buildPwa(tmp);
    assert.notEqual(first.cacheName, third.cacheName, 'a new bundle must yield a new cache key');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('PWA build preserves the supplied icons and precaches each icon URL', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'heibon-pwa-icons-'));
  const iconNames = ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
  try {
    mkdirSync(path.join(tmp, 'assets'));
    mkdirSync(path.join(tmp, 'icons'));
    writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(path.join(tmp, 'manifest.webmanifest'), readFileSync(new URL('../public/manifest.webmanifest', import.meta.url)));
    writeFileSync(path.join(tmp, 'assets', 'app-abc.js'), 'console.log(1)');
    writeFileSync(path.join(tmp, 'assets', 'app-def.css'), 'body{}');
    for (const name of iconNames) {
      writeFileSync(
        path.join(tmp, 'icons', name),
        readFileSync(new URL(`../public/icons/${name}`, import.meta.url)),
      );
    }

    const result = buildPwa(tmp);
    const worker = readFileSync(path.join(tmp, 'sw.js'), 'utf8');
    for (const name of iconNames) {
      const url = PWA_BASE + 'icons/' + name;
      assert(result.urls.includes(url), `${url} is in the precache URL list`);
      assert(worker.includes(JSON.stringify(url)), `${url} is embedded in the Service Worker`);
      assert.deepEqual(
        readFileSync(path.join(tmp, 'icons', name)),
        readFileSync(new URL(`../public/icons/${name}`, import.meta.url)),
        `${name} is preserved byte for byte`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('generated Service Worker ignores unrelated requests', () => {
  const source = serviceWorkerSource('test-cache', [PWA_BASE]);
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /url\.pathname\.startsWith\(ROOT\)/);
  assert.match(source, /if \(!PATHS\.has\(url\.pathname\)\) return/);
  assert.match(source, /return await cache\.match\(ROOT\) \|\| Response\.error\(\)/);
});
