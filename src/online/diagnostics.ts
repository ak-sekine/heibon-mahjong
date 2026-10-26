export type DiagnosticLevel = 'INFO' | 'WARN' | 'ERROR';
export type DiagnosticEntry = {
  timestamp: string;
  level: DiagnosticLevel;
  event: string;
  details: Record<string, string | number | boolean | null>;
};

const STORAGE_KEY = 'heibon-mahjong-diagnostics-v1';
const MAX_ENTRIES = 200;
const allowedKeys = new Set([
  'actionType', 'requestId', 'gameRevision', 'revision', 'errorCode', 'result', 'durationMs',
  'connectionGeneration', 'attempt', 'closeCode', 'messageType', 'status', 'reason', 'source',
  'turnId', 'seat', 'phase', 'startPhase', 'endPhase', 'plannedMs', 'elapsedMs', 'timerType',
  'riverCounts', 'errorName', 'errorMessage', 'errorId', 'runnerState', 'waitingState',
  'decisionPending', 'previousPhase', 'nextPhase', 'warningAfterMs',
]);

/** Small, allowlist-only session diagnostic buffer. Logging must never affect game flow. */
export class DiagnosticLog {
  private entries: DiagnosticEntry[] = [];
  private saveQueued = false;
  private saveTimer: number | null = null;
  private refreshQueued = false;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeSessionStorage()) {
    this.storage = storage;
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flushSave());
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) this.entries = parsed.filter(isEntry).slice(-MAX_ENTRIES).map(entry => ({
          timestamp: entry.timestamp, level: entry.level, event: entry.event,
          details: scrubDetails(entry.details as Record<string, unknown>),
        }));
      }
    } catch { /* Storage may be disabled or full. */ }
  }

  record(level: DiagnosticLevel, event: string, values: Record<string, unknown> = {}): void {
    try {
      const details: DiagnosticEntry['details'] = {};
      for (const [key, value] of Object.entries(values)) {
        if (!allowedKeys.has(key)) continue;
        if (typeof value === 'string') {
          if (key === 'requestId' && (!/^[A-Za-z0-9_-]{1,64}$/u.test(value) || /^[a-f0-9]{64}$/u.test(value))) continue;
          if (key === 'errorCode' && !/^[a-z0-9_-]{1,60}$/u.test(value)) continue;
          if (key === 'actionType' && !/^[a-z-]{1,40}$/u.test(value)) continue;
          if (key === 'errorName' && !/^[A-Za-z0-9_.-]{1,60}$/u.test(value)) continue;
          details[key] = key === 'errorMessage' || key === 'source'
            ? sanitizeDiagnosticMessage(value).slice(0, 120) : value.slice(0, 120);
        }
        else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
        else if (typeof value === 'boolean' || value === null) details[key] = value;
      }
      const entry: DiagnosticEntry = { timestamp: new Date().toISOString(), level, event: event.slice(0, 80), details };
      if (this.entries.length >= MAX_ENTRIES) {
        // Keep recent anomalies when frequent normal CPU progress fills the buffer.
        const oldestRoutine = this.entries.findIndex(value => value.level === 'INFO');
        this.entries.splice(oldestRoutine >= 0 ? oldestRoutine : 0, 1);
      }
      this.entries.push(entry);
      this.queueSave();
      if (this.listeners.size && !this.refreshQueued) {
        this.refreshQueued = true;
        window.setTimeout(() => {
          this.refreshQueued = false;
          for (const listener of this.listeners) { try { listener(); } catch { /* UI is isolated. */ } }
        }, 250);
      }
    } catch { /* Diagnostics are best effort and cannot escape into game logic. */ }
  }

  all(): readonly DiagnosticEntry[] { return this.entries.slice(); }

  flush(): void { this.flushSave(); }

  clear(): void {
    this.entries = [];
    if (this.saveTimer !== null && typeof window !== 'undefined') window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.saveQueued = false;
    try { this.storage?.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ }
    for (const listener of this.listeners) { try { listener(); } catch { /* UI is isolated. */ } }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private queueSave(): void {
    if (this.saveQueued) return;
    this.saveQueued = true;
    if (typeof window !== 'undefined') this.saveTimer = window.setTimeout(() => this.flushSave(), 200);
    else queueMicrotask(() => this.flushSave());
  }

  private flushSave(): void {
    this.saveQueued = false;
    this.saveTimer = null;
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.entries)); } catch { /* Quota/disabled storage is non-fatal. */ }
  }
}

