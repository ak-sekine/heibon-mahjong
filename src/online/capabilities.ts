/** Baseline v1 has no optional features. Capability discovery never grants authority. */
export type Capabilities = { protocol: 'heibon-mahjong.v1'; features: readonly string[] };
const featureId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.v[1-9][0-9]*$/u;
// Unknown server advertisements cannot authorize an operation this client does not implement.
export const CLIENT_FEATURES: readonly string[] = Object.freeze([]);

export function commonFeatures(server: Capabilities, client: readonly string[] = CLIENT_FEATURES): string[] {
  const supported = new Set(client);
  return server.features.filter(feature => supported.has(feature));
}

export async function discoverCapabilities(url: string, fetcher: typeof fetch = fetch, timeoutMs = 5000): Promise<Capabilities> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid capabilities timeout');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<Capabilities> => {
        // Rejected origins, invalid responses and network errors are not legacy fallback.
        const response = await fetcher(`${url}/api/capabilities`, { cache: 'no-store', signal: controller.signal });
        let body: unknown;
        try { body = await response.json(); } catch { throw new Error('Invalid capabilities response'); }
        if (response.status === 404 && body !== null && typeof body === 'object' &&
            !Array.isArray(body) && (body as Record<string, unknown>).error === 'not_found') {
          return { protocol: 'heibon-mahjong.v1', features: [] };
        }
        if (!response.ok || body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('Capability discovery failed');
        const value = body as Record<string, unknown>;
        if (value.protocol !== 'heibon-mahjong.v1' || !Array.isArray(value.features) ||
            !value.features.every(item => typeof item === 'string' && featureId.test(item)) ||
            new Set(value.features).size !== value.features.length) throw new Error('Invalid capabilities response');
        return { protocol: 'heibon-mahjong.v1', features: value.features as string[] };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Capability discovery timed out')); }, timeoutMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
