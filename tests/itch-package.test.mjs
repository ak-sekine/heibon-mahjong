import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import test from 'node:test';
import { makeItchZip, validateItchLimits } from '../scripts/package-itch.mjs';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'heibon-itch-'));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  mkdirSync(path.join(dist, 'icons'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>');
  writeFileSync(path.join(dist, 'assets/app.css'), 'body{background:url("./tile.svg")}');
  writeFileSync(path.join(dist, 'assets/app.js'), 'new URL("./tile.svg", import.meta.url);');
  writeFileSync(path.join(dist, 'assets/tile.svg'), '<svg/>');
  writeFileSync(path.join(dist, 'manifest.webmanifest'), '{}');
  writeFileSync(path.join(dist, 'sw.js'), 'self;');
  writeFileSync(path.join(dist, 'icons/icon-192.png'), 'pwa-only');
  writeFileSync(path.join(dist, 'test.html'), 'development-only');
  return { root, dist };
}

function zipEntries(zip) {
  const entries = new Map();
  const endOfCentralDirectory = zip.length - 22;
  let offset = zip.readUInt32LE(endOfCentralDirectory + 16);
  while (zip.readUInt32LE(offset) === 0x02014b50) {
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    const content = inflateRawSync(zip.subarray(contentOffset, contentOffset + compressedSize));
    assert.equal(content.length, uncompressedSize);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test('itch ZIP is deterministic, has a root entry point, and excludes development/PWA files', () => {
  const { root, dist } = fixture();
  try {
    const output = path.join(root, 'game.zip');
    const first = makeItchZip(dist, output);
    const firstZip = readFileSync(output);
    const second = makeItchZip(dist, output);
    const secondZip = readFileSync(output);
    assert.deepEqual(firstZip, secondZip);
    assert.equal(first.files, 4);
    assert.equal(second.zipBytes, firstZip.length);
    const entries = zipEntries(firstZip);
    assert.deepEqual([...entries.keys()], ['assets/app.css', 'assets/app.js', 'assets/tile.svg', 'index.html']);
    assert(entries.has('index.html'), 'index.html is at the archive root');
    assert(!entries.has('test.html'));
    assert(!entries.has('manifest.webmanifest'));
    assert(!entries.has('sw.js'));
    assert(![...entries.keys()].some(name => name.startsWith('icons/')));
    const html = entries.get('index.html').toString('utf8');
    assert(!html.includes('manifest.webmanifest'));
    assert(html.includes('./assets/app.js'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('itch ZIP validation rejects absolute paths, missing files and case mismatches', () => {
  const { root, dist } = fixture();
  try {
    const output = path.join(root, 'game.zip');
    writeFileSync(path.join(dist, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
    assert.throws(() => makeItchZip(dist, output), /Absolute internal asset path/);
    writeFileSync(path.join(dist, 'index.html'), '<script type="module" src="./assets/App.js"></script>');
    assert.throws(() => makeItchZip(dist, output), /Missing or case-mismatched/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('itch ZIP validation enforces official file count, path, expanded size and single-file limits', () => {
  const file = (name, length) => ({ name, bytes: { length } });
  assert.equal(validateItchLimits([file('index.html', 1)]), 1);
  assert.throws(() => validateItchLimits(Array.from({ length: 1001 }, (_, index) => file(`assets/${index}.js`, 0))), /limit is 1000/);
  assert.throws(() => validateItchLimits([file('a'.repeat(241), 0)]), /240 characters/);
  assert.throws(() => validateItchLimits([file('large.bin', 200 * 1024 * 1024 + 1)]), /file exceeds/);
  assert.throws(() => validateItchLimits([
    file('a.bin', 190 * 1024 * 1024),
    file('b.bin', 190 * 1024 * 1024),
    file('c.bin', 120 * 1024 * 1024 + 1),
  ]), /extracted package/);
});
