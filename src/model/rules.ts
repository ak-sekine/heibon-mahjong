import type { MatchFormat, MatchState } from './match.ts';

/** Immutable local rules selected for one match. */
export type GameRules = Readonly<{
  schemaVersion: 2;
  matchFormat: MatchFormat;
  redDora: boolean;
  uraDora: boolean;
  ippatsu: boolean;
  kanDora: boolean;
}>;

export const DEFAULT_GAME_RULES: GameRules = Object.freeze({
  schemaVersion: 2, matchFormat: 'tonpu', redDora: true, uraDora: true, ippatsu: true, kanDora: true,
});
export const GAME_RULES_STORAGE_KEY = 'heibon-mahjong-last-rules';
const STORAGE_VERSION = 2;

export function rulesForFormat(format: MatchFormat): GameRules {
  return Object.freeze({ ...DEFAULT_GAME_RULES, matchFormat: format });
}

/** Legacy format-only rules receive the established fixed-rule defaults. */
export function normalizeGameRules(value: unknown): GameRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_GAME_RULES;
  const candidate = value as Record<string, unknown>;
  if ((candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) ||
      (candidate.matchFormat !== 'tonpu' && candidate.matchFormat !== 'tonnan')) return DEFAULT_GAME_RULES;
  const legacy = candidate.schemaVersion === 1;
  const allowed = new Set(legacy ? ['schemaVersion', 'matchFormat'] :
    ['schemaVersion', 'matchFormat', 'redDora', 'uraDora', 'ippatsu', 'kanDora']);
  if (Object.keys(candidate).some(key => !allowed.has(key))) return DEFAULT_GAME_RULES;
  const keys = ['redDora', 'uraDora', 'ippatsu', 'kanDora'] as const;
  if (!legacy && keys.some(key => typeof candidate[key] !== 'boolean')) return DEFAULT_GAME_RULES;
  return Object.freeze({ schemaVersion: 2, matchFormat: candidate.matchFormat,
    redDora: legacy ? true : candidate.redDora as boolean,
    uraDora: legacy ? true : candidate.uraDora as boolean,
    ippatsu: legacy ? true : candidate.ippatsu as boolean,
    kanDora: legacy ? true : candidate.kanDora as boolean });
}

/** Strict boundary check for untrusted room-creation requests. */
export function isValidGameRules(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion === 1) return normalizeGameRules(candidate).matchFormat === candidate.matchFormat &&
    (candidate.matchFormat === 'tonpu' || candidate.matchFormat === 'tonnan') &&
    Object.keys(candidate).every(key => key === 'schemaVersion' || key === 'matchFormat');
  return candidate.schemaVersion === 2 &&
    (candidate.matchFormat === 'tonpu' || candidate.matchFormat === 'tonnan') &&
    ['redDora', 'uraDora', 'ippatsu', 'kanDora'].every(key => typeof candidate[key] === 'boolean') &&
    Object.keys(candidate).every(key => ['schemaVersion', 'matchFormat', 'redDora', 'uraDora', 'ippatsu', 'kanDora'].includes(key));
}

/** The active match is authoritative. Legacy matches retain their original format. */
export function rulesForMatch(match: Pick<MatchState, 'rules' | 'format'>): GameRules {
  return match.rules === undefined
    ? normalizeGameRules({ schemaVersion: 1, matchFormat: match.format ?? 'tonpu' })
    : normalizeGameRules(match.rules);
}

/** Omitted snapshots are legacy states and retain the historical fixed rules. */
export function rulesForGame(game: { readonly rules?: unknown }): GameRules {
  return game.rules === undefined ? DEFAULT_GAME_RULES : normalizeGameRules(game.rules);
}

export interface RulesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): RulesStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

export function loadLastGameRules(storage: RulesStorage | null = browserStorage()): GameRules {
  try {
    const raw = storage?.getItem(GAME_RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_RULES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_GAME_RULES;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 && record.version !== STORAGE_VERSION) return DEFAULT_GAME_RULES;
    return normalizeGameRules(record.rules);
  } catch { return DEFAULT_GAME_RULES; }
}

/** Storage is best effort; inability to persist preferences must not stop a match. */
export function saveLastGameRules(value: unknown, storage: RulesStorage | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    const rules = normalizeGameRules(value);
    storage.setItem(GAME_RULES_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, rules }));
    return true;
  } catch { return false; }
}

/** Fixed rules confirmed by the current engine; these are not editable in this release. */
export function describeConfirmedRules(rulesValue: unknown): readonly Readonly<{ label: string; value: string }>[] {
  const rules = normalizeGameRules(rulesValue);
  return [
    { label: '対局形式', value: rules.matchFormat === 'tonnan' ? '半荘戦（東南戦）' : '東風戦' },
    { label: '赤ドラ', value: rules.redDora ? 'あり（各色の五に1枚）' : 'なし（赤牌を使わない）' },
    { label: '喰いタン', value: 'あり' },
    { label: '和了条件', value: '役が必要（ドラのみでは和了不可）' },
    { label: '後付け', value: '完成した手牌に役があれば和了可' },
    { label: 'リーチ', value: 'あり（ダブル立直を含む）' },
    { label: '一発', value: rules.ippatsu ? 'あり' : 'なし' },
    { label: '裏ドラ', value: rules.uraDora ? 'リーチ和了時にあり' : 'なし' },
    { label: 'カンドラ', value: rules.kanDora ? 'カン成立ごとに追加' : 'なし（槓裏も追加しない）' },
    { label: '通常流局', value: 'テンパイ・ノーテンを精算' },
    { label: '途中流局', value: '九種九牌・四風連打・四家立直・四開槓。親維持で本場を加算' },
    { label: '連荘', value: '親和了・親テンパイ流局で継続' },
    { label: '対局終了', value: rules.matchFormat === 'tonnan' ? '南4局後、親が連荘しないとき' : '東4局後、親が連荘しないとき' },
  ];
}
