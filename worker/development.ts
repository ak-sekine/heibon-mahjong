/** Separate entry point: never deployed through the production config. */
import production from './index.ts';
export { RoomDurableObject, RateLimitDurableObject } from './index.ts';
const origins = new Set(['https://ak-sekine.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!origins.has(request.headers.get('Origin') ?? '')) return new Response('Origin not allowed', { status: 403 });
    return production.fetch(request, env);
  },
};