function safeSessionStorage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

function isEntry(value: unknown): value is DiagnosticEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DiagnosticEntry>;
  return typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)) &&
    typeof entry.event === 'string' && /^[a-z0-9_-]{1,80}$/u.test(entry.event) &&
    ['INFO', 'WARN', 'ERROR'].includes(String(entry.level)) && !!entry.details && typeof entry.details === 'object';
}

function scrubDetails(values: Record<string, unknown>): DiagnosticEntry['details'] {
  const details: DiagnosticEntry['details'] = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value === 'string') {
      if (key === 'requestId' && (!/^[A-Za-z0-9_-]{1,64}$/u.test(value) || /^[a-f0-9]{64}$/u.test(value))) continue;
      if (key === 'errorCode' && !/^[a-z0-9_-]{1,60}$/u.test(value)) continue;
      if (key === 'actionType' && !/^[a-z-]{1,40}$/u.test(value)) continue;
      if (key === 'errorName' && !/^[A-Za-z0-9_.-]{1,60}$/u.test(value)) continue;
      details[key] = key === 'errorMessage' || key === 'source'
        ? sanitizeDiagnosticMessage(value).slice(0, 120) : value.slice(0, 120);
    } else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
    else if (typeof value === 'boolean' || value === null) details[key] = value;
  }
  return details;
}

export const diagnosticLog = new DiagnosticLog();

const seenErrors = new WeakSet<object>();
const errorIds = new WeakMap<object, string>();
const recentErrorKeys = new Map<string, number>();
let nextErrorId = 1;

/** Remove likely identifiers, credentials and URLs before retaining exception text. */
export function sanitizeDiagnosticMessage(message: string): string {
  return message.slice(0, 300)
    .replace(/https?:\/\/\S+/giu, '[url]')
    .replace(/\b(token|ticket|authorization|cookie|password|secret)\s*[:=]\s*\S+/giu, '$1=[redacted]')
    .replace(/\b(?:man|pin|sou|east|south|west|north|white|green|red|honor|tile)[-_][A-Za-z0-9_-]+\b/giu, '[tile]')
    .replace(/\b(?:[1-9][mps]|[1-7]z)\b/giu, '[tile]')
    .replace(/[1-9](?:萬|筒|索)|[東南西北白發中]/gu, '[tile]')
    .replace(/\b[a-f0-9]{32,}\b/giu, '[id]')
    .replace(/\b(?:[A-Za-z0-9_-]{36,})\b/gu, '[id]');
}

export function safeErrorInfo(error: unknown): { errorName: string; errorMessage: string; errorCode: string } {
  let rawName: unknown;
  let rawMessage: unknown;
  let explicitCode: unknown;
  try {
    if (error && typeof error === 'object') {
      const object = error as { name?: unknown; message?: unknown; code?: unknown };
      rawName = object.name;
      rawMessage = object.message;
      explicitCode = object.code;
    }
  } catch { /* Proxies or custom getters can fail while an exception is already being reported. */ }
  const errorName = typeof rawName === 'string' ? rawName.replace(/[^A-Za-z0-9_.-]/gu, '').slice(0, 60) || 'Error' : 'Error';
  const message = typeof rawMessage === 'string' ? rawMessage : typeof error === 'string' ? error : 'Unknown error';
  const errorCode = typeof explicitCode === 'string' && /^[A-Za-z0-9_-]{1,60}$/u.test(explicitCode)
    ? explicitCode.toLowerCase()
    : errorName.toLowerCase().replace(/[^a-z0-9_-]/gu, '_').slice(0, 60) || 'error';
  return { errorName, errorMessage: sanitizeDiagnosticMessage(message), errorCode };
}

export function markDiagnosticError(error: unknown): string {
  if (error && typeof error === 'object') {
    const current = errorIds.get(error);
    if (current) return current;
    const id = `exception-${nextErrorId++}`;
    errorIds.set(error, id);
    seenErrors.add(error);
    return id;
  }
  return `exception-${nextErrorId++}`;
}

export function recordGameRenderFailure(
  log: DiagnosticLog,
  context: { seat: number; phase: string; riverCounts: string; turnId?: string },
  error: unknown,
  source: string,
): void {
  try { log.record('ERROR', 'local_game_render_failed', { ...context, ...safeErrorInfo(error), errorId: markDiagnosticError(error), source }); }
  catch { /* A rendering diagnostic must never escape into the rendering path. */ }
}

