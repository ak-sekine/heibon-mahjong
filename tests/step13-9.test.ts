import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeYaku, type WinningContext, type YakuCandidate, type YakuId } from '../src/analysis/yaku.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';
import { declareKan, getKanOptions } from '../src/game/kan.ts';
import { getCallOptions } from '../src/game/calls.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawOrStop } from '../src/game/draw.ts';
import { declareRon, getRonCandidates, passRon } from '../src/game/ron.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { evaluateWin } from '../src/game/win.ts';
import { assertPointConservation, nextRound, startMatch, updateMatchGame } from '../src/game/match.ts';
import { ankanGame, kanGame } from './kan-fixture.ts';
import { ronGame } from './ron-fixture.ts';
import { tsumoGame } from './tsumo-fixture.ts';
import { finalDiscardGame, oneLiveTileForKan, openHaiteiGame } from './step13-9-fixture.ts';
import { freeze, inventory, seeded } from './helpers.ts';
import { ordinaryTile, TILE_KINDS, tileKindKey, type Tile, type TileKind } from '../src/model/tile.ts';
import type { GameState, PlayerId, PlayerState } from '../src/model/game.ts';
import { yakuDisplayName } from '../src/rendering/table.ts';
import { startGame } from '../src/game/start.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
function kind(code: string): TileKind {
  const suit = code.at(-1)! as keyof typeof starts;
  return TILE_KINDS[starts[suit] + Number(code.slice(0, -1)) - 1];
}
function hand(...groups: string[]): Tile[] {
  return groups.flatMap(group => [...group.slice(0, -1)].map(rank => ordinaryTile(kind(`${rank}${group.at(-1)}`))));
}
function context(winningTile: string, extra: Partial<WinningContext> = {}): WinningContext {
  return { winMethod: 'ron', winningTile: kind(winningTile), seatWind: 'east', roundWind: 'east', ...extra };
}
function sequence(group: string): Extract<WinningMeld, { type: 'sequence' }> {
  const tiles = hand(group);
  return { type: 'sequence', tiles: tiles as [TileKind, TileKind, TileKind] };
}
function withPlayer(game: GameState, id: PlayerId, update: (player: PlayerState) => PlayerState): GameState {
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[id] = update(players[id]);
  return { ...game, players };
}
function findCandidate(game: GameState, id: PlayerId, method: 'tsumo' | 'ron'): YakuCandidate {
  const tile = method === 'tsumo' ? game.players[id].drawnTile! : game.players[game.ronWindow!.discarderId].river.at(-1)!;
  const result = evaluateWin(game, id, tile, method);
  assert.ok(result, `expected ${method} result for player ${id}`);
  return result.candidate;
}
function has(candidate: YakuCandidate, id: YakuId): boolean {
  return candidate.yaku.some(yaku => yaku.id === id);
}

test('役判定フラグは和了方法と嶺上開花・槍槓を区別し、通常候補へ1翻を加える', () => {
  const closed = hand('123m', '456m', '789p', '22p', '345s');
  const haitei = analyzeYaku(closed, context('5s', { winMethod: 'tsumo', haitei: true }));
  const candidate = haitei.candidates.find(entry => entry.shape === 'standard')!;
  assert.ok(has(candidate, 'haitei'));
  assert.equal(candidate.yaku.find(yaku => yaku.id === 'haitei')?.han, 1);
  assert.equal(haitei.hasSupportedYaku, true);
  assert.equal(analyzeYaku(closed, context('5s', { winMethod: 'tsumo' })).candidates.some(entry => has(entry, 'haitei')), false);
  assert.equal(analyzeYaku(closed, context('5s', { haitei: true })).candidates.some(entry => has(entry, 'haitei')), false);
  assert.equal(analyzeYaku(closed, context('5s', { winMethod: 'ron', houtei: true })).candidates.some(entry => has(entry, 'houtei')), true);
  assert.equal(analyzeYaku(closed, context('5s', { winMethod: 'tsumo', houtei: true })).candidates.some(entry => has(entry, 'houtei')), false);

  const rinshan = analyzeYaku(closed, context('5s', { winMethod: 'tsumo', rinshan: true, haitei: true }));
  assert.equal(rinshan.candidates.some(entry => has(entry, 'haitei')), false);
  assert.equal(rinshan.candidates.some(entry => has(entry, 'rinshan')), true);
  const chankan = analyzeYaku(closed, context('5s', { winMethod: 'ron', chankan: true, houtei: true }));
  assert.equal(chankan.candidates.some(entry => has(entry, 'houtei')), false);
  assert.equal(chankan.candidates.some(entry => has(entry, 'chankan')), true);
});

