import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildPwa, serviceWorkerSource, DEV_PWA_BASE, PWA_BASE } from '../scripts/build-pwa.mjs';
import { seal, stage, finalize, inventory, digest, verifySealed } from '../scripts/environments/artifacts.mjs';
import { checkPublication, preparePublication } from '../.github/scripts/publication-reservation.mjs';
const prodSha = 'a'.repeat(40), devSha = 'b'.repeat(40);
function fixture(root, env, sha) {
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  const base = env === 'production' ? PWA_BASE : DEV_PWA_BASE;
  const url = `https://heibon-mahjong-online${env === 'production' ? '' : '-dev'}.test.workers.dev`;
  writeFileSync(path.join(root, 'index.html'), `<link rel="manifest" href="${base}manifest.webmanifest"><script src="${base}assets/app.js"></script>`);
  writeFileSync(path.join(root, 'assets/app.js'), JSON.stringify(url));
  writeFileSync(path.join(root, 'assets/app.css'), 'body{}');
  writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({ icons: [] }));
  buildPwa(root, env);
  return seal(root, env, sha, url);
}
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'environments-'));
  const store = path.join(root, 'store'), prod = path.join(root, 'prod'), dev = path.join(root, 'dev');
  mkdirSync(store);
  writeFileSync(path.join(store, 'state.json'), JSON.stringify({ version: 1, current: {}, pending: null }));
  fixture(prod, 'production', prodSha); fixture(dev, 'development', devSha);
  return { root, store, prod, dev };
}
for (const order of [['production', 'development'], ['development', 'production']]) test('independent updates preserve opposite bytes: ' + order.join(', '), () => {
  const { root, store, prod, dev } = setup();
  try {
    stage(store, prod, prodSha); finalize(store);
    stage(store, dev, devSha); finalize(store);
    for (const env of order) {
      const before = inventory(path.join(store, 'site'));
      const candidate = path.join(root, env + '-next');
      const sha = (env === 'production' ? 'c' : 'd').repeat(40);
      fixture(candidate, env, sha); stage(store, candidate, sha); finalize(store);
      const after = inventory(path.join(store, 'site'));
      for (const name of Object.keys(before)) {
        if (name === 'environments.json' || name.startsWith('dev/') === (env === 'development')) continue;
        assert.equal(after[name], before[name], name);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('stale rerun, missing store, missing production, corrupted artifact and pending failures stop publication', () => {
  const { root, store, prod, dev } = setup();
  try {
    assert.throws(() => stage(path.join(root, 'missing'), prod, prodSha));
    assert.throws(() => stage(store, dev, devSha), /bootstrap/);
    assert.throws(() => stage(store, prod, devSha), /Stale/);
    const before = digest(inventory(store));
    // A failed candidate (CI/Worker failure) never reaches stage: prior snapshot unchanged.
    assert.equal(digest(inventory(store)), before);
    stage(store, prod, prodSha);
    const pendingBytes = digest(inventory(store));
    // Models Pages failure, upload failure, stale-at-final-check, or success with lost acknowledgement.
    assert.throws(() => stage(store, dev, devSha), /pending/);
    assert.equal(digest(inventory(store)), pendingBytes);
    finalize(store);
    assert.throws(() => stage(store, prod, prodSha), /already published/);
    writeFileSync(path.join(dev, 'assets/app.js'), 'tampered');
    assert.throws(() => verifySealed(dev), /changed/);
    assert.throws(() => stage(store, dev, devSha), /changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('production bootstrap may omit unprepared dev, but later corruption fails closed', () => {
  const { root, store, prod, dev } = setup();
  try {
    stage(store, prod, prodSha); finalize(store);
    assert(!Object.keys(inventory(path.join(store, 'site'))).some(name => name.startsWith('dev/')));
    writeFileSync(path.join(store, 'site/index.html'), 'broken');
    assert.throws(() => stage(store, dev, devSha), /corrupted/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function runtime(environment) {
  const handlers = {}, deleted = [], claimed = [];
  vm.runInNewContext(serviceWorkerSource(environment === 'production' ? 'heibon-mahjong-shell-new' : 'heibon-mahjong-dev-shell-new', [environment === 'production' ? PWA_BASE : DEV_PWA_BASE], environment), {
    self: { addEventListener: (name, handler) => handlers[name] = handler, location: { origin: 'https://example.test' }, clients: { claim: async () => claimed.push(true), matchAll: async () => [] } },
    caches: { keys: async () => ['heibon-mahjong-shell-old', 'heibon-mahjong-dev-shell-old', 'unrelated'], delete: async key => deleted.push(key) }, URL, Set,
  });
  return { handlers, deleted, claimed };
}
test('SW activation deletes only its own caches; production cannot claim development clients', async () => {
  for (const env of ['production', 'development']) {
    const r = runtime(env); let done;
    r.handlers.activate({ waitUntil: promise => done = promise }); await done;
    assert.deepEqual(r.deleted, [env === 'production' ? 'heibon-mahjong-shell-old' : 'heibon-mahjong-dev-shell-old']);
    assert.equal(r.claimed.length, env === 'development' ? 1 : 0);
    let intercepted = false;
    if (env === 'production') r.handlers.fetch({ request: { method: 'GET', url: 'https://example.test/heibon-mahjong/dev/', mode: 'navigate' }, respondWith: () => intercepted = true });
    if (env === 'production') assert.equal(intercepted, false);
  }
});

test('an unprepared environment cannot be published from untracked store files', () => {
  const { root, store, prod } = setup();
  try {
    mkdirSync(path.join(store, 'site/dev'), { recursive: true });
    writeFileSync(path.join(store, 'site/dev/index.html'), 'unverified');
    assert.throws(() => stage(store, prod, prodSha), /Untracked development/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('configuration drift cannot publish a candidate bound to a different Worker', () => {
  const { root, store, prod } = setup();
  try {
    const before = digest(inventory(store));
    assert.throws(() => stage(store, prod, prodSha, 'https://heibon-mahjong-online.other.workers.dev'), /endpoint changed/);
    assert.equal(digest(inventory(store)), before, 'failed endpoint binding must not modify the store');
    const actual = JSON.parse(readFileSync(path.join(prod, 'release.json'))).workerUrl;
    stage(store, prod, prodSha, actual);
    finalize(store);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Worker deployment requires a fresh snapshot reserved by this run and attempt', () => {
  const script = readFileSync(new URL('../.github/scripts/deploy-isolated-worker.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '');
  for (const [environment, branch, config] of [
    ['production', 'main', 'wrangler.jsonc'],
    ['development', 'develop', 'wrangler.development.jsonc'],
  ]) {
    const { root, store, prod, dev } = setup();
    try {
      stage(store, prod, prodSha);
      finalize(store);
      const candidate = path.join(root, 'next');
      const { sha, workerUrl } = fixture(candidate, environment, 'c'.repeat(40));
      const commit = 'f'.repeat(40);
      const env = {
        GITHUB_REF: 'refs/heads/' + branch, GITHUB_SHA: sha, GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REPOSITORY: 'fixture/repo', GITHUB_RUN_ID: '10', GITHUB_RUN_ATTEMPT: '1',
        PUBLICATION_SNAPSHOT: commit, EXPECTED_WORKER_URL: workerUrl, GITHUB_OUTPUT: 'output',
        CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'shared-account',
      };
      let remoteBranch = sha;
      let remoteStore = commit;
      const externalCalls = [];
      const exec = (command, args) => {
        if (command === 'git') {
          assert.deepEqual(args, ['-C', store, 'rev-parse', 'HEAD']);
          return commit;
        }
        if (command === 'gh') {
          if (args[1].endsWith('/commits/pages-verified')) return remoteStore;
          assert.equal(args[1], 'repos/fixture/repo/commits/' + branch);
          return remoteBranch;
        }
        externalCalls.push([command, Array.from(args)]);
        return workerUrl;
      };
      const deploy = (overrides = {}) => {
        const deploymentEnv = { ...env, ...overrides };
        return vm.runInNewContext(script, {
          process: { argv: ['node', 'script', environment, store], env: deploymentEnv },
          checkPublication: (dir, url) => checkPublication(dir, url, deploymentEnv, exec),
          execFileSync: exec,
          appendFileSync: (file, value) => {
            assert.equal(file, 'output');
            assert.equal(value, 'url=' + workerUrl + '\n');
          },
        });
      };
      const prepare = (dir = candidate, overrides = {}) => preparePublication(store, dir, workerUrl, { ...env, ...overrides }, exec);
      const before = digest(inventory(store));
      remoteBranch = 'e'.repeat(40);
      assert.throws(() => prepare(), /Stale/);
      remoteBranch = sha;
      const wrongEnvironment = environment === 'production' ? dev : prod;
      assert.throws(() => prepare(wrongEnvironment), /Stale|endpoint|Candidate/);
      assert.equal(digest(inventory(store)), before);
      assert.throws(deploy, /does not belong/);

      prepare();
      const reserved = digest(inventory(store));
      assert.throws(() => prepare(), /pending/);
      assert.throws(() => deploy({ GITHUB_RUN_ID: '11' }), /does not belong/);
      assert.throws(() => deploy({ GITHUB_RUN_ATTEMPT: '2' }), /does not belong/);
      assert.throws(() => deploy({ GITHUB_EVENT_NAME: 'push' }), /branch or event/);
      assert.throws(() => deploy({ CLOUDFLARE_ACCOUNT_ID: '' }), /Missing explicit/);
      remoteStore = 'e'.repeat(40);
      assert.throws(deploy, /Remote snapshot changed/);
      remoteStore = commit;
      remoteBranch = 'e'.repeat(40);
      assert.throws(deploy, /Stale source SHA/);
      remoteBranch = sha;
      assert.equal(digest(inventory(store)), reserved);
      assert.deepEqual(externalCalls, []);

      deploy();
      assert.deepEqual(externalCalls, [['npx', ['wrangler', 'deploy', '--config', config]]]);
      finalize(store);
      const published = digest(inventory(store));
      assert.throws(() => prepare(), /already published/);
      assert.throws(deploy, /does not belong/);
      assert.equal(digest(inventory(store)), published);
      assert.equal(externalCalls.length, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
