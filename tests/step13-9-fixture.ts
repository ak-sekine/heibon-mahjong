import { getWaitingTileKinds } from '../src/game/ron.ts';
import { drawTile } from '../src/game/draw.ts';
import { deal } from '../src/game/deal.ts';
import { kanGame } from './kan-fixture.ts';
import { setupDiscard } from './setup-discard.ts';
import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey } from '../src/model/tile.ts';
import type { GameState, OpenMeld, PhysicalTile, PlayerId, PlayerState } from '../src/model/game.ts';
import type { WinningMeld } from '../src/analysis/winning-shape.ts';

const starts = { m: 0, p: 9, s: 18, z: 27 } as const;
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function groupKinds(group: string) {
  const suit = group.at(-1)! as keyof typeof starts;
  return [...group.slice(0, -1)].map(rank => TILE_KINDS[starts[suit] + Number(rank) - 1]);
}
function groupKeys(groups: readonly string[]): string[] { return groups.flatMap(group => groupKinds(group).map(tileKindKey)); }
function seatSlots(id: PlayerId, dealerId: PlayerId): number[] {
  const offset = (id - dealerId + 4) % 4;
  return Array.from({ length: 13 }, (_, round) => round * 4 + offset);
}
function concealedKeys(winner: FinalDiscardWinner): string[] {
  const remaining = groupKeys(winner.hand);
  if (winner.openChi) for (const key of groupKinds(winner.openChi).map(tileKindKey)) {
    const index = remaining.indexOf(key);
    if (index < 0) throw new RangeError(`Open meld ${winner.openChi} is not in the hand`);
    remaining.splice(index, 1);
  }
  return remaining;
}
function fixedMelds(winner: FinalDiscardWinner): WinningMeld[] {
  if (!winner.openChi) return [];
  const tiles = groupKinds(winner.openChi);
  return [{ type: 'sequence', tiles: tiles as [typeof tiles[number], typeof tiles[number], typeof tiles[number]] }];
}

export interface FinalDiscardWinner {
  readonly id: PlayerId;
  /** The full 13-tile hand before an optional chi is moved into an open meld. */
  readonly hand: readonly string[];
  readonly openChi?: string;
}
export interface FinalDiscardOptions {
  readonly dealerId: PlayerId;
  readonly winners?: readonly FinalDiscardWinner[];
  readonly winningKey: string;
  readonly drawKey?: string;
  readonly discardKey?: string;
  readonly indicatorKey?: string;
  readonly seed?: number;
}

