import { deal } from '../game/deal.ts';
import { reserveDeadWall, createWall } from '../game/wall.ts';
import type { GameState, PhysicalTile, PlayerId } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';

export interface TestScenario {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly targetPlayerId: PlayerId;
  readonly generateInitialGameState: () => GameState;
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

export const testScenarios: readonly TestScenario[] = targetNames.map((name, targetPlayerId) => ({
  id: `kyuushu-${targetPlayerId === 0 ? 'self' : `cpu${targetPlayerId}`}`,
  displayName: `九種九牌（${name}）`,
  description: targetPlayerId === 0
    ? '自分が親の第一ツモ状態です。「九種九牌」を押して宣言します。'
    : `${name}を親の第一ツモ状態にし、既存のCPU自動宣言処理を確認します。`,
  targetPlayerId: targetPlayerId as PlayerId,
  generateInitialGameState: () => createKyuushuGame(targetPlayerId as PlayerId),
}));

export function getTestScenario(id: string): TestScenario {
  const scenario = testScenarios.find(item => item.id === id);
  if (!scenario) throw new RangeError(`Unknown test scenario: ${id}`);
  return scenario;
}
