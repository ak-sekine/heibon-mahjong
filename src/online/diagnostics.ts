export type DiagnosticLevel = 'INFO' | 'WARN' | 'ERROR';
export type DiagnosticEntry = {
  timestamp: string;
  level: DiagnosticLevel;
  event: string;
  details: Record<string, string | number | boolean | null>;
};

const STORAGE_KEY = 'heibon-mahjong-diagnostics-v2';
const LEGACY_STORAGE_KEY = 'heibon-mahjong-diagnostics-v1';
const CHECKPOINT_KEY = 'heibon-mahjong-diagnostics-checkpoint-v1';
const BUILD_INFO_KEY = 'heibon-mahjong-diagnostics-build-v1';
const MAX_ENTRIES = 500;
const allowedKeys = new Set([
  'actionType', 'requestId', 'gameRevision', 'revision', 'errorCode', 'result', 'durationMs',
  'connectionGeneration', 'attempt', 'closeCode', 'messageType', 'status', 'reason', 'source',
  'turnId', 'seat', 'phase', 'startPhase', 'endPhase', 'plannedMs', 'elapsedMs', 'timerType',
  'riverCounts', 'errorName', 'errorMessage', 'errorId', 'runnerState', 'waitingState',
  'decisionPending', 'previousPhase', 'nextPhase', 'warningAfterMs',
  'cpuTurnId', 'stage', 'lastCompletedStage', 'currentStage', 'lastProgressElapsedMs',
  'remainingTiles', 'honba', 'round', 'displayState', 'waitingAsync', 'lastProgressAt', 'startedAt',
  'renderId', 'failedStage', 'stack', 'lastSuccessfulRenderId', 'lastSuccessfulRenderAt', 'runnerState',
  'buildId', 'gitSha', 'buildTimeUtc', 'appVersion', 'mode', 'schemaVersion', 'gameMode', 'lastTransition',
  'renderStage', 'operation', 'outcome', 'lastCompletedAt', 'currentTurn', 'selectedSeats',
  'actionPanelUpdated', 'roundInfo', 'buildMode',
  'executionMode', 'lastSuccessfulRenderPhase', 'lastSuccessfulRenderSeat', 'lastSuccessfulRenderRunnerState',
  'operationId', 'panelId', 'panelType', 'candidateId', 'candidateCount', 'disabled', 'progressing',
  'delta', 'stateUpdateResult',
  'scrollY', 'fromScrollY', 'visualViewportHeight', 'offsetTop', 'panelHeight', 'previousHeight',
]);

function appendBounded(entries: DiagnosticEntry[], entry: DiagnosticEntry): void {
  if (entries.length >= MAX_ENTRIES) {
    const routine = entries.findIndex(value => value.level === 'INFO' && !isPriorityEvent(value.event));
    if (routine >= 0) entries.splice(routine, 1);
    else if (entry.level === 'INFO' && !isPriorityEvent(entry.event)) return;
    else {
      const nonPriority = entries.findIndex(value => !isPriorityEvent(value.event));
      const anyInfo = entries.findIndex(value => value.level === 'INFO');
      entries.splice(nonPriority >= 0 ? nonPriority : anyInfo >= 0 ? anyInfo : 0, 1);
    }
  }
  entries.push(entry);
}

