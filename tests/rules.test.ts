import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GAME_RULES, GAME_RULES_STORAGE_KEY, describeConfirmedRules, isValidGameRules,
  loadLastGameRules, normalizeGameRules, saveLastGameRules, type RulesStorage,
  rulesForMatch,
} from '../src/model/rules.ts';
import { RulePreferences } from '../src/ui/rule-settings.ts';
import { GameController } from '../src/ui/controller.ts';
import { nextRound, startMatch, updateMatchGame } from '../src/game/match.ts';
import { startGame } from '../src/game/start.ts';
import type { MatchState } from '../src/model/match.ts';
import { fixedRound } from './match-fixture.ts';

class MemoryStorage implements RulesStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string): string | null { if (this.failRead) throw new Error('blocked'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failWrite) throw new Error('quota'); this.values.set(key, value); }
}

test('rules default to East-only and safely normalize invalid and unknown values', () => {
  assert.deepEqual(loadLastGameRules(new MemoryStorage()), DEFAULT_GAME_RULES);
  assert.equal(DEFAULT_GAME_RULES.schemaVersion, 5);
  assert.deepEqual([DEFAULT_GAME_RULES.renhou, DEFAULT_GAME_RULES.pao, DEFAULT_GAME_RULES.doubleYakuman,
    DEFAULT_GAME_RULES.multipleRon, DEFAULT_GAME_RULES.tripleRonAbortiveDraw], ['off', false, false, true, false]);
  assert.deepEqual(normalizeGameRules({ schemaVersion: 1, matchFormat: 'tonnan' }), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' });
  for (const value of [null, 'tonnan', { schemaVersion: 2, matchFormat: 'tonnan' },
    { schemaVersion: 1, matchFormat: 'unknown' }, { schemaVersion: 1, matchFormat: 'tonpu', futureRule: true }]) {
    assert.deepEqual(normalizeGameRules(value), DEFAULT_GAME_RULES);
  }
});

test('last started rules persist in a versioned format and restore on the next match', () => {
  const storage = new MemoryStorage();
  assert.equal(saveLastGameRules({ schemaVersion: 1, matchFormat: 'tonnan' }, storage), true);
  assert.deepEqual(JSON.parse(storage.values.get(GAME_RULES_STORAGE_KEY)!), {
    version: 5, rules: { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' },
  });
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' });
  storage.values.set(GAME_RULES_STORAGE_KEY, JSON.stringify({ version: 1, rules: { schemaVersion: 1, matchFormat: 'tonnan' } }));
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' }, 'v1 saved rules receive historical all-on defaults');
  storage.values.set(GAME_RULES_STORAGE_KEY, JSON.stringify({ version: 2, rules: { schemaVersion: 2, matchFormat: 'tonnan', redDora: false, uraDora: true, ippatsu: false, kanDora: false } }));
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan', redDora: false, ippatsu: false, kanDora: false }, 'v2 settings receive the historical kuitan-on default');
  storage.values.set(GAME_RULES_STORAGE_KEY, JSON.stringify({ version: 3, rules: { schemaVersion: 3, matchFormat: 'tonnan', redDora: false, kuitan: false, uraDora: true, ippatsu: false, kanDora: false } }));
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan', redDora: false, kuitan: false, ippatsu: false, kanDora: false }, 'v3 rules receive the seven new defaults');
  const v4Rules = { schemaVersion: 4, matchFormat: 'tonnan', redDora: true, kuitan: true,
    uraDora: true, ippatsu: true, kanDora: true, dealerTenpaiRenchan: true,
    kyuushuKyuuhai: true, fourWinds: true, fourRiichi: true, fourKans: true,
    agariYame: false, tenpaiYame: false };
  storage.values.set(GAME_RULES_STORAGE_KEY, JSON.stringify({ version: 4, rules: v4Rules }));
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' }, 'v4 rules receive the five Issue #37 defaults');
  const customV5 = { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' as const, renhou: 'mangan' as const,
    pao: true, doubleYakuman: true, multipleRon: false, tripleRonAbortiveDraw: true };
  assert.deepEqual(normalizeGameRules(customV5), customV5);
  assert.equal(isValidGameRules(customV5), true);
  assert.equal(isValidGameRules({ ...customV5, doubleYakuman: 'true' }), false);
  assert.equal(isValidGameRules({ ...customV5, unknownSetting: false }), false);
  assert.equal(saveLastGameRules(customV5, storage), true);
  assert.deepEqual(loadLastGameRules(storage), customV5, 'v5 persists all five settings');
});

test('corrupt data, old versions, and unknown setting values fall back without throwing', () => {
  const storage = new MemoryStorage();
  for (const value of ['{', '"tonnan"', JSON.stringify({ version: 0, rules: { schemaVersion: 1, matchFormat: 'tonnan' } }),
    JSON.stringify({ version: 1, rules: { schemaVersion: 1, matchFormat: 'future' } })]) {
    storage.values.set(GAME_RULES_STORAGE_KEY, value);
    assert.deepEqual(loadLastGameRules(storage), DEFAULT_GAME_RULES);
  }
  storage.failRead = true;
  assert.deepEqual(loadLastGameRules(storage), DEFAULT_GAME_RULES);
});

test('canceled preference edits are not persisted; accepted start saves best-effort', () => {
  const storage = new MemoryStorage();
  const preferences = new RulePreferences(storage);
  preferences.commit({ schemaVersion: 1, matchFormat: 'tonnan' });
  assert.deepEqual(loadLastGameRules(storage), DEFAULT_GAME_RULES);
  storage.failWrite = true;
  assert.deepEqual(preferences.acceptedStart(preferences.current), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' });
  assert.deepEqual(loadLastGameRules(storage), DEFAULT_GAME_RULES);
  storage.failWrite = false;
  preferences.acceptedStart(preferences.current);
  assert.deepEqual(loadLastGameRules(storage), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' });
});

test('confirmed rule descriptions expose the complete current rule set as read-only values', () => {
  const rules = describeConfirmedRules({ schemaVersion: 1, matchFormat: 'tonnan' });
  assert.equal(rules.find(rule => rule.label === '対局形式')?.value, '半荘戦（東南戦）');
  assert.equal(rules.find(rule => rule.label === '赤ドラ')?.value, 'あり（各色の五に1枚）');
  assert.equal(rules.find(rule => rule.label === '裏ドラ')?.value, 'リーチ和了時にあり');
  assert.equal(rules.find(rule => rule.label === '一発')?.value, 'あり');
  assert.equal(rules.find(rule => rule.label === 'カンドラ')?.value, 'カン成立ごとに追加');
  assert.equal(rules.find(rule => rule.label === '特殊形ダブル役満')?.value, 'なし');
  assert.equal(rules.find(rule => rule.label === '人和')?.value, 'なし');
  assert.equal(describeConfirmedRules({ ...DEFAULT_GAME_RULES, renhou: 'mangan' })
    .find(rule => rule.label === '人和')?.value, 'あり（子の第一自摸前・鳴きなしの有効ロン、固定満貫）');
  assert.match(describeConfirmedRules({ ...DEFAULT_GAME_RULES, renhou: 'mangan' })
    .find(rule => rule.label === '和了条件')!.value, /人和成立時は固定満貫/);
  assert.equal(describeConfirmedRules({ ...DEFAULT_GAME_RULES, doubleYakuman: true })
    .find(rule => rule.label === '特殊形ダブル役満')?.value, 'あり（四暗刻単騎・国士十三面・純正九蓮・大四喜）');
  assert.equal(rules.find(rule => rule.label === '喰いタン')?.value, 'あり');
  assert.equal(describeConfirmedRules({ ...DEFAULT_GAME_RULES, kuitan: false }).find(rule => rule.label === '喰いタン')?.value, 'なし（門前の断么九は有効）');
  assert.match(rules.find(rule => rule.label === '対局終了')!.value, /南4局/);
});

test('active rules are a frozen start snapshot, independent of later edits and saved preferences', () => {
  for (const format of ['tonpu', 'tonnan'] as const) {
    const storage = new MemoryStorage();
    const preferences = new RulePreferences(storage);
    const selection = { ...DEFAULT_GAME_RULES, matchFormat: format, doubleYakuman: format === 'tonnan' };
    const controller = new GameController(() => startGame(), { startImmediately: false });
    controller.newGame(selection);
    preferences.acceptedStart(selection);
    const match = controller.match;
    const before = structuredClone(match);
    const confirmed = rulesForMatch(match);
    assert.equal(confirmed.matchFormat, format);
    assert.equal(confirmed.doubleYakuman, format === 'tonnan');
    assert.equal(match.format, format);
    assert.notEqual(match.rules, selection);
    assert.ok(Object.isFrozen(match.rules));
    const edited = { ...selection, matchFormat: format === 'tonpu' ? 'tonnan' : 'tonpu' };
    preferences.commit(edited);
    saveLastGameRules(edited, storage);
    assert.equal(loadLastGameRules(storage).matchFormat, edited.matchFormat);
    assert.equal(rulesForMatch(controller.match).matchFormat, format);
    const rows = describeConfirmedRules(rulesForMatch(controller.match));
    assert.equal(rows[0].value, format === 'tonpu' ? '東風戦' : '半荘戦（東南戦）');
    assert.match(rows.at(-1)!.value, format === 'tonpu' ? /東4局/ : /南4局/);
    assert.equal(controller.match, match);
    assert.deepEqual(controller.match, before);
  }
});

test('the same confirmed rules survive settlement and the next round in both match formats', () => {
  for (const format of ['tonpu', 'tonnan'] as const) {
    const match = startMatch(startGame(), { ...DEFAULT_GAME_RULES, matchFormat: format, doubleYakuman: true });
    const snapshot = match.rules;
    const ended = updateMatchGame(match, fixedRound(0, []));
    assert.equal(ended.status, 'round-ended');
    assert.equal(ended.rules, snapshot);
    const next = nextRound(ended, id => startGame(() => .5, id));
    assert.equal(next.status, 'playing');
    assert.equal(next.roundNumber, 2);
    assert.equal(next.rules, snapshot);
    assert.equal(rulesForMatch(next).matchFormat, format);
    assert.equal(rulesForMatch(next).doubleYakuman, true);
  }
});

test('legacy active matches use their own format; invalid rule snapshots normalize safely', () => {
  assert.equal(rulesForMatch({ format: 'tonnan' }).matchFormat, 'tonnan');
  assert.equal(rulesForMatch({}).matchFormat, 'tonpu');
  for (const rules of [null, { schemaVersion: 0, matchFormat: 'tonnan' }, { schemaVersion: 1, matchFormat: 'unknown' }]) {
    assert.deepEqual(rulesForMatch({ rules } as MatchState), DEFAULT_GAME_RULES);
  }
});
