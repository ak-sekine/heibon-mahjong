import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { deal } from '../src/game/deal.ts';
import { getWaitingTileKinds } from '../src/game/ron.ts';
import { discardTile } from '../src/game/discard.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId, PlayerState } from '../src/model/game.ts';

export const RON_HANDS = [
  ['123m', '456m', '789p', '22p', '34s'],
  ['123p', '456p', '789s', '22m', '34s'],
  ['123s', '456m', '789m', '22s', '34s'],
];
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
/** Construct all scenarios by arranging a real complete 136-tile wall. */
export function ronStart(discarder: PlayerId = 1, winners: readonly PlayerId[] = [0],
  hands: readonly (readonly string[])[] = RON_HANDS, winningKey = 'sou-5', red = true, indicator = 'sou-4', openingHuman = false): GameState {
  const pool = shuffle(createWall(), seeded(139));
  const take = (key: string, preferRed = false): PhysicalTile => {
    let index = pool.findIndex(t => tileKindKey(t.tile) === key && t.tile.isRed === preferRed);
    if (index < 0) index = pool.findIndex(t => tileKindKey(t.tile) === key);
    if (index < 0) throw new RangeError(`Invalid ron fixture: ${key}`);
    return pool.splice(index, 1)[0];
  };
  const wall: (PhysicalTile | undefined)[] = Array(136);
  const winning = take(winningKey, red);
  const dealer = openingHuman ? 0 : discarder;
  const waits = new Set<string>();
  winners.forEach((id, index) => {
    const tiles = hands[index % hands.length].flatMap(g => [...g.slice(0, -1)].map(n => take(tileKindKey(TILE_KINDS[
      ({ m: 0, p: 9, s: 18, z: 27 }[g.at(-1)!]!) + Number(n) - 1]))));
    if (tiles.length !== 13) throw new RangeError('Fixture hand requires thirteen tiles');
    getWaitingTileKinds(tiles.map(t => t.tile)).forEach(k => waits.add(tileKindKey(k)));
    tiles.forEach((tile, round) => { wall[round * 4 + (id - dealer + 4) % 4] = tile; });
  });
  wall[openingHuman ? 52 + discarder : 52] = winning;
  if (openingHuman && discarder !== 0) {
    for (let index = 52; index < 52 + discarder; index++) {
      const safe = pool.findIndex(t => !waits.has(tileKindKey(t.tile)));
      wall[index] = pool.splice(safe, 1)[0];
    }
  }
  wall[126] = take(indicator);
  for (let i = 0; i < 136; i++) if (!wall[i]) wall[i] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]), dealer);
}
export function ronGame(discarder: PlayerId = 1, winners: readonly PlayerId[] = [0],
  hands?: readonly (readonly string[])[], winningKey?: string, red?: boolean, indicator?: string): GameState {
  const game = ronStart(discarder, winners, hands, winningKey, red, indicator);
  return discardTile(game, discarder, game.players[discarder].drawnTile!.id);
}
/** A past own discard, moved from the live wall rather than copied. */
export function withRiverTile(game: GameState, playerId: PlayerId, key: string): GameState {
  const tile = game.liveWall.find(t => tileKindKey(t.tile) === key && !t.tile.isRed);
  if (!tile) throw new RangeError('Missing fixture river tile');
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = { ...players[playerId], river:[...players[playerId].river,tile] };
  return { ...game, players, liveWall:game.liveWall.filter(t => t !== tile) };
}
