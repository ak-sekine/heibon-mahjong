const MAX_BUCKETS = 20_000;

type BucketRow = { bucket: string; window_start: number; request_count: number; expires_at: number };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export class RateLimitDurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      bucket TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      request_count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limit_buckets(expires_at)');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/internal/consume') {
      return json({ error: 'not_found' }, 404);
    }
    let input: unknown;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 1024) return json({ error: 'invalid_request' }, 400);
      input = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'invalid_request' }, 400);
    const body = input as Record<string, unknown>;
    const bucket = body.bucket;
    const limit = body.limit;
    const windowMs = body.windowMs;
    if (typeof bucket !== 'string' || !/^[a-f0-9]{64}:[a-z-]{3,20}$/u.test(bucket) ||
        !Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 1000 ||
        !Number.isInteger(windowMs) || (windowMs as number) < 1000 || (windowMs as number) > 60 * 60 * 1000) {
      return json({ error: 'invalid_request' }, 400);
    }
    const now = Date.now();
    const result = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM rate_limit_buckets WHERE expires_at <= ?', now);
      const current = this.ctx.storage.sql.exec<BucketRow>(
        'SELECT bucket, window_start, request_count, expires_at FROM rate_limit_buckets WHERE bucket = ?', bucket,
      ).toArray()[0];
      if (!current || now - current.window_start >= (windowMs as number)) {
        this.ctx.storage.sql.exec(
          'INSERT INTO rate_limit_buckets (bucket, window_start, request_count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, request_count = 1, expires_at = excluded.expires_at',
          bucket, now, now + (windowMs as number),
        );
        return { allowed: true, retryAfterMs: 0 };
      }
      if (current.request_count >= (limit as number)) {
        return { allowed: false, retryAfterMs: Math.max(1, current.expires_at - now) };
      }
      this.ctx.storage.sql.exec(
        'UPDATE rate_limit_buckets SET request_count = request_count + 1 WHERE bucket = ?', bucket,
      );
      return { allowed: true, retryAfterMs: 0 };
    });

    const rowCount = this.ctx.storage.sql.exec<{ count: number }>(
      'SELECT COUNT(*) AS count FROM rate_limit_buckets',
    ).toArray()[0]?.count ?? 0;
    if (rowCount > MAX_BUCKETS) {
      this.ctx.storage.sql.exec(`DELETE FROM rate_limit_buckets WHERE bucket IN (
        SELECT bucket FROM rate_limit_buckets ORDER BY expires_at ASC LIMIT ${rowCount - MAX_BUCKETS}
      )`);
    }
    const nextExpiry = this.ctx.storage.sql.exec<{ next_expiry: number | null }>(
      'SELECT MIN(expires_at) AS next_expiry FROM rate_limit_buckets',
    ).toArray()[0]?.next_expiry;
    if (typeof nextExpiry === 'number') await this.ctx.storage.setAlarm(nextExpiry);
    return json(result);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM rate_limit_buckets WHERE expires_at <= ?', now);
    const nextExpiry = this.ctx.storage.sql.exec<{ next_expiry: number | null }>(
      'SELECT MIN(expires_at) AS next_expiry FROM rate_limit_buckets',
    ).toArray()[0]?.next_expiry;
    if (typeof nextExpiry === 'number') await this.ctx.storage.setAlarm(nextExpiry);
  }
}
