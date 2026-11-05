// Assemble a small, deterministic ZIP containing only the browser build.
// Kept dependency-free so packaging works with the repository's npm install.
import { deflateRawSync } from 'node:zlib';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT = path.resolve('artifacts/itch/heibon-mahjong.zip');
const MAX_FILES = 1000;
const MAX_PATH_LENGTH = 240;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const MAX_SINGLE_BYTES = 200 * 1024 * 1024;
const ALLOWED_ASSET_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.png', '.svg', '.webp', '.woff', '.woff2']);
const PWA_ONLY_PATHS = new Set(['manifest.webmanifest', 'sw.js']);
const DEVELOPMENT_ONLY_PATHS = new Set(['test.html', 'kan-test.html']);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(root, entry.name);
    const info = lstatSync(fullPath);
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the itch.io build: ${relative}`);
    if (info.isDirectory()) return listFiles(fullPath, relative);
    if (!info.isFile()) throw new Error(`Unsupported filesystem entry in the itch.io build: ${relative}`);
    return [relative];
  }).sort((left, right) => left.localeCompare(right, 'en'));
}

function isPwaLinkTag(tag) {
  return /\brel\s*=\s*["']manifest["']/iu.test(tag) || /\brel\s*=\s*["']apple-touch-icon["']/iu.test(tag);
}

function itchHtml(source) {
  return source
    .replace(/<link\b[^>]*>/giu, tag => isPwaLinkTag(tag) ? '' : tag)
    .replace(/<meta\b[^>]*\bname\s*=\s*["']apple-mobile-web-app-(?:capable|status-bar-style)["'][^>]*>/giu, '');
}

function packageSources(distDir) {
  if (!existsSync(path.join(distDir, 'index.html'))) throw new Error(`Missing required build asset: ${path.join(distDir, 'index.html')}`);
  const allFiles = listFiles(distDir);
  const files = [];
  for (const relative of allFiles) {
    if (PWA_ONLY_PATHS.has(relative) || DEVELOPMENT_ONLY_PATHS.has(relative) || relative.startsWith('icons/')) continue;
    if (relative === 'index.html') {
      const indexPath = path.join(distDir, relative);
      const browserHtml = itchHtml(readFileSync(indexPath, 'utf8'));
      writeFileSync(indexPath, browserHtml, 'utf8');
      files.push({ name: relative, bytes: Buffer.from(browserHtml) });
      continue;
    }
    if (!relative.startsWith('assets/')) throw new Error(`Unexpected file in build output; refusing to package it: ${relative}`);
    if (!ALLOWED_ASSET_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      throw new Error(`Unsupported build asset; refusing to package it: ${relative}`);
    }
    files.push({ name: relative, bytes: readFileSync(path.join(distDir, relative)) });
  }
  if (!files.some(file => file.name === 'index.html')) throw new Error('ZIP root must contain index.html.');
  if (!files.some(file => file.name.startsWith('assets/') && file.name.endsWith('.js'))) throw new Error('Missing JavaScript bundle.');
  if (!files.some(file => file.name.startsWith('assets/') && file.name.endsWith('.css'))) throw new Error('Missing CSS bundle.');
  return files;
}

function localReferences(file) {
  const source = file.bytes.toString('utf8');
  const matches = [];
  const patterns = file.name === 'index.html'
    ? [/(?:src|href)\s*=\s*["']([^"']+)["']/giu]
    : file.name.endsWith('.css')
      ? [/url\(\s*["']?([^"')]+)["']?\s*\)/giu]
      : [/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/giu];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) matches.push(match[1].trim());
  }
  return matches;
}

function validateReferences(files) {
  const names = new Set(files.map(file => file.name));
  for (const file of files) {
    for (const reference of localReferences(file)) {
      if (!reference || /^(?:data:|https?:|mailto:|tel:|#|\/\/)/iu.test(reference)) continue;
      if (reference.startsWith('/')) throw new Error(`Absolute internal asset path is not allowed: ${file.name} -> ${reference}`);
      const resolved = new URL(reference, `https://itch-package.invalid/${file.name}`).pathname.slice(1);
      let decoded;
      try { decoded = decodeURIComponent(resolved); }
      catch { throw new Error(`Invalid escaped resource path: ${file.name} -> ${reference}`); }
      if (!names.has(decoded)) throw new Error(`Missing or case-mismatched internal resource: ${file.name} -> ${reference} (${decoded})`);
    }
  }
}

export function validateItchLimits(files) {
  if (files.length > MAX_FILES) throw new Error(`itch.io ZIP would contain ${files.length} files; limit is ${MAX_FILES}.`);
  let totalBytes = 0;
  for (const file of files) {
    const pathLength = [...file.name].length;
    if (pathLength > MAX_PATH_LENGTH) throw new Error(`itch.io path exceeds ${MAX_PATH_LENGTH} characters: ${file.name}`);
    if (file.bytes.length > MAX_SINGLE_BYTES) throw new Error(`itch.io file exceeds ${MAX_SINGLE_BYTES} bytes: ${file.name}`);
    totalBytes += file.bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`itch.io extracted package exceeds ${MAX_TOTAL_BYTES} bytes.`);
  }
  return totalBytes;
}

function zipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.bytes, { level: 9 });
    const checksum = crc32(file.bytes);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // Stable 1980-01-01 timestamp
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // Unix, ZIP 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function makeItchZip(distDir, outputPath = OUTPUT, { requireOnlineApiUrl = false } = {}) {
  const absoluteDistDir = path.resolve(distDir);
  if (!existsSync(absoluteDistDir)) throw new Error(`Missing itch.io build directory: ${absoluteDistDir}`);
  const files = packageSources(absoluteDistDir);
  validateReferences(files);
  const extractedBytes = validateItchLimits(files);
  if (requireOnlineApiUrl) {
    const onlineApiUrl = process.env.VITE_ONLINE_API_URL;
    if (!onlineApiUrl || !files.some(file => file.name.endsWith('.js') && file.bytes.includes(Buffer.from(onlineApiUrl)))) {
      throw new Error('The VITE_ONLINE_API_URL configured for the build was not found in the JavaScript bundle.');
    }
  }
  const archive = zipBuffer(files);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, archive);
  return {
    outputPath: path.resolve(outputPath),
    files: files.length,
    extractedBytes,
    zipBytes: archive.length,
    entries: files.map(file => file.name),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = makeItchZip(path.resolve('dist-itch'), OUTPUT, { requireOnlineApiUrl: true });
  process.stdout.write(`itch.io ZIP: ${result.outputPath}\nFiles: ${result.files}\nExtracted: ${result.extractedBytes} bytes\nZIP: ${result.zipBytes} bytes\n`);
}
