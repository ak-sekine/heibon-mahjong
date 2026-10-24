export type WorkerLog = {
  event: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  actionType?: string;
  requestId?: string;
  gameRevision?: number;
  revision?: number;
  result?: string;
  errorCode?: string;
  durationMs?: number;
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const CREDENTIAL_PATTERN = /^[a-f0-9]{64}$/u;
const ACTION_TYPE_PATTERN = /^[a-z-]{1,40}$/u;
const RESULT_PATTERN = /^[a-z-]{1,40}$/u;
const ERROR_CODE_PATTERN = /^[a-z0-9_-]{1,60}$/u;

/** Emit an explicitly allowlisted structured record; do not pass request or exception objects. */
export function logWorker(value: WorkerLog): void {
  try {
    const safe: Record<string, string | number> = {
      timestamp: new Date().toISOString(),
      level: value.level,
      event: value.event,
    };
    if (value.actionType && ACTION_TYPE_PATTERN.test(value.actionType)) safe.actionType = value.actionType;
    if (value.requestId && REQUEST_ID_PATTERN.test(value.requestId) && !CREDENTIAL_PATTERN.test(value.requestId)) {
      safe.requestId = value.requestId;
    }
    for (const key of ['gameRevision', 'revision', 'durationMs'] as const) {
      const number = value[key];
      if (Number.isSafeInteger(number) && (number as number) >= 0) safe[key] = number as number;
    }
    if (value.result && RESULT_PATTERN.test(value.result)) safe.result = value.result;
    if (value.errorCode && ERROR_CODE_PATTERN.test(value.errorCode)) safe.errorCode = value.errorCode;
    console.log(safe);
  } catch { /* Logging is best effort. */ }
}
