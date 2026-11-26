// Pure preflight helper. It is deliberately not connected to any workflow.
// list must use the same Actions artifact client and run context as deploy-pages.
export async function waitForPagesArtifact({ list, name, id, digest, expiresAt, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 30000, intervalMs = 1000 }) {
  if (typeof name !== 'string' || !name || !Number.isSafeInteger(id) || id < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(digest ?? '') || !Number.isFinite(Date.parse(expiresAt)) ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('invalid artifact evidence');
  const deadline = now() + timeoutMs;
  for (;;) {
    if (Date.parse(expiresAt) <= now()) throw new Error('artifact expired');
    const remainingBeforeLookup = deadline - now();
    if (remainingBeforeLookup <= 0) throw new Error('artifact lookup timeout');
    let artifacts;
    let timer;
    const timedOut = Symbol('timed out');
    try {
      artifacts = await Promise.race([Promise.resolve().then(list), new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), remainingBeforeLookup); })]);
    } catch { artifacts = null; } finally { clearTimeout(timer); }
    if (artifacts === timedOut) throw new Error('artifact lookup timeout');
    if (artifacts !== null) {
      if (!Array.isArray(artifacts)) throw new Error('invalid artifact listing');
      const matches = artifacts.filter(artifact => artifact.name === name);
      if (matches.length > 1) throw new Error('duplicate artifact');
      if (matches.length === 1) {
        if (matches[0].id !== id) throw new Error('artifact ID mismatch');
        if (matches[0].digest !== digest) throw new Error('artifact digest mismatch');
        if (Date.parse(expiresAt) <= now()) throw new Error('artifact expired');
        return matches[0];
      }
    }
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('artifact lookup timeout');
    await wait(Math.min(intervalMs, remaining));
  }
}
