import type { MatchFormat, MatchState } from './match.ts';

/** Immutable local rules selected for one match. */
export type GameRules = Readonly<{
  schemaVersion: 5;
  matchFormat: MatchFormat;
  redDora: boolean;
  kuitan: boolean;
  uraDora: boolean;
  ippatsu: boolean;
  kanDora: boolean;
  dealerTenpaiRenchan: boolean;
  kyuushuKyuuhai: boolean;
  fourWinds: boolean;
  fourRiichi: boolean;
  fourKans: boolean;
  agariYame: boolean;
  tenpaiYame: boolean;
  /** Reserved for Issue #38; only `off` is user-selectable for now. */
  renhou: 'off' | 'mangan';
  /** Reserved for Issue #39. */
  pao: boolean;
  /** Applies the four special double-yakuman forms implemented in Issue #37. */
  doubleYakuman: boolean;
  /** Reserved for Issue #40. */
  multipleRon: boolean;
  /** Reserved for Issue #40. */
  tripleRonAbortiveDraw: boolean;
}>;

export const DEFAULT_GAME_RULES: GameRules = Object.freeze({
  schemaVersion: 5, matchFormat: 'tonpu', redDora: true, kuitan: true, uraDora: true, ippatsu: true, kanDora: true,
  dealerTenpaiRenchan: true, kyuushuKyuuhai: true, fourWinds: true, fourRiichi: true, fourKans: true,
  agariYame: false, tenpaiYame: false, renhou: 'off', pao: false, doubleYakuman: false,
  multipleRon: true, tripleRonAbortiveDraw: false,
});
export const GAME_RULES_STORAGE_KEY = 'heibon-mahjong-last-rules';
const STORAGE_VERSION = 5;

export function rulesForFormat(format: MatchFormat): GameRules {
  return Object.freeze({ ...DEFAULT_GAME_RULES, matchFormat: format });
}

/** Game-level snapshots are only needed when behavior differs from the legacy defaults. */
export function hasNonDefaultGameRules(rules: GameRules): boolean {
  return !rules.redDora || !rules.kuitan || !rules.uraDora || !rules.ippatsu || !rules.kanDora ||
    !rules.dealerTenpaiRenchan || !rules.kyuushuKyuuhai || !rules.fourWinds || !rules.fourRiichi || !rules.fourKans ||
    rules.agariYame || rules.tenpaiYame || rules.renhou !== 'off' || rules.pao || rules.doubleYakuman ||
    !rules.multipleRon || rules.tripleRonAbortiveDraw;
}