test('副露手は海底摸月・河底撈魚だけで和了役を満たせる', () => {
  const openMelds = [sequence('234m')];
  const openTsumo = analyzeYaku(hand('123p', '456s', '789m', '2p', '2p'), context('2p', {
    winMethod: 'tsumo', isClosed: false, openMelds, haitei: true,
  }));
  const haitei = openTsumo.candidates.find(candidate => candidate.shape === 'standard')!;
  assert.deepEqual(haitei.yaku.map(yaku => yaku.id), ['haitei']);
  assert.equal(openTsumo.hasSupportedYaku, true);

  const openRon = analyzeYaku(hand('123p', '456s', '789m', '2p', '2p'), context('2p', {
    winMethod: 'ron', isClosed: false, openMelds, houtei: true,
  }));
  const houtei = openRon.candidates.find(candidate => candidate.shape === 'standard')!;
  assert.deepEqual(houtei.yaku.map(yaku => yaku.id), ['houtei']);
  assert.equal(openRon.hasSupportedYaku, true);
});

test('通常牌山の最後のツモは海底摸月となり、赤5・立直・平和・ドラを通常加算する', () => {
  const base = tsumoGame(['123p', '456p', '789s', '22m', '345m'], true, ['man'], 'man-4');
  const lastTile = base.players[0].drawnTile!;
  assert.equal(base.liveWall.length, 0);
  assert.equal(base.players[0].drawnTileSource, 'live-wall');
  assert.equal(lastTile.tile.isRed, true);
  const players = [...base.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[0] = { ...players[0], riichi: { declarationTileId: players[0].river[0].id, doubleRiichi: false, ippatsuEligible: false } };
  const ready = { ...base, players };
  const won = declareTsumo(ready, 0);
  const result = won.winResult!;
  assert.equal(result.winMethod, 'tsumo');
  assert.ok(has(result.candidate, 'haitei'));
  assert.ok(has(result.candidate, 'riichi'));
  assert.ok(has(result.candidate, 'menzen-tsumo'));
  assert.ok(has(result.candidate, 'pinfu'));
  assert.equal(result.candidate.yaku.find(yaku => yaku.id === 'haitei')?.han, 1);
  assert.equal(result.redDoraHan, 1);
  assert.equal(result.doraHan, 1);
  assert.equal(result.totalHanIncludingDora, result.yakuHan + result.doraHan + result.redDoraHan);
  inventory(won, ready);
});

test('牌山が残る通常ツモでは海底摸月がなく、副露の最後のツモは海底摸月だけで和了できる', () => {
  const ordinary = tsumoGame(['123p', '456p', '789s', '22m', '345m']);
  assert.ok(ordinary.liveWall.length > 0);
  assert.equal(has(findCandidate(ordinary, 0, 'tsumo'), 'haitei'), false);

  const open = openHaiteiGame();
  assert.equal(open.liveWall.length, 0);
  assert.equal(open.players[0].drawnTileSource, 'live-wall');
  assert.equal(open.players[0].melds?.length, 1);
  assert.equal(findCandidate(open, 0, 'tsumo').yaku.map(yaku => yaku.id).join(','), 'haitei');
  const won = declareTsumo(open, 0);
  assert.equal(won.winResult?.yakuHan, 1);
  inventory(won, open);
  inventory(open, open);
});

test('最後の通常ツモが赤5でも成立し、嶺上牌でliveWallが空になった場合は成立しない', () => {
  const redLast = openHaiteiGame(true);
  const redWon = declareTsumo(redLast, 0);
  const redResult = redWon.winResult!;
  assert.equal(redLast.players[0].drawnTile?.tile.isRed, true);
  assert.ok(has(redResult.candidate, 'haitei'));
  assert.equal(redResult.redDoraHan, 1);
  inventory(redWon, redLast);

  const initial = oneLiveTileForKan(ankanGame());
  const option = getKanOptions(initial, 0).find(candidate => candidate.meld.type === 'ankan')!;
  const afterKan = declareKan(initial, 0, option.id);
  assert.equal(afterKan.liveWall.length, 0);
  assert.equal(afterKan.players[0].drawnTileSource, 'rinshan');
  assert.ok(has(findCandidate(afterKan, 0, 'tsumo'), 'rinshan'));
  assert.equal(has(findCandidate(afterKan, 0, 'tsumo'), 'haitei'), false);
  inventory(afterKan, initial);
});

test('役満候補には海底摸月を加えず、通常ツモだけがある場合は対象外の役を保つ', () => {
  const yakuman = tsumoGame(['19m', '19p', '19s', '12345677z'], true);
  const won = declareTsumo(yakuman, 0);
  const result = won.winResult!;
  assert.equal(result.yakumanCount, 1);
  assert.equal(result.candidate.yaku.some(yaku => yaku.id === 'haitei'), false);
  assert.equal(result.totalHanIncludingDora, 0);
  inventory(won, yakuman);
});

test('通常の最後の打牌は河底撈魚となり、ツモ切り・手出しの両方で1翻を記録する', () => {
  for (const handDiscard of [false, true]) {
    const game = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }],
      winningKey: 'sou-5', drawKey: handDiscard ? 'east' : 'sou-5', discardKey: handDiscard ? 'sou-5' : undefined });
    const discard = handDiscard ? game.players[3].hand.find(tile => tileKindKey(tile.tile) === 'sou-5')! : game.players[3].drawnTile!;
    assert.equal(game.liveWall.length, 0);
    assert.equal(game.players[3].drawnTileSource, 'live-wall');
    freeze(game);
    const wonWindow = discardTile(game, 3, discard.id);
    assert.equal(wonWindow.ronWindow?.lastLiveWallDiscard, true);
    assert.equal(wonWindow.phase, 'awaiting-ron');
    const candidate = getRonCandidates(wonWindow).find(entry => entry.winnerId === 0)!;
    assert.ok(candidate.candidate.yaku.some(yaku => yaku.id === 'houtei' && yaku.han === 1));
    assert.equal(candidate.candidate.yaku.some(yaku => yaku.id === 'haitei'), false);
    const won = declareRon(wonWindow, 0);
    assert.equal(won.winResult?.winMethod, 'ron');
    inventory(won, game);
  }
});