/** Bounded allowlist-only diagnostic buffer. Logging must never affect game flow. */
export class DiagnosticLog {
  private entries: DiagnosticEntry[] = [];
  private saveQueued = false;
  private saveTimer: number | null = null;
  private refreshQueued = false;
  private readonly listeners = new Set<() => void>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safePersistentStorage()) {
    this.storage = storage;
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flushSave());
    try {
      const current = storage?.getItem(STORAGE_KEY);
      const raw = current ?? storage?.getItem(LEGACY_STORAGE_KEY) ?? safeLegacySessionLog();
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) this.entries = parsed.filter(isEntry).slice(-MAX_ENTRIES).map(entry => ({
          timestamp: entry.timestamp, level: entry.level, event: entry.event,
          details: scrubDetails(entry.details as Record<string, unknown>),
        }));
        if (current === null && this.entries.length) this.queueSave();
      }
      const checkpoint = storage?.getItem(CHECKPOINT_KEY);
      if (checkpoint) {
        const parsed: unknown = JSON.parse(checkpoint);
        if (isEntry(parsed) && !this.entries.some(entry => entry.event === parsed.event && entry.timestamp === parsed.timestamp)) {
          appendBounded(this.entries, { ...parsed, details: scrubDetails(parsed.details) });
        }
      }
      const build = storage?.getItem(BUILD_INFO_KEY);
      if (build) {
        const parsed: unknown = JSON.parse(build);
        if (isEntry(parsed) && !this.entries.some(entry => entry.event === parsed.event && entry.timestamp === parsed.timestamp)) {
          appendBounded(this.entries, { ...parsed, details: scrubDetails(parsed.details) });
        }
      }
    } catch { /* Storage may be disabled or full. */ }
  }

  record(level: DiagnosticLevel, event: string, values: Record<string, unknown> = {}, options: { persist?: boolean; replace?: boolean } = {}): void {
    try {
      const details: DiagnosticEntry['details'] = {};
      for (const [key, value] of Object.entries(values)) {
        if (!allowedKeys.has(key)) continue;
        if (typeof value === 'string') {
          if (key === 'requestId' && (!/^[A-Za-z0-9_-]{1,64}$/u.test(value) || /^[a-f0-9]{64}$/u.test(value))) continue;
          if (key === 'errorCode' && !/^[a-z0-9_-]{1,60}$/u.test(value)) continue;
          if (key === 'actionType' && !/^[a-z-]{1,40}$/u.test(value)) continue;
          if (key === 'errorName' && !/^[A-Za-z0-9_.-]{1,60}$/u.test(value)) continue;
          details[key] = key === 'errorMessage' || key === 'source' || key === 'stack'
            ? sanitizeDiagnosticMessage(value, key === 'stack' ? 1000 : 300).slice(0, key === 'stack' ? 1000 : 120) : value.slice(0, key === 'buildTimeUtc' || key === 'lastProgressAt' ? 40 : 120);
        }
        else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
        else if (typeof value === 'boolean' || value === null) details[key] = value;
      }
      const entry: DiagnosticEntry = { timestamp: new Date().toISOString(), level, event: event.slice(0, 80), details };
      if (options.replace) this.entries = this.entries.filter(value => value.event !== event);
      appendBounded(this.entries, entry);
      if (options.persist !== false) {
        if (event === 'local_cpu_stage_started' || event === 'local_cpu_stage_completed' || event === 'local_cpu_wait_timer_started' || event === 'local_cpu_call_judgment_started' || event === 'local_cpu_call_resolution_started') this.writeCheckpoint(entry);
        if (event === 'app_build_info') this.writeBuildInfo(entry);
        if (level !== 'INFO' || /_failed$|_stalled$|diagnostic_snapshot/u.test(event)) this.flushSave();
        else this.queueSave();
      }
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
    try { this.storage?.removeItem(CHECKPOINT_KEY); } catch { /* Storage is optional. */ }
    try { this.storage?.removeItem(BUILD_INFO_KEY); } catch { /* Storage is optional. */ }
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

  private writeCheckpoint(entry: DiagnosticEntry): void {
    try { this.storage?.setItem(CHECKPOINT_KEY, JSON.stringify(entry)); } catch { /* Minimal synchronous checkpoint is best effort. */ }
  }
  private writeBuildInfo(entry: DiagnosticEntry): void {
    try { this.storage?.setItem(BUILD_INFO_KEY, JSON.stringify(entry)); } catch { /* Build identity is also best effort. */ }
  }

  private flushSave(): void {
    if (this.saveTimer !== null && typeof window !== 'undefined') window.clearTimeout(this.saveTimer);
    this.saveQueued = false;
    this.saveTimer = null;
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.entries)); } catch { /* Quota/disabled storage is non-fatal. */ }
  }
}

function safePersistentStorage(): Storage | null {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* Private browsing may deny local storage. */ }
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

function isEntry(value: unknown): value is DiagnosticEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DiagnosticEntry>;
  return typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)) &&
    typeof entry.event === 'string' && /^[a-z0-9_-]{1,80}$/u.test(entry.event) &&
    ['INFO', 'WARN', 'ERROR'].includes(String(entry.level)) && !!entry.details && typeof entry.details === 'object';
}

function isPriorityEvent(event: string): boolean {
  return /(?:_failed|_stalled|diagnostic_snapshot|app_build_info|runner_resume_snapshot|cpu_turn_started|cpu_stage_started|cpu_wait_timer_started|cpu_call_(?:judgment|resolution)_started|action_panel_click_received|action_panel_pointer_received|action_panel_displayed|local_action_(?:state_update_started|state_update_succeeded|state_update_failed|progress_completed|progress_failed)|local_game_render_succeeded|call_viewport_(?:panel_displayed|adjustment_skipped|panel_height_changed|(?:user|programmatic|unattributed)_scroll))$/u.test(event);
}

