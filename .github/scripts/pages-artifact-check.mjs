import { checkArchive } from './reuse-production-ci.mjs';

// The Actions runtime listing is used only for name and ID, as in deploy-pages.
// A separate trusted REST metadata lookup provides expiry and ZIP digest.
export async function waitForPagesArtifact({ list, metadata, name, id, digest, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 30000, intervalMs = 1000 }) {
  if (typeof list !== 'function' || typeof metadata !== 'function' || typeof name !== 'string' || !name || !Number.isSafeInteger(id) || id < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(digest ?? '') || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('invalid artifact evidence');
  const deadline = now() + timeoutMs;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('artifact lookup timeout');
    let artifacts;
    let timer;
    const timedOut = Symbol('timed out');
    try {
      artifacts = await Promise.race([Promise.resolve().then(list), new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), remaining); })]);
    } catch { artifacts = null; } finally { clearTimeout(timer); }
    if (artifacts === timedOut) throw new Error('artifact lookup timeout');
    if (artifacts !== null) {
      if (!Array.isArray(artifacts)) throw new Error('invalid artifact listing');
      const matches = artifacts.filter(artifact => artifact.name === name);
      if (matches.length > 1) throw new Error('duplicate artifact');
      if (matches.length === 1) {
        if (matches[0].id !== id) throw new Error('artifact ID mismatch');
        const budget = deadline - now();
        if (budget <= 0) throw new Error('artifact lookup timeout');
        let details;
        let metaTimer;
        try {
          details = await Promise.race([Promise.resolve().then(() => metadata(id)), new Promise(resolve => { metaTimer = setTimeout(() => resolve(timedOut), budget); })]);
        } finally { clearTimeout(metaTimer); }
        if (details === timedOut) throw new Error('artifact lookup timeout');
        if (!details || details.id !== id || details.name !== name) throw new Error('artifact metadata mismatch');
        if (details.digest !== digest) throw new Error('artifact digest mismatch');
        if (details.expired !== false || !Number.isFinite(Date.parse(details.expires_at)) || Date.parse(details.expires_at) <= now()) throw new Error('artifact expired');
        return matches[0];
      }
    }
    const delay = deadline - now();
    if (delay <= 0) throw new Error('artifact lookup timeout');
    await wait(Math.min(intervalMs, delay));
  }
}

export function verifyArtifactZip(bytes, digest) {
  checkArchive(bytes, digest);
}