test('通常牌山が残る打牌では河底撈魚がなく、既存のフリテン制限は続く', () => {
  const ordinary = ronGame(1, [0]);
  assert.ok(ordinary.liveWall.length > 0);
  assert.equal(getRonCandidates(ordinary)[0].candidate.yaku.some(yaku => yaku.id === 'houtei'), false);

  const ready = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }],
    winningKey: 'sou-5', drawKey: 'east', discardKey: 'sou-5' });
  const furiten = withPlayer(ready, 0, player => ({ ...player, temporaryFuriten: true }));
  const discarded = discardTile(furiten, 3, furiten.players[3].hand.find(tile => tileKindKey(tile.tile) === 'sou-5')!.id);
  assert.equal(getRonCandidates(discarded).length, 0);
  assert.equal(discarded.phase, 'awaiting-draw');
  assert.equal(drawOrStop(discarded).phase, 'wall-exhausted');
  inventory(discarded, ready);
});

test('開いた手の河底撈魚だけでロンでき、結果候補は1翻になる', () => {
  const before = finalDiscardGame({ dealerId: 2,
    winners: [{ id: 0, hand: ['234m', '123p', '456s', '789m', '2p'], openChi: '234m' }],
    winningKey: 'pin-2', drawKey: 'east', discardKey: 'pin-2', indicatorKey: 'man-9' });
  const window = discardTile(before, 3, before.players[3].hand.find(tile => tileKindKey(tile.tile) === 'pin-2')!.id);
  const candidate = getRonCandidates(window).find(entry => entry.winnerId === 0)!;
  assert.deepEqual(candidate.candidate.yaku.map(yaku => yaku.id), ['houtei']);
  assert.equal(candidate.yakuHan, 1);
  const won = declareRon(window, 0);
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected houtei ron');
  assert.deepEqual(won.winResult.winners[0].candidate.yaku.map(yaku => yaku.id), ['houtei']);
  inventory(won, before);
});

