import { TILE_KINDS, ordinaryTile, redFive, tileKindKey } from '../model/tile.ts';
import type { PhysicalTile, WallState } from '../model/game.ts';

export function createWall(): PhysicalTile[] {
  return TILE_KINDS.flatMap(kind => Array.from({ length: 4 }, (_, copy) => ({
    id: `${tileKindKey(kind)}-${copy}`,
    tile: kind.category === 'suited' && kind.rank === 5 && copy === 0
      ? redFive(kind.suit) : ordinaryTile(kind),
  })));
}

/** Reserve the tail for future dora/rinshan use, without mutating the input. */
export function reserveDeadWall(wall: readonly PhysicalTile[]): WallState {
  if (wall.length !== 136) throw new RangeError('A starting wall must contain 136 tiles');
  return { liveWall: wall.slice(0, 122), deadWall: wall.slice(122) };
}
