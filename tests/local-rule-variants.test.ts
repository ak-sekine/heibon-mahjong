import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateWin } from '../src/game/win.ts';
import { createWall } from '../src/game/wall.ts';
import { exposedDoraIndicators, uraDoraIndicators } from '../src/game/dora.ts';
import { startMatch } from '../src/game/match.ts';
import { DEFAULT_GAME_RULES, isValidGameRules, normalizeGameRules, rulesForMatch } from '../src/model/rules.ts';
import { ordinaryTile, tileKindKey } from '../src/model/tile.ts';
import type { GameRules } from '../src/model/rules.ts';
import type { GameState, PlayerState } from '../src/model/game.ts';
import { tsumoGame, RED_PINFU } from './tsumo-fixture.ts';

function rules(changes: Partial<Omit<GameRules, 'schemaVersion'>> = {}): GameRules {
  return Object.freeze({ ...DEFAULT_GAME_RULES, ...changes });
}

function preparedGame(settings: GameRules, riichi: boolean, ippatsuEligible = true): GameState {
  const source = startMatch(tsumoGame(RED_PINFU), settings).game;
  const players = [...source.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  if (riichi) players[0] = { ...players[0], riichi: { declarationTileId: 'declared', ippatsuEligible } };
  const deadWall = [...source.deadWall];
  deadWall[5] = { id: 'forced-ura-indicator', tile: ordinaryTile({ category: 'suited', suit: 'man', rank: 4 }) };
  return { ...source, rules: settings, players, deadWall };
}

test('all 16 rule combinations preserve 136 tiles and independently gate red and kan indicators', () => {
  for (let bits = 0; bits < 16; bits++) {
    const settings = rules({
      redDora: Boolean(bits & 1), uraDora: Boolean(bits & 2),
      ippatsu: Boolean(bits & 4), kanDora: Boolean(bits & 8),
    });
    const wall = createWall(settings);
    assert.equal(wall.length, 136);
    const counts = new Map<string, number>();
    for (const tile of wall) counts.set(tileKindKey(tile.tile), (counts.get(tileKindKey(tile.tile)) ?? 0) + 1);
    assert.equal(counts.size, 34);
    assert.ok([...counts.values()].every(count => count === 4));
    assert.equal(wall.filter(tile => tile.tile.isRed).length, settings.redDora ? 3 : 0);
    const withTwoKans = { deadWall: wall.slice(122), liveWall: wall.slice(0, 122), kanCount: 2 };
    assert.equal(exposedDoraIndicators(withTwoKans, settings).length, settings.kanDora ? 3 : 1);
    assert.equal(uraDoraIndicators(withTwoKans, settings).length, settings.kanDora ? 3 : 1);
  }
});

test('red dora OFF replaces red faces in the active hand and removes their bonus only', () => {
  const game = preparedGame(rules({ redDora: false }), false);
  assert.equal(game.players[0].hand.some(tile => tile.tile.isRed), false);
  assert.equal(game.players[0].drawnTile?.tile.isRed, false);
  const score = evaluateWin(game, 0, game.players[0].drawnTile!, 'tsumo');
  assert.ok(score);
  assert.equal(score.redDoraCount, 0);
  assert.equal(score.redDoraHan, 0);
});

test('ura dora is limited to riichi wins, and OFF hides and scores no ura indicators', () => {
  const ordinaryGame = preparedGame(rules({ uraDora: true }), false);
  const ordinary = evaluateWin(ordinaryGame, 0, ordinaryGame.players[0].drawnTile!, 'tsumo');
  assert.equal(ordinary?.uraDoraCount, 0);
  const onGame = preparedGame(rules({ uraDora: true }), true);
  const on = evaluateWin(onGame, 0, onGame.players[0].drawnTile!, 'tsumo');
  assert.ok(on && on.uraDoraCount > 0);
  const offGame = preparedGame(rules({ uraDora: false }), true);
  const off = evaluateWin(offGame, 0, offGame.players[0].drawnTile!, 'tsumo');
  assert.equal(off?.uraDoraCount, 0);
  assert.equal(off?.uraDoraHan, 0);
  assert.equal(uraDoraIndicators(offGame, offGame.rules).length, 1);
});

test('ippatsu OFF removes the yaku without affecting riichi or other yaku', () => {
  const onGame = preparedGame(rules({ ippatsu: true }), true);
  const on = evaluateWin(onGame, 0, onGame.players[0].drawnTile!, 'tsumo');
  assert.ok(on?.candidate.yaku.some(yaku => yaku.id === 'ippatsu'));
  const offGame = preparedGame(rules({ ippatsu: false }), true);
  const off = evaluateWin(offGame, 0, offGame.players[0].drawnTile!, 'tsumo');
  assert.ok(off);
  assert.ok(!off.candidate.yaku.some(yaku => yaku.id === 'ippatsu'));
  assert.ok(off.candidate.yaku.some(yaku => yaku.id === 'riichi' || yaku.id === 'double-riichi'));
});

test('legacy model defaults preserve every historical fixed rule and strict input validation catches bad values', () => {
  assert.deepEqual(normalizeGameRules({ schemaVersion: 1, matchFormat: 'tonnan' }), { ...DEFAULT_GAME_RULES, matchFormat: 'tonnan' });
  assert.equal(isValidGameRules({ ...DEFAULT_GAME_RULES, redDora: false }), true);
  assert.equal(isValidGameRules({ ...DEFAULT_GAME_RULES, kanDora: 'false' }), false);
  assert.equal(isValidGameRules({ ...DEFAULT_GAME_RULES, futureRule: true }), false);
  assert.equal(rulesForMatch({ format: 'tonnan' }).redDora, true);
});