/** Legacy format-only rules receive the established fixed-rule defaults. */
export function normalizeGameRules(value: unknown): GameRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_GAME_RULES;
  const candidate = value as Record<string, unknown>;
  if (![1, 2, 3, 4, 5].includes(candidate.schemaVersion as number) ||
      (candidate.matchFormat !== 'tonpu' && candidate.matchFormat !== 'tonnan')) return DEFAULT_GAME_RULES;
  const version = candidate.schemaVersion as 1 | 2 | 3 | 4 | 5;
  const legacy = version === 1;
  const allowed = new Set(version === 1 ? ['schemaVersion', 'matchFormat'] : version === 2 ?
    ['schemaVersion', 'matchFormat', 'redDora', 'uraDora', 'ippatsu', 'kanDora'] :
    version === 3 ? ['schemaVersion', 'matchFormat', 'redDora', 'kuitan', 'uraDora', 'ippatsu', 'kanDora'] :
    ['schemaVersion', 'matchFormat', 'redDora', 'kuitan', 'uraDora', 'ippatsu', 'kanDora', 'dealerTenpaiRenchan', 'kyuushuKyuuhai', 'fourWinds', 'fourRiichi', 'fourKans', 'agariYame', 'tenpaiYame',
      ...(version === 5 ? ['renhou', 'pao', 'doubleYakuman', 'multipleRon', 'tripleRonAbortiveDraw'] : [])]);
  if (Object.keys(candidate).some(key => !allowed.has(key))) return DEFAULT_GAME_RULES;
  const keys = version >= 3 ? ['redDora', 'kuitan', 'uraDora', 'ippatsu', 'kanDora'] as const :
    ['redDora', 'uraDora', 'ippatsu', 'kanDora'] as const;
  const added = ['dealerTenpaiRenchan', 'kyuushuKyuuhai', 'fourWinds', 'fourRiichi', 'fourKans', 'agariYame', 'tenpaiYame'] as const;
  if (!legacy && keys.some(key => typeof candidate[key] !== 'boolean')) return DEFAULT_GAME_RULES;
  if (version >= 4 && added.some(key => typeof candidate[key] !== 'boolean')) return DEFAULT_GAME_RULES;
  const newKeys = ['pao', 'doubleYakuman', 'multipleRon', 'tripleRonAbortiveDraw'] as const;
  if (version === 5 && (newKeys.some(key => typeof candidate[key] !== 'boolean') ||
      !['off', 'mangan'].includes(candidate.renhou as string))) return DEFAULT_GAME_RULES;
  return Object.freeze({ schemaVersion: 5, matchFormat: candidate.matchFormat,
    redDora: legacy ? true : candidate.redDora as boolean,
    kuitan: version < 3 ? true : candidate.kuitan as boolean,
    uraDora: legacy ? true : candidate.uraDora as boolean,
    ippatsu: legacy ? true : candidate.ippatsu as boolean,
    kanDora: legacy ? true : candidate.kanDora as boolean,
    dealerTenpaiRenchan: version < 4 ? true : candidate.dealerTenpaiRenchan as boolean,
    kyuushuKyuuhai: version < 4 ? true : candidate.kyuushuKyuuhai as boolean,
    fourWinds: version < 4 ? true : candidate.fourWinds as boolean,
    fourRiichi: version < 4 ? true : candidate.fourRiichi as boolean,
    fourKans: version < 4 ? true : candidate.fourKans as boolean,
    agariYame: version < 4 ? false : candidate.agariYame as boolean,
    tenpaiYame: version < 4 ? false : candidate.tenpaiYame as boolean,
    renhou: version < 5 ? 'off' : candidate.renhou as 'off' | 'mangan',
    pao: version < 5 ? false : candidate.pao as boolean,
    doubleYakuman: version < 5 ? false : candidate.doubleYakuman as boolean,
    multipleRon: version < 5 ? true : candidate.multipleRon as boolean,
    tripleRonAbortiveDraw: version < 5 ? false : candidate.tripleRonAbortiveDraw as boolean });
}