function safeLegacySessionLog(): string | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(LEGACY_STORAGE_KEY); } catch { return null; }
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
      details[key] = key === 'errorMessage' || key === 'source' || key === 'stack'
        ? sanitizeDiagnosticMessage(value, key === 'stack' ? 1000 : 300).slice(0, key === 'stack' ? 1000 : 120) : value.slice(0, key === 'buildTimeUtc' || key === 'lastProgressAt' ? 40 : 120);
    } else if (typeof value === 'number' && Number.isFinite(value)) details[key] = value;
    else if (typeof value === 'boolean' || value === null) details[key] = value;
  }
  return details;
}

export const diagnosticLog = new DiagnosticLog();
const restoredRender = [...diagnosticLog.all()].reverse().find(entry => entry.event === 'local_game_render_succeeded');
let lastSuccessfulRender: Record<string, unknown> | null = restoredRender ? { ...restoredRender.details } : null;
let renderSequence = typeof restoredRender?.details.renderId === 'number' ? restoredRender.details.renderId : 0;
export function recordRenderStarted(log: DiagnosticLog, details: Record<string, unknown>): number {
  const renderId = ++renderSequence;
  log.record('INFO', 'local_game_render_started', { ...details, renderId }, { persist: false, replace: true });
  return renderId;
}
export function recordRenderSucceeded(log: DiagnosticLog, details: Record<string, unknown>): void {
  lastSuccessfulRender = { ...details };
  log.record('INFO', 'local_game_render_succeeded', details, { persist: false, replace: true });
}
export function getLastSuccessfulRender(): Record<string, unknown> | null { return lastSuccessfulRender ? { ...lastSuccessfulRender } : null; }

const seenErrors = new WeakSet<object>();
const errorIds = new WeakMap<object, string>();
const recentErrorKeys = new Map<string, number>();
let nextErrorId = 1;

/** Remove likely identifiers, credentials and URLs before retaining exception text. */
export function sanitizeDiagnosticMessage(message: string, maxLength = 300): string {
  return message.slice(0, maxLength)
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
  context: Record<string, unknown>,
  error: unknown,
  source: string,
): void {
  try {
    const info = safeErrorInfo(error);
    let stack = '';
    try {
      const errorStack = error && typeof error === 'object' ? (error as { stack?: unknown }).stack : undefined;
      if (typeof errorStack === 'string') stack = sanitizeDiagnosticMessage(errorStack, 1000).slice(0, 1000);
    } catch { /* Keep stack optional. */ }
    log.record('ERROR', 'local_game_render_failed', { ...context, ...info, ...(stack ? { stack } : {}), errorId: markDiagnosticError(error), source });
  }
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

export function mountDiagnosticDialog(log: DiagnosticLog = diagnosticLog, snapshot?: () => Record<string, unknown> | null): void {
  const dialog = document.querySelector<HTMLDialogElement>('#diagnostic-dialog');
  const list = document.querySelector<HTMLElement>('#diagnostic-entries');
  const count = document.querySelector<HTMLElement>('#diagnostic-count');
  const status = document.querySelector<HTMLElement>('#diagnostic-status');
  const build = document.querySelector<HTMLElement>('#diagnostic-build-info');
  if (!dialog || !list || !count || !status) return;
  const buildInfo = getBuildInfo();
  if (build) build.textContent = `ビルド ${buildInfo.gitSha} · ${buildInfo.buildTimeUtc} · v${buildInfo.appVersion} · ${buildInfo.mode} · schema ${buildInfo.schemaVersion}`;
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
    try { const state = snapshot?.(); if (state) log.record('INFO', 'local_game_diagnostic_snapshot', state); } catch { /* Snapshot collection is observational and isolated. */ }
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

export type AppBuildInfo = { gitSha: string; buildTimeUtc: string; appVersion: string; mode: string; schemaVersion: number; buildId: string };
declare const __APP_BUILD_INFO__: AppBuildInfo;
export function getBuildInfo(): AppBuildInfo {
  try { return __APP_BUILD_INFO__; } catch { return { gitSha: 'unknown', buildTimeUtc: 'unknown', appVersion: 'unknown', mode: 'development', schemaVersion: 2, buildId: 'unknown' }; }
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
