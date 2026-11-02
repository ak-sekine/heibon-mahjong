import { deal } from '../game/deal.ts';
import { reserveDeadWall, createWall } from '../game/wall.ts';
import type { GameState, PhysicalTile, PlayerId } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';
import { createIssue37WinningState, ISSUE37_TEST_HANDS } from './issue37-fixtures.ts';

export interface TestScenario {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly targetPlayerId: PlayerId;
  readonly generateInitialGameState: (targetPlayerId?: PlayerId) => GameState;
  readonly immediateTsumo?: boolean;
}

const initialKinds = [
  'man-1', 'man-9', 'pin-1', 'pin-9', 'sou-1', 'sou-9',
  'east', 'south', 'west', 'man-2', 'man-3', 'man-4', 'pin-2', 'pin-3',
] as const;

/** Deterministic, physically valid wall ordering. The selected player is the dealer,
 * so their 14th tile is the legal initial extra tile (first turn). */
function createKyuushuGame(dealerId: PlayerId): GameState {
  const wall = createWall();
  const selected: PhysicalTile[] = [];
  for (const kind of initialKinds) {
    const tile = wall.find(candidate => tileKindKey(candidate.tile) === kind && !selected.some(item => item.id === candidate.id));
    if (!tile) throw new RangeError(`Fixture tile is missing: ${kind}`);
    selected.push(tile);
  }
  const ordered = new Array<PhysicalTile>(136);
  for (let index = 0; index < 13; index++) ordered[index * 4] = selected[index];
  ordered[52] = selected[13];
  const used = new Set(selected.map(tile => tile.id));
  const remaining = wall.filter(tile => !used.has(tile.id));
  let cursor = 0;
  for (let index = 0; index < ordered.length; index++) {
    if (!ordered[index]) ordered[index] = remaining[cursor++];
  }
  return deal(reserveDeadWall(ordered), dealerId);
}

const targetNames = ['自分', 'CPU1', 'CPU2', 'CPU3'] as const;

const kyuushuScenarios: readonly TestScenario[] = targetNames.map((name, targetPlayerId) => ({
  id: `kyuushu-${targetPlayerId === 0 ? 'self' : `cpu${targetPlayerId}`}`,
  displayName: `九種九牌（${name}）`,
  description: targetPlayerId === 0
    ? '自分が親の第一ツモ状態です。「九種九牌」を押して宣言します。'
    : `${name}を親の第一ツモ状態にし、既存のCPU自動宣言処理を確認します。`,
  targetPlayerId: targetPlayerId as PlayerId,
  generateInitialGameState: () => createKyuushuGame(targetPlayerId as PlayerId),
}));

const issue37Scenarios: readonly TestScenario[] = ([
  ['issue37-suuankou-tanki', '四暗刻単騎', ISSUE37_TEST_HANDS.suuankouTanki],
  ['issue37-kokushi-thirteen', '国士無双十三面待ち', ISSUE37_TEST_HANDS.kokushiThirteen],
  ['issue37-kokushi-single', '国士無双単騎（対照）', ISSUE37_TEST_HANDS.kokushiSingle],
  ['issue37-chuuren-pure', '純正九蓮宝燈', ISSUE37_TEST_HANDS.chuurenPure],
  ['issue37-chuuren-normal', '九蓮宝燈（対照）', ISSUE37_TEST_HANDS.chuurenNormal],
  ['issue37-daisuushii', '大四喜', ISSUE37_TEST_HANDS.daisuushii],
  ['issue37-shousuushii', '小四喜（対照）', ISSUE37_TEST_HANDS.shousuushii],
] as const).map(([id, displayName, fixture]) => ({
  id,
  displayName,
  description: '役・設定・倍率・支払いを確認するための固定ツモ局面です。',
  targetPlayerId: 0 as PlayerId,
  immediateTsumo: true,
  generateInitialGameState: (targetPlayerId = 0 as PlayerId) =>
    createIssue37WinningState(fixture.groups, fixture.winning, targetPlayerId),
}));

export const testScenarios: readonly TestScenario[] = [...kyuushuScenarios, ...issue37Scenarios];

export function getTestScenario(id: string): TestScenario {
  const scenario = testScenarios.find(item => item.id === id);
  if (!scenario) throw new RangeError(`Unknown test scenario: ${id}`);
  return scenario;
}
