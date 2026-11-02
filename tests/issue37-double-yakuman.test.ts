import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeYaku, type WinningContext, type YakuId } from '../src/analysis/yaku.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';
import { calculateScore } from '../src/analysis/score.ts';
import { evaluateWin } from '../src/game/win.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { startMatch, updateMatchGame } from '../src/game/match.ts';
import { DEFAULT_GAME_RULES } from '../src/model/rules.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { applyOnlineGameAction, startOnlineGame, startOnlineGameWithSeatAssignment } from '../src/online/game-engine.ts';
import { createPlayerGameView, type OnlineGameSession } from '../src/online/game-view.ts';
import { ordinaryTile, TILE_KINDS, type Tile, type TileKind } from '../src/model/tile.ts';
import { createIssue37WinningState, ISSUE37_TEST_HANDS } from '../src/verification/issue37-fixtures.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
function kinds(group: string): TileKind[] {
  const suit = group.at(-1)! as keyof typeof starts;
  return [...group.slice(0, -1)].map(rank => TILE_KINDS[starts[suit] + Number(rank) - 1]);
}
function hand(...groups: string[]): Tile[] { return groups.flatMap(group => kinds(group).map(ordinaryTile)); }
function kind(code: string): TileKind { return kinds(code)[0]; }
function context(winningTile: string, doubleYakuman: boolean, winMethod: 'ron' | 'tsumo' = 'ron', extra: Partial<WinningContext> = {}): WinningContext {
  return { winMethod, winningTile: kind(winningTile), seatWind: 'east', roundWind: 'south', doubleYakuman, ...extra };
}
function yakuCount(tiles: readonly Tile[], ctx: WinningContext, id: YakuId, melds: readonly WinningMeld[] = []): number {
  return analyzeYaku(tiles, { ...ctx, ...(melds.length ? { openMelds: melds, isClosed: false } : {}) })
    .candidates.flatMap(candidate => candidate.yaku).find(yaku => yaku.id === id)?.yakuman ?? 0;
}

test('Issue #37: four target yakuman are one-times OFF and two-times ON', () => {
  const cases: readonly { id: YakuId; tiles: Tile[]; winner: string }[] = [
    { id: 'suuankou', tiles: hand('111m', '222p', '333s', '444z', '55z'), winner: '5z' },
    { id: 'kokushi-musou', tiles: hand('119m', '19p', '19s', '1234567z'), winner: '1m' },
    { id: 'chuuren-poutou', tiles: hand('11123456789995m'), winner: '5m' },
    { id: 'daisuushii', tiles: hand('111z', '222z', '333z', '444z', '55m'), winner: '5m' },
  ];
  for (const scenario of cases) {
    assert.equal(yakuCount(scenario.tiles, context(scenario.winner, false), scenario.id), 1, `${scenario.id} OFF`);
    assert.equal(yakuCount(scenario.tiles, context(scenario.winner, true), scenario.id), 2, `${scenario.id} ON`);
  }
});

test('Issue #37: four concealed tanki only doubles when suuankou itself is valid', () => {
  const hand14 = hand('111m', '222p', '333s', '444z', '55z');
  const tanki = analyzeYaku(hand14, context('5z', true));
  const tankiYaku = tanki.candidates.flatMap(candidate => candidate.yaku).filter(yaku => yaku.id === 'suuankou');
  assert.equal(tankiYaku.length, 1, 'the same suuankou is not counted twice');
  assert.equal(tankiYaku[0].yakuman, 2);
  assert.equal(analyzeYaku(hand14, context('3s', true, 'tsumo')).candidates
    .flatMap(candidate => candidate.yaku).find(yaku => yaku.id === 'suuankou')?.yakuman, 1, 'tsumo shanpon stays one-times');
  assert.equal(analyzeYaku(hand14, context('3s', true)).candidates
    .some(candidate => candidate.yaku.some(yaku => yaku.id === 'suuankou')), false, 'ron shanpon is not suuankou');
});

test('Issue #37: kokushi and chuuren inspect the thirteen pre-win tiles, not only the final hand', () => {
  const kokushi = hand('119m', '19p', '19s', '1234567z');
  assert.equal(yakuCount(kokushi, context('1m', true), 'kokushi-musou'), 2);
  assert.equal(yakuCount(kokushi, context('9m', true), 'kokushi-musou'), 1,
    'same completed hand is a single wait when the pre-win hand has a duplicate');

  const chuuren = hand('11123456789995m');
  assert.equal(yakuCount(chuuren, context('5m', true), 'chuuren-poutou'), 2);
  assert.equal(yakuCount(chuuren, context('1m', true), 'chuuren-poutou'), 1,
    'same completed nine-gates hand is not pure when the pre-win hand is not the base');
});

test('Issue #37: daisushi doubles, shousuushi and other yakuman do not', () => {
  const small = hand('111z', '222z', '333z', '44z', '123m');
  const smallAnalysis = analyzeYaku(small, context('3m', true));
  assert.equal(smallAnalysis.candidates.flatMap(candidate => candidate.yaku).find(yaku => yaku.id === 'shousuushii')?.yakuman, 1);
  assert.equal(smallAnalysis.candidates.flatMap(candidate => candidate.yaku).some(yaku => yaku.id === 'daisuushii'), false);

  const tenhou = analyzeYaku(hand('111m', '222p', '333s', '444z', '55z'),
    context('5z', true, 'tsumo', { tenhou: true }));
  assert.equal(tenhou.candidates.flatMap(candidate => candidate.yaku).find(yaku => yaku.id === 'tenhou')?.yakuman, 1);
});