/** Installs once; it observes but never suppresses browser error events. */
export function installGlobalErrorDiagnostics(log: DiagnosticLog = diagnosticLog): void {
  if (typeof window === 'undefined' || window.__heibonErrorDiagnosticsInstalled) return;
  window.__heibonErrorDiagnosticsInstalled = true;
  const record = (event: string, error: unknown, source: string) => {
    try {
      const object = error && typeof error === 'object' ? error : null;
      if (object && seenErrors.has(object)) return;
      const info = safeErrorInfo(error);
      const fingerprint = `${info.errorName}:${info.errorMessage}:${source}`;
      const now = Date.now();
      if ((recentErrorKeys.get(fingerprint) ?? 0) > now - 3000) return;
      recentErrorKeys.set(fingerprint, now);
      if (recentErrorKeys.size > 40) for (const [key, time] of recentErrorKeys) if (time <= now - 3000) recentErrorKeys.delete(key);
      log.record('ERROR', event, { ...info, errorId: markDiagnosticError(error), source });
    } catch { /* Error reporting cannot escape into application event handling. */ }
  };
  window.addEventListener('error', event => {
    try { record('window_error', event.error ?? event.message, 'window.error'); }
    catch { /* Error observers cannot interfere with the event or application. */ }
  });
  window.addEventListener('unhandledrejection', event => {
    try { record('unhandled_rejection', event.reason, 'unhandledrejection'); }
    catch { /* Error observers cannot interfere with the event or application. */ }
  });
}

declare global { interface Window { __heibonErrorDiagnosticsInstalled?: boolean } }

export function mountDiagnosticDialog(log: DiagnosticLog = diagnosticLog): void {
  const dialog = document.querySelector<HTMLDialogElement>('#diagnostic-dialog');
  const list = document.querySelector<HTMLElement>('#diagnostic-entries');
  const count = document.querySelector<HTMLElement>('#diagnostic-count');
  const status = document.querySelector<HTMLElement>('#diagnostic-status');
  if (!dialog || !list || !count || !status) return;
  const render = () => {
    const entries = log.all();
    const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement('article');
      row.className = `diagnostic-entry diagnostic-${entry.level.toLowerCase()}`;
      const header = document.createElement('p');
      const date = new Date(entry.timestamp);
      const localDate = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
      header.textContent = `${localDate}.${String(date.getUTCMilliseconds()).padStart(3, '0')} JST · ${entry.level} · ${entry.event}`;
      const detail = document.createElement('pre');
      detail.textContent = Object.keys(entry.details).length ? JSON.stringify(entry.details, null, 2) : '—';
      row.append(header, detail);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    count.textContent = `${entries.length}件`;
    if (wasAtBottom) list.scrollTop = list.scrollHeight;
  };
  let unsub: (() => void) | null = null;
  document.querySelector<HTMLButtonElement>('#menu-diagnostics')?.addEventListener('click', () => {
    render(); status.textContent = ''; dialog.showModal(); unsub = log.subscribe(render);
  });
  document.querySelector<HTMLButtonElement>('#diagnostic-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { unsub?.(); unsub = null; });
  dialog.addEventListener('close', () => document.querySelector<HTMLButtonElement>('#main-menu-toggle')?.focus({ preventScroll: true }));
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  document.querySelector<HTMLButtonElement>('#diagnostic-clear')?.addEventListener('click', () => {
    if (window.confirm('保存されている診断ログをすべて消去しますか？')) { log.clear(); status.textContent = 'ログを消去しました。'; }
  });
  document.querySelector<HTMLButtonElement>('#diagnostic-copy')?.addEventListener('click', () => {
    const text = log.all().map(entry => `${entry.timestamp} ${entry.level} ${entry.event} ${JSON.stringify(entry.details)}`).join('\n');
    void copyText(text).then(ok => { status.textContent = ok ? 'コピーしました。' : 'コピーできませんでした。'; });
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Try the iOS-compatible selection fallback. */ }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text; textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed'; textarea.style.opacity = '0';
    document.body.append(textarea); textarea.select(); textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy'); textarea.remove();
    return copied;
  } catch { return false; }
}