function buildFinalDiscard(options: FinalDiscardOptions, seed: number): GameState | null {
  const { dealerId, winners = [], winningKey } = options;
  const discarderId = ((dealerId + 1) % 4) as PlayerId;
  if (winners.some(winner => winner.id === dealerId || winner.id === discarderId || groupKeys(winner.hand).length !== 13)) return null;

  const pool = shuffle(createWall(), seeded(seed));
  const take = (key: string): PhysicalTile => {
    const index = pool.findIndex(tile => tileKindKey(tile.tile) === key);
    if (index < 0) throw new RangeError(`Missing fixture tile ${key}`);
    return pool.splice(index, 1)[0];
  };
  const wall: (PhysicalTile | undefined)[] = Array(136);
  for (const winner of winners) {
    groupKeys(winner.hand).forEach((key, index) => { wall[seatSlots(winner.id, dealerId)[index]] = take(key); });
  }
  if (options.discardKey) {
    const slot = seatSlots(discarderId, dealerId).find(index => wall[index] === undefined);
    if (slot === undefined) return null;
    wall[slot] = take(options.discardKey);
  }
  wall[121] = take(options.drawKey ?? winningKey);
  wall[126] = take(options.indicatorKey ?? 'man-9');

  const waitKeys = new Set(winners.flatMap(winner => getWaitingTileKinds(
    concealedKeys(winner).map(key => ordinaryTile(TILE_KINDS.find(kind => tileKindKey(kind) === key)!)), fixedMelds(winner),
  ).map(tileKindKey)));
  if (winners.some(winner => !waitKeys.has(winningKey))) return null;
  const deadSlots = Array.from({ length: 14 }, (_, index) => 122 + index).filter(index => index !== 126);
  for (const key of waitKeys) while (pool.some(tile => tileKindKey(tile.tile) === key)) {
    const slot = deadSlots.shift();
    if (slot === undefined) return null;
    wall[slot] = take(key);
  }
  for (let index = 0; index < wall.length; index++) if (!wall[index]) wall[index] = pool.shift()!;

  let game = deal(reserveDeadWall(wall as PhysicalTile[]), dealerId);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  for (const winner of winners) {
    if (!winner.openChi) continue;
    const player = players[winner.id];
    const selected: PhysicalTile[] = [];
    for (const key of groupKeys([winner.openChi])) {
      const tile = player.hand.find(candidate => tileKindKey(candidate.tile) === key && !selected.some(used => used.id === candidate.id));
      if (!tile) throw new RangeError(`Missing open meld tile ${key}`);
      selected.push(tile);
    }
    const meld: OpenMeld = { type: 'chi', tiles: selected as [PhysicalTile, PhysicalTile, PhysicalTile],
      calledTileId: selected[1].id, fromPlayerId: ((winner.id + 1) % 4) as PlayerId };
    players[winner.id] = { ...player, hand: player.hand.filter(tile => !selected.some(used => used.id === tile.id)), melds: [meld] };
  }
  game = { ...game, players, callsMade: winners.some(winner => Boolean(winner.openChi)) };

  for (let offset = 0; offset < 4; offset++) {
    const id = ((dealerId + offset) % 4) as PlayerId;
    const player = game.players[id];
    if (winners.some(winner => winner.id === player.id)) continue;
    if (getWaitingTileKinds(player.hand.map(tile => tile.tile)).length) return null;
  }

  game = setupDiscard(game, dealerId, game.players[dealerId].drawnTile!.id);
  while (game.liveWall.length > 1) {
    game = drawTile(game, game.turnPlayerId);
    game = setupDiscard(game, game.turnPlayerId, game.players[game.turnPlayerId].drawnTile!.id);
  }
  return drawTile(game, game.turnPlayerId);
}

/** Builds a complete 136-tile wall, then reaches its actual final live-wall draw. */
export function finalDiscardGame(options: FinalDiscardOptions): GameState {
  for (let seed = options.seed ?? 701; seed < (options.seed ?? 701) + 500; seed++) {
    const game = buildFinalDiscard(options, seed);
    if (game) return game;
  }
  throw new RangeError('Unable to arrange a final-discard fixture without unrelated tenpai hands');
}

/** A real final live-wall draw for an open hand that otherwise has no yaku. */
export function openHaiteiGame(redWinningTile = false): GameState {
  const initial = kanGame({
    hands: { 0: redWinningTile ? ['123p', '456s', '789m', '5m'] : ['123p', '456s', '789m', '2p'] },
    melds: { 0: [{ type: 'chi', group: '234m', from: 3 }] },
    draw: redWinningTile ? 'red:man-5' : 'pin-2', indicators: redWinningTile ? ['man-4'] : ['man-9'],
  });
  const original = initial.players[0].drawnTile!;
  const players = [...initial.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[0] = { ...players[0], drawnTile: null, drawnTileSource: null };
  for (const [index, tile] of initial.liveWall.entries()) {
    const id = (index % 4) as PlayerId;
    players[id] = { ...players[id], river: [...players[id].river, tile], discardHistory: [...(players[id].discardHistory ?? players[id].river), tile] };
  }
  const beforeDraw = { ...initial, players, liveWall: [original], phase: 'awaiting-draw' as const, turnPlayerId: 0 as PlayerId };
  return drawTile(beforeDraw, 0);
}

/** Leave one real live tile for kan replacement; all other tiles stay in rivers. */
export function oneLiveTileForKan(game: GameState): GameState {
  if (!game.liveWall.length) throw new RangeError('Kan fixture requires a live tile');
  const last = game.liveWall.at(-1)!;
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  for (const [index, tile] of game.liveWall.slice(0, -1).entries()) {
    const id = (index % 4) as PlayerId;
    players[id] = { ...players[id], river: [...players[id].river, tile], discardHistory: [...(players[id].discardHistory ?? players[id].river), tile] };
  }
  return { ...game, players, liveWall: [last] };
}
