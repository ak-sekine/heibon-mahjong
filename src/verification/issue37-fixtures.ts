import { startGame } from '../game/start.ts';
import { TILE_KINDS, tileKindKey, type TileKind } from '../model/tile.ts';
import { createWall } from '../game/wall.ts';
import type { GameState, PlayerId, PhysicalTile } from '../model/game.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
function tileKinds(groups: readonly string[]): TileKind[] {
  return groups.flatMap(group => {
    const suit = group.at(-1)! as keyof typeof starts;
    return [...group.slice(0, -1)].map(rank => TILE_KINDS[starts[suit] + Number(rank) - 1]);
  });
}

/** Build an inventory-valid fixed tsumo position for the isolated test page. */
export function createIssue37WinningState(groups: readonly string[], winningCode: string, humanSeat: PlayerId): GameState {
  const desiredKinds = tileKinds(groups);
  const winningKind = tileKinds([winningCode])[0];
  const winningIndex = desiredKinds.findIndex(kind => tileKindKey(kind) === tileKindKey(winningKind));
  if (desiredKinds.length !== 14 || winningIndex < 0) throw new RangeError('Issue #37 test hand must contain fourteen tiles and the winning tile');
  const wall = [...createWall()];
  const hand: PhysicalTile[] = [];
  for (let index = 0; index < desiredKinds.length; index++) {
    const key = tileKindKey(desiredKinds[index]);
    const wallIndex = wall.findIndex(tile => tileKindKey(tile.tile) === key);
    if (wallIndex < 0) throw new RangeError('Issue #37 test tile inventory is exhausted');
    const [tile] = wall.splice(wallIndex, 1);
    hand.push(tile);
  }
  const winningTile = hand.splice(winningIndex, 1)[0];
  const playerHands = new Map<PlayerId, PhysicalTile[]>();
  let cursor = 0;
  for (const seat of [0, 1, 2, 3] as const) {
    if (seat === humanSeat) playerHands.set(seat, hand);
    else {
      playerHands.set(seat, wall.splice(0, 13));
      cursor += 13;
    }
  }
  if (cursor !== 39 || wall.length !== 83) throw new RangeError('Issue #37 test wall has an invalid inventory');
  const base = startGame(() => 0, humanSeat, 'east');
  const players = base.players.map(player => ({
    ...player,
    control: player.id === humanSeat ? 'human' as const : 'cpu' as const,
    hand: playerHands.get(player.id)!,
    melds: [],
    river: [],
    discardHistory: [],
    drawnTile: player.id === humanSeat ? winningTile : null,
    drawnTileSource: player.id === humanSeat ? 'live-wall' as const : null,
    riichi: null,
    temporaryFuriten: false,
  })) as unknown as GameState['players'];
  return {
    ...base,
    players,
    dealerId: humanSeat,
    turnPlayerId: humanSeat,
    roundWind: 'east',
    phase: 'awaiting-discard',
    pendingRiichi: null,
    ronWindow: null,
    winResult: null,
    callsMade: false,
    liveWall: wall.slice(0, 69),
    deadWall: wall.slice(69),
  };
}

export const ISSUE37_TEST_HANDS = {
  suuankouTanki: { groups: ['111m', '222p', '333s', '444z', '55z'], winning: '5z' },
  kokushiThirteen: { groups: ['119m', '19p', '19s', '1234567z'], winning: '1m' },
  kokushiSingle: { groups: ['119m', '19p', '19s', '1234567z'], winning: '9m' },
  chuurenPure: { groups: ['11123456789995m'], winning: '5m' },
  chuurenNormal: { groups: ['11123456789995m'], winning: '1m' },
  daisuushii: { groups: ['111z', '222z', '333z', '444z', '55m'], winning: '5m' },
  shousuushii: { groups: ['111z', '222z', '333z', '44z', '123m'], winning: '3m' },
} as const;
