import type { MatchFormat, MatchState } from './match.ts';

/** Rules selected for a newly created match. This version only exposes implemented match formats. */
export type GameRules = Readonly<{
  schemaVersion: 1;
  matchFormat: MatchFormat;
}>;

export const DEFAULT_GAME_RULES: GameRules = Object.freeze({ schemaVersion: 1, matchFormat: 'tonpu' });
export const GAME_RULES_STORAGE_KEY = 'heibon-mahjong-last-rules';
const STORAGE_VERSION = 1;

export function rulesForFormat(format: MatchFormat): GameRules {
  return Object.freeze({ schemaVersion: 1, matchFormat: format });
}

/** Unknown versions and formats safely resolve to the established default. */
export function normalizeGameRules(value: unknown): GameRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_GAME_RULES;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1 && (candidate.matchFormat === 'tonpu' || candidate.matchFormat === 'tonnan')
    ? rulesForFormat(candidate.matchFormat)
    : DEFAULT_GAME_RULES;
}

/** The active match is authoritative. Legacy matches retain their original format. */
export function rulesForMatch(match: Pick<MatchState, 'rules' | 'format'>): GameRules {
  return match.rules === undefined
    ? normalizeGameRules({ schemaVersion: 1, matchFormat: match.format ?? 'tonpu' })
    : normalizeGameRules(match.rules);
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
    if (record.version !== STORAGE_VERSION) return DEFAULT_GAME_RULES;
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
    { label: '赤ドラ', value: 'あり（各色の五に1枚）' },
    { label: '喰いタン', value: 'あり' },
    { label: '和了条件', value: '役が必要（ドラのみでは和了不可）' },
    { label: '後付け', value: '完成した手牌に役があれば和了可' },
    { label: 'リーチ・一発', value: 'あり（ダブル立直を含む）' },
    { label: '裏ドラ', value: 'リーチ和了時にあり' },
    { label: 'カンドラ', value: 'カン成立ごとに追加' },
    { label: '通常流局', value: 'テンパイ・ノーテンを精算' },
    { label: '途中流局', value: '九種九牌・四風連打・四家立直・四開槓。親維持で本場を加算' },
    { label: '連荘', value: '親和了・親テンパイ流局で継続' },
    { label: '対局終了', value: rules.matchFormat === 'tonnan' ? '南4局後、親が連荘しないとき' : '東4局後、親が連荘しないとき' },
  ];
}