test('槍槓と、liveWallをカンで使い切った後の嶺上牌打牌では河底撈魚を付けない', () => {
  const chankanStart = kanGame({ turn: 0, draw: 'man-1',
    hands: { 0: ['234p', '678s', '22z', '45s'], 1: ['23m', '456p', '789s', '333z', '66s'] },
    melds: { 0: [{ type: 'pon', group: '111m' }] } });
  const kakan = getKanOptions(chankanStart, 0).find(option => option.meld.type === 'kakan')!;
  const chankan = declareKan(chankanStart, 0, kakan.id);
  assert.equal(chankan.winResult?.winMethod, 'ron');
  if (chankan.winResult?.winMethod !== 'ron') throw new Error('Expected chankan');
  assert.ok(chankan.winResult.winners.some(winner => winner.candidate.yaku.some(yaku => yaku.id === 'chankan')));
  assert.equal(chankan.winResult.winners.some(winner => winner.candidate.yaku.some(yaku => yaku.id === 'houtei')), false);

  const rinshanStart = oneLiveTileForKan(kanGame({
    hands: { 0: ['111z', '234m', '456p', '678s', '2z'], 1: ['111m', '222p', '333s', '444m', '5z'] },
    draw: 'east', rinshan: ['white'],
  }));
  const ankan = getKanOptions(rinshanStart, 0).find(option => option.meld.type === 'ankan')!;
  const rinshan = declareKan(rinshanStart, 0, ankan.id);
  assert.equal(rinshan.liveWall.length, 0);
  assert.equal(rinshan.players[0].drawnTileSource, 'rinshan');
  const won = discardTile(rinshan, 0, rinshan.players[0].drawnTile!.id);
  assert.equal(won.winResult?.winMethod, 'ron');
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected ron on rinshan discard');
  const result = won.winResult.winners.find(winner => winner.winnerId === 1)!;
  assert.ok(result.candidate.yaku.some(yaku => yaku.id === 'suuankou'));
  assert.equal(result.candidate.yaku.some(yaku => yaku.id === 'houtei'), false);
  inventory(won, rinshanStart);
});

test('役満の最後の打牌ロンでは河底撈魚を加算しない', () => {
  const before = finalDiscardGame({ dealerId: 3, winners: [{ id: 1, hand: ['111m', '222p', '333s', '444m', '5z'] }],
    winningKey: 'white', drawKey: 'white' });
  const window = discardTile(before, 0, before.players[0].drawnTile!.id);
  assert.equal(window.winResult?.winMethod, 'ron');
  if (window.winResult?.winMethod !== 'ron') throw new Error('Expected yakuman ron');
  const winner = window.winResult.winners.find(entry => entry.winnerId === 1)!;
  assert.equal(winner.yakumanCount, 1);
  assert.equal(winner.candidate.yaku.some(yaku => yaku.id === 'houtei'), false);
  assert.equal(winner.totalHanIncludingDora, 0);
  inventory(window, before);
});

test('複数ロンでは各CPU和了者に河底撈魚を加算し、ロン宣言を自動処理する', () => {
  const before = finalDiscardGame({ dealerId: 3, winners: [
    { id: 1, hand: ['123m', '456m', '789p', '22p', '34s'] },
    { id: 2, hand: ['123p', '456p', '789s', '22m', '34s'] },
  ], winningKey: 'sou-5' });
  const won = discardTile(before, 0, before.players[0].drawnTile!.id);
  assert.equal(won.phase, 'won');
  if (won.winResult?.winMethod !== 'ron') throw new Error('Expected multiple houtei ron');
  assert.deepEqual(won.winResult.winners.map(winner => winner.winnerId), [1, 2]);
  assert.ok(won.winResult.winners.every(winner => winner.candidate.yaku.some(yaku => yaku.id === 'houtei')));
  inventory(won, before);
});

test('人間が河底ロンを見送ると一時フリテンになり、残ったCPUのロンを成立させる', () => {
  const before = finalDiscardGame({ dealerId: 2, winners: [
    { id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] },
    { id: 1, hand: ['123p', '456p', '789s', '22m', '34s'] },
  ], winningKey: 'sou-5' });
  const window = discardTile(before, 3, before.players[3].drawnTile!.id);
  assert.equal(window.phase, 'awaiting-ron');
  assert.deepEqual(getRonCandidates(window).map(candidate => candidate.winnerId), [0, 1]);
  const afterPass = passRon(window, 0);
  assert.equal(afterPass.players[0].temporaryFuriten, true);
  assert.equal(afterPass.phase, 'won');
  if (afterPass.winResult?.winMethod !== 'ron') throw new Error('Expected remaining CPU ron');
  assert.deepEqual(afterPass.winResult.winners.map(winner => winner.winnerId), [1]);
  assert.ok(afterPass.winResult.winners[0].candidate.yaku.some(yaku => yaku.id === 'houtei'));
  inventory(afterPass, before);
});