/** Strict boundary check for untrusted room-creation requests. */
export function isValidGameRules(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion === 1 || candidate.schemaVersion === 2) return normalizeGameRules(candidate).matchFormat === candidate.matchFormat &&
    (candidate.matchFormat === 'tonpu' || candidate.matchFormat === 'tonnan') &&
    Object.keys(candidate).every(key => candidate.schemaVersion === 1 ? key === 'schemaVersion' || key === 'matchFormat' :
      ['schemaVersion', 'matchFormat', 'redDora', 'uraDora', 'ippatsu', 'kanDora'].includes(key)) &&
    (candidate.schemaVersion === 1 || ['redDora', 'uraDora', 'ippatsu', 'kanDora'].every(key => typeof candidate[key] === 'boolean'));
  if (![3, 4, 5].includes(candidate.schemaVersion as number) ||
      (candidate.matchFormat !== 'tonpu' && candidate.matchFormat !== 'tonnan')) return false;
  const schemaVersion = candidate.schemaVersion as 3 | 4 | 5;
  const oldKeys = ['redDora', 'kuitan', 'uraDora', 'ippatsu', 'kanDora'];
  const added = ['dealerTenpaiRenchan', 'kyuushuKyuuhai', 'fourWinds', 'fourRiichi', 'fourKans', 'agariYame', 'tenpaiYame'];
  const v5 = ['renhou', 'pao', 'doubleYakuman', 'multipleRon', 'tripleRonAbortiveDraw'];
  const versionKeys = [...oldKeys, ...(schemaVersion >= 4 ? added : []), ...(schemaVersion === 5 ? v5 : [])];
  const expected = ['schemaVersion', 'matchFormat', ...versionKeys];
  return oldKeys.every(key => typeof candidate[key] === 'boolean') &&
    (schemaVersion < 4 || added.every(key => typeof candidate[key] === 'boolean')) &&
    (schemaVersion < 5 || (candidate.pao !== undefined && typeof candidate.pao === 'boolean' &&
      candidate.doubleYakuman !== undefined && typeof candidate.doubleYakuman === 'boolean' &&
      candidate.multipleRon !== undefined && typeof candidate.multipleRon === 'boolean' &&
      candidate.tripleRonAbortiveDraw !== undefined && typeof candidate.tripleRonAbortiveDraw === 'boolean' &&
      (candidate.renhou === 'off' || candidate.renhou === 'mangan'))) &&
    Object.keys(candidate).every(key => expected.includes(key));
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
    if (![1, 2, 3, 4, STORAGE_VERSION].includes(record.version as number)) return DEFAULT_GAME_RULES;
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

/** Rules confirmed for the active match and shown in read-only rule summaries. */
export function describeConfirmedRules(rulesValue: unknown): readonly Readonly<{ label: string; value: string }>[] {
  const rules = normalizeGameRules(rulesValue);
  return [
    { label: '対局形式', value: rules.matchFormat === 'tonnan' ? '半荘戦（東南戦）' : '東風戦' },
    { label: '赤ドラ', value: rules.redDora ? 'あり（各色の五に1枚）' : 'なし（赤牌を使わない）' },
    { label: '喰いタン', value: rules.kuitan ? 'あり' : 'なし（門前の断么九は有効）' },
    { label: '和了条件', value: '役が必要（ドラのみでは和了不可）' },
    { label: '後付け', value: '完成した手牌に役があれば和了可' },
    { label: 'リーチ', value: 'あり（ダブル立直を含む）' },
    { label: '一発', value: rules.ippatsu ? 'あり' : 'なし' },
    { label: '裏ドラ', value: rules.uraDora ? 'リーチ和了時にあり' : 'なし' },
    { label: 'カンドラ', value: rules.kanDora ? 'カン成立ごとに追加' : 'なし（槓裏も追加しない）' },
    { label: '通常流局', value: 'テンパイ・ノーテンを精算' },
    { label: '親テンパイ連荘', value: rules.dealerTenpaiRenchan ? 'あり' : 'なし（通常流局では親交代）' },
    { label: '九種九牌', value: rules.kyuushuKyuuhai ? 'あり（途中流局）' : 'なし（通常進行）' },
    { label: '四風連打', value: rules.fourWinds ? 'あり（途中流局）' : 'なし（通常進行）' },
    { label: '四家立直', value: rules.fourRiichi ? 'あり（途中流局）' : 'なし（通常進行）' },
    { label: '四開槓', value: rules.fourKans ? 'あり（途中流局）' : 'なし（通常進行）' },
    { label: 'アガリやめ', value: rules.agariYame ? '最終局に親が単独トップなら終了' : 'なし' },
    { label: 'テンパイやめ', value: rules.tenpaiYame ? '最終局、親テンパイ連荘時に単独トップなら終了' : 'なし' },
    { label: '特殊形ダブル役満', value: rules.doubleYakuman ? 'あり（四暗刻単騎・国士十三面・純正九蓮・大四喜）' : 'なし' },
    { label: '対局終了', value: rules.matchFormat === 'tonnan' ? '南4局後、終了条件を満たしたとき' : '東4局後、終了条件を満たしたとき' },
  ];
}
