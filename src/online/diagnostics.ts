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
          details[key] = value.slice(0, 120);
        }
        else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
        else if (typeof value === 'boolean' || value === null) details[key] = value;
      }
      this.entries.push({ timestamp: new Date().toISOString(), level, event: event.slice(0, 80), details });
      if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
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
      details[key] = value.slice(0, 120);
    } else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
    else if (typeof value === 'boolean' || value === null) details[key] = value;
  }
  return details;
}

export const diagnosticLog = new DiagnosticLog();

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
