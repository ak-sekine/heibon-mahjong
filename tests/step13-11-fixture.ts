import { arrangedDeal } from './step13-10-fixture.ts';
import { tileKindKey } from '../src/model/tile.ts';
import type { GameState, PhysicalTile, PlayerId, PlayerState } from '../src/model/game.ts';

export interface FirstTurnHand {
  readonly hand: readonly string[];
  readonly draw: string;
}

export const FIRST_TURN_HANDS = {
  standard: {
    hand: ['man-1','man-2','man-3','man-4','man-5','man-6','pin-7','pin-8','pin-9','sou-1','sou-2','sou-3','east'],
    draw: 'east',
  },
  kokushi: {
    hand: ['man-1','man-9','pin-1','pin-9','sou-1','sou-9','east','south','west','north','white','green','red'],
    draw: 'man-1',
  },
  suuankou: {
    hand: ['man-1','man-1','man-1','pin-2','pin-2','pin-2','sou-3','sou-3','sou-3','sou-8','sou-8','sou-8','white'],
    draw: 'white',
  },
  sevenPairs: {
    hand: ['man-1','man-1','man-2','man-2','pin-3','pin-3','pin-4','pin-4','sou-5','sou-5','sou-6','sou-6','red'],
    draw: 'red',
  },
  chuuren: {
    hand: ['man-1','man-1','man-1','man-2','man-3','man-4','man-5','man-6','man-7','man-8','man-9','man-9','man-9'],
    draw: 'man-5',
  },
  honorsSevenPairs: {
    hand: ['east','south','south','west','west','north','north','white','white','green','green','red','red'],
    draw: 'east',
  },
  honorsDaisangen: {
    hand: ['white','white','white','green','green','green','red','red','red','east','east','east','south'],
    draw: 'south',
  },
} as const satisfies Record<string, FirstTurnHand>;

function arrangedFor(playerId: PlayerId, shape: FirstTurnHand, seed: number, dealerId: PlayerId,
  firstDrawKinds: Partial<Record<PlayerId, string>> = {}): GameState {
  const handKinds: Partial<Record<PlayerId, readonly string[]>> = {};
  handKinds[playerId] = shape.hand;
  firstDrawKinds[playerId] = shape.draw;
  return arrangedDeal({ dealerId, handKinds, firstDrawKinds, seed });
}

export function tenhouGame(playerId: PlayerId = 0, shape: FirstTurnHand = FIRST_TURN_HANDS.standard,
  seed = 1301 + playerId): GameState {
  return arrangedFor(playerId, shape, seed, playerId);
}

/** Construct the state at each child's first live-wall draw from a full arranged deal. */
export function chiihouGame(playerId: PlayerId, shape: FirstTurnHand = FIRST_TURN_HANDS.standard,
  seed = 1401 + playerId, dealerId: PlayerId = 0): GameState {
  if (playerId === dealerId) throw new RangeError('Chiihou requires a child seat');
  const firstDrawKinds: Partial<Record<PlayerId, string>> = { [dealerId]: 'man-8' };
  const dealt = arrangedFor(playerId, shape, seed, dealerId, firstDrawKinds);
  const players = [...dealt.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  const dealer = players[dealerId];
  const firstDiscard = dealer.drawnTile!;
  players[dealerId] = { ...dealer, drawnTile: null, drawnTileSource: null,
    river: [...dealer.river, firstDiscard], discardHistory: [...dealer.discardHistory!, firstDiscard] };

  let drawsUsed = 0;
  const distance = (playerId - dealerId + 4) % 4;
  for (let offset = 1; offset < distance; offset++) {
    const id = ((dealerId + offset) % 4) as PlayerId;
    const priorDraw = dealt.liveWall[drawsUsed++];
    const player = players[id];
    players[id] = { ...player, river: [...player.river, priorDraw],
      discardHistory: [...player.discardHistory!, priorDraw] };
  }
  const draw = dealt.liveWall[drawsUsed++];
  if (tileKindKey(draw.tile) !== shape.draw) throw new RangeError('Arranged first draw is out of order');
  players[playerId] = { ...players[playerId], drawnTile: draw, drawnTileSource: 'live-wall' };
  return { ...dealt, players, liveWall: dealt.liveWall.slice(drawsUsed),
    turnPlayerId: playerId, phase: 'awaiting-discard', ronWindow: null };
}

function swapWallTileToIndex(wall: PhysicalTile[], index: number, key: string): boolean {
  const source = wall.findIndex((tile, position) => position >= index && tileKindKey(tile.tile) === key);
  if (source < 0) return false;
  [wall[index], wall[source]] = [wall[source], wall[index]];
  return true;
}

function keepWallPrefixWithout(wall: PhysicalTile[], length: number, key: string): boolean {
  for (let index = 0; index < length; index++) {
    if (tileKindKey(wall[index].tile) !== key) continue;
    const source = wall.findIndex((tile, position) => position >= length && tileKindKey(tile.tile) !== key);
    if (source < 0) return false;
    [wall[index], wall[source]] = [wall[source], wall[index]];
  }
  return true;
}

function discardDraw(player: PlayerState, tile: PhysicalTile): PlayerState {
  return { ...player, drawnTile: null, drawnTileSource: null,
    river: [...player.river, tile], discardHistory: [...(player.discardHistory ?? player.river), tile] };
}

/** A normal dealer tsumo after the initial deal tile was discarded. */
export function dealerSecondTurnGame(shape: FirstTurnHand = FIRST_TURN_HANDS.standard, seedStart = 1501): GameState {
  for (let seed = seedStart; seed < seedStart + 300; seed++) {
    const dealt = tenhouGame(0, shape, seed);
    const wall = [...dealt.liveWall];
    if (!keepWallPrefixWithout(wall, 3, shape.draw) || !swapWallTileToIndex(wall, 3, shape.draw)) continue;
    const players = [...dealt.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
    players[0] = discardDraw(players[0], players[0].drawnTile!);
    for (const id of [1,2,3] as const) players[id] = discardDraw(players[id], wall[id - 1]);
    const draw = wall[3];
    players[0] = { ...players[0], drawnTile: draw, drawnTileSource: 'live-wall' };
    return { ...dealt, players, liveWall: wall.slice(4), phase: 'awaiting-discard', turnPlayerId: 0 };
  }
  throw new RangeError('Unable to arrange a second dealer draw');
}

/** A legal no-call turn cycle to the child's second draw, still waiting on east. */
export function chiihouSecondTurnGame(): GameState {
  for (let seed = 1801; seed < 2201; seed++) {
    const dealt = arrangedFor(1, FIRST_TURN_HANDS.standard, seed, 0, { 0: 'man-8', 1: 'man-9' });
    const wall = [...dealt.liveWall];
    if (!keepWallPrefixWithout(wall, 4, 'east') || !swapWallTileToIndex(wall, 4, 'east')) continue;
    const players = [...dealt.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
    players[0] = discardDraw(players[0], players[0].drawnTile!);
    players[1] = discardDraw(players[1], wall[0]);
    players[2] = discardDraw(players[2], wall[1]);
    players[3] = discardDraw(players[3], wall[2]);
    players[0] = discardDraw(players[0], wall[3]);
    const draw = wall[4];
    if (tileKindKey(draw.tile) !== 'east') continue;
    players[1] = { ...players[1], drawnTile: draw, drawnTileSource: 'live-wall' };
    return { ...dealt, players, liveWall: wall.slice(5), phase: 'awaiting-discard', turnPlayerId: 1 };
  }
  throw new RangeError("Unable to arrange a child's second draw");
}