test('最後の打牌でチー・ポン・カンを認めず、ロンがなければ通常荒牌流局へ進む', () => {
  const before = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }], winningKey: 'sou-5' });
  const pending = discardTile(before, 3, before.players[3].drawnTile!.id);
  assert.equal(pending.phase, 'awaiting-ron');
  for (const player of pending.players) {
    assert.deepEqual(getCallOptions(pending, player.id), []);
    assert.deepEqual(getKanOptions(pending, player.id), []);
  }

  const noRon = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }],
    winningKey: 'sou-5', drawKey: 'east', discardKey: 'man-1' });
  const nextDraw = discardTile(noRon, 3, noRon.players[3].hand.find(tile => tileKindKey(tile.tile) === 'man-1')!.id);
  assert.equal(nextDraw.phase, 'awaiting-draw');
  const stopped = drawOrStop(nextDraw);
  assert.equal(stopped.phase, 'wall-exhausted');
  inventory(pending, before);
  inventory(stopped, noRon);
});

test('最後の打牌ロンと最終ツモは局精算・本場・供託を保ち、点数を保存する', () => {
  const before = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }],
    winningKey: 'sou-5' });
  const won = declareRon(discardTile(before, 3, before.players[3].drawnTile!.id), 0);
  const ronMatch = updateMatchGame({ ...startMatch(before), points: [24000, 25000, 25000, 25000], depositSticks: 1, honba: 2 }, won);
  assertPointConservation(ronMatch);
  assert.equal(ronMatch.lastSettlement?.deposits?.recipientId, 0);
  assert.ok(ronMatch.lastSettlement?.payments.every(payment => payment.honbaPoints === 600));

  const finalTsumo = tsumoGame(['123m', '456m', '789p', '22p', '345s'], true);
  const tsumoWon = declareTsumo(finalTsumo, 0);
  const tsumoMatch = updateMatchGame({ ...startMatch(finalTsumo), points: [24000, 25000, 25000, 25000], depositSticks: 1, honba: 2 }, tsumoWon);
  assertPointConservation(tsumoMatch);
  assert.equal(tsumoMatch.lastSettlement?.deposits?.recipientId, 0);
  assert.ok(tsumoMatch.lastSettlement?.payments.every(payment => payment.honbaPoints === 200));
  const next = nextRound(tsumoMatch, dealerId => startGame(seeded(23), dealerId));
  assert.equal(next.status, 'playing');
  assert.equal(next.game.winResult, null);
});

test('ロンなしの最後の打牌後は通常流局し、テンパイ罰符を精算して点数を保存する', () => {
  const before = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }],
    winningKey: 'sou-5', drawKey: 'east', discardKey: 'man-1' });
  const noRon = discardTile(before, 3, before.players[3].hand.find(tile => tileKindKey(tile.tile) === 'man-1')!.id);
  assert.equal(noRon.phase, 'awaiting-draw');
  const exhausted = drawOrStop(noRon);
  const match = updateMatchGame({ ...startMatch(before), points: [25000, 25000, 25000, 25000], honba: 1 }, exhausted);
  assert.equal(match.lastSettlement?.reason, 'draw');
  assert.deepEqual(match.lastSettlement?.tenpai, [true, false, false, false]);
  assert.equal(match.lastSettlement?.payments.reduce((sum, payment) => sum + payment.points, 0), 3000);
  assertPointConservation(match);
  inventory(exhausted, before);
});

test('役名は概要と詳細で日本語表示され、物理牌IDと入力局面を維持する', () => {
  assert.equal(yakuDisplayName('haitei'), '海底摸月');
  assert.equal(yakuDisplayName('houtei'), '河底撈魚');

  const game = finalDiscardGame({ dealerId: 2, winners: [{ id: 0, hand: ['123m', '456m', '789p', '22p', '34s'] }], winningKey: 'sou-5' });
  const snapshot = structuredClone(game);
  const all = [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
    ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
    ...(player.melds ?? []).flatMap(meld => meld.tiles),
  ])];
  assert.equal(all.length, 136);
  assert.equal(new Set(all.map(tile => tile.id)).size, 136);
  freeze(game);
  discardTile(game, 3, game.players[3].drawnTile!.id);
  assert.deepEqual(game, snapshot);
  inventory(game, game);
});