test('Issue #37: different yakuman add their individual multipliers and preserve exact totals', () => {
  const tiles = hand('222z', '333z', '444z', '55z');
  const fixed: WinningMeld[] = [{ type: 'triplet', tile: kind('1z'), concealed: false }];
  const candidate = analyzeYaku(tiles, context('5z', true, 'ron', { openMelds: fixed, isClosed: false }))
    .candidates.find(entry => entry.yaku.some(yaku => yaku.id === 'daisuushii'))!;
  assert.deepEqual(candidate.yaku.map(entry => [entry.id, entry.yakuman]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    [['daisuushii', 2], ['tsuuiisou', 1]]);
  assert.equal(candidate.yakumanCount, 3);
  assert.equal(candidate.yaku.filter(entry => entry.id === 'daisuushii').length, 1);

  const score = (winnerId: 0 | 1, dealerId: 0 | 1, method: 'ron' | 'tsumo', count: number) => calculateScore({
    totalHanIncludingDora: 0, fu: null, yakumanCount: count, winnerId, dealerId, winMethod: method,
    ...(method === 'ron' ? { discarderId: winnerId === 0 ? 1 : 0 } : {}),
  });
  for (const winnerId of [0, 1] as const) for (const dealerId of [0, 1] as const)
    for (const method of ['ron', 'tsumo'] as const) for (const count of [1, 2, 3, 5]) {
      const result = score(winnerId, dealerId, method, count);
      assert.equal(result.basePoints, 8000 * count);
      assert.equal(result.scoreTier, 'yakuman');
      assert.equal(result.payments.reduce((sum, payment) => sum + payment.points, 0), result.totalPoints);
    }
  assert.equal(score(1, 0, 'ron', 3).payments[0].points, 96000);
});

test('Issue #37: CPU scoring, honba, deposits, and online public result use the same v5 rule snapshot', () => {
  const rules = { ...DEFAULT_GAME_RULES, doubleYakuman: true };
  const game = { ...cpuTsumoGame(1, ['111m', '222p', '333s', '444z', '55z']), rules };
  const winner = evaluateWin(game, 1, game.players[1].drawnTile!, 'tsumo')!;
  assert.equal(winner.yakumanCount, 2);
  assert.equal(winner.totalPoints, 64000);
  assert.equal(winner.candidate.yaku.find(yaku => yaku.id === 'suuankou')?.yakuman, 2);
  const ended = updateMatchGame({ ...startMatch(game, rules), honba: 2, points: [25000, 24000, 25000, 25000], depositSticks: 1 }, declareTsumo(game, 1));
  assert.equal(ended.lastSettlement?.reason, 'tsumo');
  assert.equal(ended.lastSettlement?.payments.reduce((sum, payment) => sum + payment.honbaPoints, 0), 600);
  assert.equal(ended.lastSettlement?.deposits?.points, 1000);
  assert.equal(ended.lastSettlement?.after.reduce((sum, points) => sum + points, 0), 100000);

  const identities = [0, 1, 2, 3].map(seat => ({
    seat: seat as 0 | 1 | 2 | 3, name: 'Player ' + seat,
    control: seat === 0 ? 'human' as const : 'cpu' as const, connected: seat === 0,
  })) as unknown as OnlineGameSession['identities'];
  const onlineSession = startOnlineGame(identities, 0, () => 0.999999, rules);
  const settledSession: OnlineGameSession = { ...onlineSession, match: ended, status: 'round-ended' };
  const view = createPlayerGameView(settledSession, 0, 'ABC234', new Set([0]));
  const publicWinner = view.result!.winners[0];
  assert.equal(publicWinner.yakumanCount, winner.yakumanCount);
  assert.equal(publicWinner.totalPoints, winner.totalPoints);
  assert.equal(publicWinner.yaku.find(yaku => yaku.id === 'suuankou')?.yakuman, 2);
  assert.deepEqual(view.rules, rules);
});

test('Issue #37: online server action calculates and publishes multiplier from its confirmed rules', () => {
  const rules = { ...DEFAULT_GAME_RULES, doubleYakuman: true };
  const identities = [0, 1, 2, 3].map(seat => ({
    seat: seat as 0 | 1 | 2 | 3, participantSeat: seat as 0 | 1 | 2 | 3,
    name: 'Player ' + seat, control: seat === 0 ? 'human' as const : 'cpu' as const,
    connected: seat === 0,
  })) as unknown as OnlineGameSession['identities'];
  const started = startOnlineGameWithSeatAssignment(identities, 0, rules, () => 0.999999);
  const fixture = createIssue37WinningState(ISSUE37_TEST_HANDS.kokushiThirteen.groups,
    ISSUE37_TEST_HANDS.kokushiThirteen.winning, 0);
  const game = { ...fixture, players: fixture.players.map(player => ({
    ...player, control: identities[player.id].control,
  })) as typeof fixture.players, rules };
  const session: OnlineGameSession = {
    ...started, gameRevision: 1, match: startMatch(game, rules), status: 'playing',
  };
  const clientActionWithForgedMultiplier = {
    type: 'declare-tsumo', requestId: 'issue37-server-score', expectedGameRevision: 1, yakumanCount: 99,
  } as unknown as Parameters<typeof applyOnlineGameAction>[2];
  const ended = applyOnlineGameAction(session, 0, clientActionWithForgedMultiplier, new Set([0]), 5000);
  assert.equal(ended.status, 'round-ended');
  assert.equal(ended.match.lastSettlement?.reason, 'tsumo');
  const view = createPlayerGameView(ended, 0, 'ABC234', new Set([0]));
  assert.equal(view.result?.winners[0].yakumanCount, 2);
  assert.equal(view.result?.winners[0].totalPoints, 96000);
  assert.equal(view.result?.winners[0].yaku.find(yaku => yaku.id === 'kokushi-musou')?.yakuman, 2);
});
