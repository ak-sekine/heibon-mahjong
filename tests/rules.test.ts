import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GAME_RULES, GAME_RULES_STORAGE_KEY, describeConfirmedRules,
  loadLastGameRules, normalizeGameRules, saveLastGameRules, type RulesStorage,
} from '../src/model/rules.ts';
import { RulePreferences } from '../src/ui/rule-settings.ts';

class MemoryStorage implements RulesStorage {
  readonly values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string): string | null { if (this.failRead) throw new Error('blocked'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failWrite) throw new Error('quota'); this.values.set(key, value); }
}

test('rules default to East-only and safely normalize invalid and unknown values', () => {
  assert.deepEqual(loadLastGameRules(new MemoryStorage()), DEFAULT_GAME_RULES);
  assert.deepEqual(normalizeGameRules({ schemaVersion: 1, matchFormat: 'tonnan' }), { schemaVersion: 1, matchFormat: 'tonnan' });
  for (const value of [null, 'tonnan', { schemaVersion: 2, matchFormat: 'tonnan' },
    { schemaVersion: 1, matchFormat: 'unknown' }, { schemaVersion: 1, matchFormat: 'tonpu', futureRule: true }]) {
    assert.deepEqual(normalizeGameRules(value), DEFAULT_GAME_RULES);
  }
});

test('last started rules persist in a versioned format and restore on the next match', () => {
  const storage = new MemoryStorage();
  assert.equal(saveLastGameRules({ schemaVersion: 1, matchFormat: 'tonnan' }, storage), true);
  assert.deepEqual(JSON.parse(storage.values.get(GAME_RULES_STORAGE_KEY)!), {
    version: 1, rules: { schemaVersion: 1, matchFormat: 'tonnan' },
  });
  assert.deepEqual(loadLastGameRules(storage), { schemaVersion: 1, matchFormat: 'tonnan' });
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
  assert.deepEqual(preferences.acceptedStart(preferences.current), { schemaVersion: 1, matchFormat: 'tonnan' });
  assert.deepEqual(loadLastGameRules(storage), DEFAULT_GAME_RULES);
  storage.failWrite = false;
  preferences.acceptedStart(preferences.current);
  assert.deepEqual(loadLastGameRules(storage), { schemaVersion: 1, matchFormat: 'tonnan' });
});

test('confirmed rule descriptions expose the complete current rule set as read-only values', () => {
  const rules = describeConfirmedRules({ schemaVersion: 1, matchFormat: 'tonnan' });
  assert.equal(rules.find(rule => rule.label === '対局形式')?.value, '半荘戦（東南戦）');
  assert.equal(rules.find(rule => rule.label === '赤ドラ')?.value, 'あり（各色の五に1枚）');
  assert.equal(rules.find(rule => rule.label === '喰いタン')?.value, 'あり');
  assert.match(rules.find(rule => rule.label === '対局終了')!.value, /南4局/);
});
