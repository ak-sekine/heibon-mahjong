import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const environments = { production: '/heibon-mahjong/', development: '/heibon-mahjong/dev/' };
const shaPattern = /^[a-f0-9]{40}$/;
export function inventory(root, prefix = '') {
  const result = {};
  for (const name of readdirSync(path.join(root, prefix)).sort()) {
    const relative = path.posix.join(prefix, name);
    const info = lstatSync(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error('Symlink rejected: ' + relative);
    if (info.isDirectory()) Object.assign(result, inventory(root, relative));
    else if (info.isFile()) result[relative] = createHash('sha256').update(readFileSync(path.join(root, relative))).digest('hex');
    else throw new Error('Unsupported entry: ' + relative);
  }
  return result;
}
export function digest(files) { return createHash('sha256').update(JSON.stringify(files)).digest('hex'); }
export function verifyBuild(root, environment) {
  const base = environments[environment];
  if (!base) throw new Error('Unknown environment');
  const files = inventory(root);
  if (Object.keys(files).some(name => name.startsWith('dev/'))) throw new Error('Nested environment rejected');
  for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/icon-180.png']) {
    if (!files[name]) throw new Error('Required asset missing: ' + name);
  }
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest')));
  for (const key of ['id', 'scope', 'start_url']) if (manifest[key] !== base) throw new Error('Invalid manifest ' + key);
  for (const icon of manifest.icons) if (!files[icon.src]) throw new Error('Missing icon ' + icon.src);
  const worker = readFileSync(path.join(root, 'sw.js'), 'utf8');
  if (!worker.includes('const ROOT = ' + JSON.stringify(base))) throw new Error('Invalid SW root');
  const prefix = environment === 'production' ? 'heibon-mahjong-shell-' : 'heibon-mahjong-dev-shell-';
  if (!worker.includes('const CACHE = "' + prefix)) throw new Error('Invalid cache namespace');
  const urls = JSON.parse(worker.match(/const PRECACHE = (\[[^\n]+\]);/)[1]);
  for (const url of urls) if (!url.startsWith(base) || (url !== base && !files[url.slice(base.length)])) throw new Error('Invalid precache URL ' + url);
  if (environment === 'production' && urls.some(url => url.startsWith(environments.development))) throw new Error('Production precaches dev');
  for (const [name] of Object.entries(files)) {
    if (!/\.(html|css|js)$/.test(name)) continue;
    const source = readFileSync(path.join(root, name), 'utf8');
    const patterns = name.endsWith('.html') ? [/(?:src|href)="([^"#]+)"/g]
      : name.endsWith('.css') ? [/url\(["']?([^"')]+)["']?\)/g]
      : [/(?:from\s*|import\s*\(\s*|import\s*)["']([./][^"']+)["']/g, /new URL\(["']([./][^"']+)["'],\s*import\.meta\.url\)/g];
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
      if (/^(data:|https?:|#)/.test(match[1])) continue;
      const url = new URL(match[1], 'https://build.invalid' + base + name);
      const relative = decodeURIComponent(url.pathname.slice(base.length)) + (url.pathname.endsWith('/') ? 'index.html' : '');
      if (!url.pathname.startsWith(base) || !files[relative]) throw new Error('Broken reference ' + name + ': ' + match[1]);
    }
  }
  return files;
}
export function seal(root, environment, sha, workerUrl) {
  if (!shaPattern.test(sha)) throw new Error('Invalid source SHA');
  const expectedName = environment === 'development' ? 'heibon-mahjong-online-dev' : 'heibon-mahjong-online';
  if (!new RegExp('^https://' + expectedName + '\\.[a-z0-9-]+\\.workers\\.dev$').test(workerUrl)) throw new Error('Invalid Worker URL');
  const releasePath = path.join(root, 'release.json');
  if (existsSync(releasePath)) throw new Error('Already sealed');
  const files = verifyBuild(root, environment);
  if (!Object.keys(files).filter(name => name.endsWith('.js')).some(name => readFileSync(path.join(root, name), 'utf8').includes(workerUrl))) throw new Error('Worker URL missing from bundle');
  const release = { version: 1, environment, sha, workerUrl, files, digest: digest(files) };
  writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n');
  return release;
}
export function verifySealed(root) {
  const release = JSON.parse(readFileSync(path.join(root, 'release.json')));
  if (release.version !== 1 || !shaPattern.test(release.sha)) throw new Error('Invalid release identity');
  const files = verifyBuild(root, release.environment);
  delete files['release.json'];
  if (digest(files) !== release.digest || JSON.stringify(files) !== JSON.stringify(release.files)) throw new Error('Artifact bytes changed');
  return release;
}
/** Pure local staging. The caller MUST serialize, persist pending, deploy, then finalize. */
export function stage(store, candidate, latestSha) {
  const stateFile = path.join(store, 'state.json');
  // Missing store is an error, never an implicit empty production.
  const state = JSON.parse(readFileSync(stateFile));
  if (state.version !== 1 || state.pending) throw new Error('Store unavailable or unresolved pending publication');
  const release = verifySealed(candidate);
  if (release.sha !== latestSha) throw new Error('Stale source SHA');
  const environment = release.environment;
  if (!state.current?.production && environment !== 'production') throw new Error('Production bootstrap required');
  const site = path.join(store, 'site');
  const previous = state.current ?? {};
  if (Object.keys(previous).some(env => !Object.hasOwn(environments, env))) throw new Error('Unknown stored environment');
  if (!previous.development && existsSync(path.join(site, 'dev'))) throw new Error('Untracked development snapshot');
  if (!previous.production && existsSync(site) && readdirSync(site).length) throw new Error('Untracked bootstrap snapshot');
  if (previous[environment]?.sha === release.sha) throw new Error('Source SHA already published; reject rerun');
  for (const [env, record] of Object.entries(previous)) {
    const target = env === 'production' ? site : path.join(site, 'dev');
    // Production inventory deliberately excludes dev and the combined ledger.
    const actual = inventory(target);
    if (env === 'production') for (const name of Object.keys(actual)) if (name.startsWith('dev/') || name === 'environments.json') delete actual[name];
    if (digest(actual) !== record.snapshotDigest) throw new Error('Stored snapshot corrupted: ' + env);
  }
  const target = environment === 'production' ? site : path.join(site, 'dev');
  if (environment === 'production') {
    mkdirSync(site, { recursive: true });
    for (const name of readdirSync(site)) if (name !== 'dev') rmSync(path.join(site, name), { recursive: true, force: true });
  } else rmSync(target, { recursive: true, force: true });
  cpSync(candidate, target, { recursive: true, errorOnExist: true });
  const current = { ...previous, [environment]: { sha: release.sha, digest: release.digest, workerUrl: release.workerUrl, snapshotDigest: digest(inventory(candidate)) } };
  writeFileSync(path.join(site, 'environments.json'), JSON.stringify(current, null, 2) + '\n');
  const pending = { environment, sha: release.sha, previous, current, siteDigest: digest(inventory(site)) };
  writeFileSync(stateFile, JSON.stringify({ version: 1, current: previous, pending }, null, 2) + '\n');
  return pending;
}
export function finalize(store) {
  const stateFile = path.join(store, 'state.json');
  const state = JSON.parse(readFileSync(stateFile));
  if (!state.pending || digest(inventory(path.join(store, 'site'))) !== state.pending.siteDigest) throw new Error('Pending snapshot mismatch');
  writeFileSync(stateFile, JSON.stringify({ version: 1, current: state.pending.current, pending: null }, null, 2) + '\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'seal') seal(...args);
  else if (command === 'verify') verifySealed(...args);
  else if (command === 'stage') stage(...args);
  else if (command === 'finalize') finalize(...args);
  else throw new Error('Unknown artifact command');
}
