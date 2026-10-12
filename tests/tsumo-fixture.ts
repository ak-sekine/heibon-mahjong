import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile } from '../src/model/game.ts';
import type { Suit } from '../src/model/tile.ts';

export const STANDARD = ['234m', '345p', '678s', '222p', '66m'];
export const RED_PINFU = ['123m', '456m', '789p', '22p', '456s'];
/** A legal fixed wall: no fabricated tiles, IDs, red fives or missing inventory. */
export function tsumoStart(groups = STANDARD, last = false, redSuits: readonly Suit[] = ['man', 'pin', 'sou'], indicatorKey?: string): GameState {
  const pool = createWall();
  const kinds = groups.flatMap(g => [...g.slice(0, -1)].map(n => TILE_KINDS[
    ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1]));
  const take = (key: string, allowRed = false): PhysicalTile => {
    const index = pool.findIndex(p => tileKindKey(p.tile) === key &&
      (allowRed || !p.tile.isRed || (p.tile.category === 'suited' && redSuits.includes(p.tile.suit))));
    if (index < 0) throw new RangeError('Invalid fixture');
    return pool.splice(index, 1)[0];
  };
  const desired = kinds.map(k => take(tileKindKey(k)));
  const winning = desired.pop()!;
  const wall: (PhysicalTile | undefined)[] = Array(136);
  if (indicatorKey) wall[126] = take(indicatorKey, true);
  // Dealer 3 gives the human the last live draw after 69 discards.
  const offset = last ? 1 : 0;
  desired.forEach((tile, round) => { wall[round * 4 + offset] = tile; });
  wall[last ? 121 : 56] = winning;
  // For standard fixtures, a later draw can restore the same winning face.
  if (!last) {
    const copy = pool.find(p => tileKindKey(p.tile) === tileKindKey(winning.tile));
    if (copy) wall[60] = take(tileKindKey(copy.tile));
  }
  for (let i = 0; i < wall.length; i++) if (!wall[i]) wall[i] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]), last ? 3 : 0);
}
export function tsumoGame(groups = STANDARD, last = false, redSuits: readonly Suit[] = ['man', 'pin', 'sou'], indicatorKey?: string): GameState {
  let game = tsumoStart(groups, last, redSuits, indicatorKey);
  const count = last ? 69 : 4;
  for (let i = 0; i < count; i++) {
    game = discardTile(game, game.turnPlayerId, game.players[game.turnPlayerId].drawnTile!.id);
    game = drawTile(game, game.turnPlayerId);
  }
  return game;
}
