/** Baseline v1 has no optional features. Capability discovery never grants authority. */
export type Capabilities = { protocol: 'heibon-mahjong.v1'; features: readonly string[] };
const featureId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.v[1-9][0-9]*$/u;

export async function discoverCapabilities(url: string, fetcher: typeof fetch = fetch): Promise<Capabilities> {
  // Network errors, rejected origins and invalid responses are errors, not legacy fallback.
  const response = await fetcher(`${url}/api/capabilities`, { cache: 'no-store' });
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
}
