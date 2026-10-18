import { deal } from '../src/game/deal.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { getWaitingTileKinds } from '../src/game/ron.ts';
import { startGame } from '../src/game/start.ts';
import { isTerminalOrHonor } from '../src/game/special-draws.ts';
import { createWall, reserveDeadWall } from '../src/game/wall.ts';
import { shuffle } from '../src/game/shuffle.ts';
import { TILE_KINDS, tileKindKey } from '../src/model/tile.ts';
import type { GameState, OpenMeld, PhysicalTile, PlayerId, PlayerState } from '../src/model/game.ts';
import { fixedRound } from './match-fixture.ts';
import { setupDiscard } from './setup-discard.ts';

const ids: readonly PlayerId[] = [0, 1, 2, 3];
const orphanKinds = ['man-1','man-9','pin-1','pin-9','sou-1','sou-9','east','south','west','north','white','green','red'] as const;
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

export interface ArrangedDealOptions {
  readonly dealerId?: PlayerId;
  readonly handKinds?: Partial<Record<PlayerId, readonly string[]>>;
  /** First draw: dealer is slot 52; other seats follow in live-wall order. */
  readonly firstDrawKinds?: Partial<Record<PlayerId, string>>;
  readonly seed?: number;
}

/** Arrange a complete physical wall first; all later state transitions keep its IDs. */
export function arrangedDeal(options: ArrangedDealOptions = {}): GameState {
  const dealerId = options.dealerId ?? 0;
  const pool = shuffle(createWall(), seeded(options.seed ?? 1));
  const wall: (PhysicalTile | undefined)[] = Array(136);
  const take = (key: string): PhysicalTile => {
    const index = pool.findIndex(tile => tileKindKey(tile.tile) === key);
    if (index < 0) throw new RangeError(`Fixture needs an unavailable copy of ${key}`);
    return pool.splice(index, 1)[0];
  };
  const place = (slot: number, key: string) => {
    if (wall[slot]) throw new RangeError(`Fixture slot ${slot} is already occupied`);
    wall[slot] = take(key);
  };
  for (const id of ids) {
    const kinds = options.handKinds?.[id] ?? [];
    if (kinds.length > 13) throw new RangeError('A dealt hand cannot exceed thirteen tiles');
    const offset = (id - dealerId + 4) % 4;
    kinds.forEach((key, round) => place(round * 4 + offset, key));
    const drawKind = options.firstDrawKinds?.[id];
    if (drawKind) place(id === dealerId ? 52 : 53 + offset - 1, drawKind);
  }
  for (let index = 0; index < wall.length; index++) if (!wall[index]) wall[index] = pool.shift()!;
  return deal(reserveDeadWall(wall as PhysicalTile[]), dealerId);
}

export function parentKyuushuGame(orphanCount = 9, seed = 101): GameState {
  if (orphanCount < 0 || orphanCount > 13) throw new RangeError('Invalid orphan count');
  const keys = [...orphanKinds.slice(0, orphanCount), 'man-2','pin-3','sou-4','man-6','pin-6'].slice(0, 13);
  const draw = orphanCount >= 9 ? 'pin-6' : 'man-2';
  return arrangedDeal({ handKinds: { 0: keys }, firstDrawKinds: { 0: draw }, seed });
}

export function childKyuushuGame(orphanCount = 9, winningDraw = false, seed = 107): GameState {
  if (orphanCount < 0 || orphanCount > 13) throw new RangeError('Invalid orphan count');
  const keys = [...orphanKinds.slice(0, orphanCount), 'man-2','pin-3','sou-4','man-6','pin-6'].slice(0, 13);
  if (winningDraw) return childKokushiGame(seed);
  const draw = orphanCount >= 9 ? 'pin-6' : 'man-2';
  const dealt = arrangedDeal({ handKinds: { 1: keys }, firstDrawKinds: { 1: draw }, seed });
  const afterDealerDiscard = setupDiscard(dealt, 0, dealt.players[0].drawnTile!.id);
  return drawTile(afterDealerDiscard, 1);
}

export function childKokushiGame(seed = 113): GameState {
  const dealt = arrangedDeal({ handKinds: { 1: orphanKinds }, firstDrawKinds: { 1: 'east' }, seed });
  return drawTile(setupDiscard(dealt, 0, dealt.players[0].drawnTile!.id), 1);
}

export function childKyuushuKanGame(seed = 127): GameState {
  const hand = ['man-1','man-1','man-1',...orphanKinds.filter(key => key !== 'man-1').slice(0,8),'man-2','pin-3'];
  const dealt = arrangedDeal({ handKinds:{1:hand}, firstDrawKinds:{1:'man-1'}, seed });
  return drawTile(setupDiscard(dealt,0,dealt.players[0].drawnTile!.id),1);
}

function playFirstFour(drawKinds: readonly [string,string,string,string], seed: number): GameState | null {
  const dealt = arrangedDeal({ firstDrawKinds: { 0: drawKinds[0], 1: drawKinds[1], 2: drawKinds[2], 3: drawKinds[3] }, seed });
  if (dealt.players.some(player => getWaitingTileKinds(player.hand.map(tile => tile.tile)).some(kind => tileKindKey(kind) === drawKinds[0]))) return null;
  let game = dealt;
  for (let index = 0; index < 4; index++) {
    if (game.phase === 'awaiting-draw') game = drawTile(game, game.turnPlayerId);
    const player = game.players[game.turnPlayerId];
    if (!player.drawnTile || player.drawnTileSource !== (index === 0 ? 'deal' : 'live-wall')) return null;
    game = discardTile(game, player.id, player.drawnTile.id);
    if (game.phase === 'won' || game.phase === 'awaiting-ron' || game.phase === 'awaiting-call' && index < 3) return null;
  }
  return game;
}

// A finite deterministic search avoids incidental ron hands in the other seats.
export function fourWindsGame(wind: 'east'|'south'|'west'|'north'): GameState {
  for (let seed = 211; seed < 511; seed++) {
    const game = playFirstFour([wind,wind,wind,wind], seed);
    if (game?.abortiveDraw === 'four-winds') return game;
  }
  throw new RangeError('Unable to arrange a four-winds draw without an earlier ron');
}

export function mixedFirstFourGame(drawKinds: readonly [string,string,string,string], seed = 613): GameState {
  for (let attempt = 0; attempt < 300; attempt++) {
    const game = playFirstFour(drawKinds, seed + attempt);
    if (game && game.phase === 'awaiting-draw') return game;
  }
  throw new RangeError('Unable to arrange four safe first discards');
}

/** A physically complete normal exhaustive draw fixture with a complete river history. */
export function exhaustiveDrawGame(seed = 1): GameState {
  const game = fixedRound(0, []);
  return { ...game, players: game.players.map(player => ({ ...player, discardHistory: [...player.river] })) as unknown as GameState['players'] };
}

export function nagashiGame(winnerIds: readonly PlayerId[], predicate: (tile: PhysicalTile) => boolean = tile => isTerminalOrHonor(tile.tile)): GameState {
  const game = exhaustiveDrawGame();
  const terminalRivers = game.players.flatMap(player => player.river).filter(predicate);
  const otherRivers = game.players.flatMap(player => player.river).filter(tile => !predicate(tile));
  const winners = [...new Set(winnerIds)];
  const nonWinners = ids.filter(id => !winners.includes(id));
  if (winners.length !== winnerIds.length || terminalRivers.length < winners.length || otherRivers.length < nonWinners.length) {
    throw new RangeError('Exhaustive draw does not contain enough fixture tiles');
  }
  const rivers: PhysicalTile[][] = ids.map(() => []);
  winners.forEach(id => rivers[id].push(terminalRivers.shift()!));
  terminalRivers.splice(0).forEach((tile, index) => rivers[winners[index % winners.length]].push(tile));
  nonWinners.forEach(id => rivers[id].push(otherRivers.shift()!));
  if (nonWinners.length) otherRivers.forEach(tile => rivers[nonWinners[0]].push(tile));
  else if (otherRivers.length) throw new RangeError('All players cannot retain non-terminal discards in this fixture');
  const remainingTerminals = terminalRivers.splice(0);
  if (nonWinners.length) rivers[nonWinners[0]].push(...remainingTerminals);
  else if (remainingTerminals.length) rivers[winners[0]].push(...remainingTerminals);
  return { ...game, players: game.players.map(player => ({ ...player, river: rivers[player.id], discardHistory: [...rivers[player.id]] })) as unknown as GameState['players'] };
}

function allPhysical(game: GameState): PhysicalTile[] {
  return [...game.liveWall, ...game.deadWall, ...game.players.flatMap(player => [
    ...player.hand, ...(player.drawnTile ? [player.drawnTile] : []), ...player.river,
    ...(player.melds ?? []).flatMap(meld => meld.tiles),
  ])];
}

function swapPhysical(game: GameState, first: PhysicalTile, second: PhysicalTile): GameState {
  const swap = (tile: PhysicalTile) => tile.id === first.id ? second : tile.id === second.id ? first : tile;
  const players = game.players.map(player => ({
    ...player,
    hand: player.hand.map(swap),
    drawnTile: player.drawnTile ? swap(player.drawnTile) : null,
    river: player.river.map(swap),
    melds: player.melds?.map(meld => ({ ...meld, tiles: meld.tiles.map(swap) as OpenMeld['tiles'] } as OpenMeld)),
  })) as unknown as GameState['players'];
  return { ...game, liveWall: game.liveWall.map(swap), deadWall: game.deadWall.map(swap), players };
}

/** Move a real terminal discard into a real chi/pon/daiminkan meld for call regressions. */
export function calledNagashiGame(type: 'chi'|'pon'|'daiminkan'): { readonly game: GameState; readonly initial: GameState } {
  const base = nagashiGame([0]);
  const winnerId: PlayerId = 0, callerId: PlayerId = 1;
  const target = base.players[winnerId].river.find(tile => type !== 'chi'
    ? true
    : tile.tile.category === 'suited' && (tile.tile.rank === 1 || tile.tile.rank === 9));
  if (!target) throw new RangeError(`Missing ${type} discard tile`);
  const targetKey = tileKindKey(target.tile);
  const keys = type === 'chi' && target.tile.category === 'suited'
    ? target.tile.rank === 1 ? [`${target.tile.suit}-2`, `${target.tile.suit}-3`] : [`${target.tile.suit}-7`, `${target.tile.suit}-8`]
    : Array.from({ length: type === 'daiminkan' ? 3 : 2 }, () => targetKey);
  let game = base;
  for (const key of new Set(keys)) {
    const required = keys.filter(candidate => candidate === key).length;
    while (game.players[callerId].hand.filter(tile => tileKindKey(tile.tile) === key).length < required) {
      const physical = allPhysical(game).find(tile => tile.id !== target.id && tileKindKey(tile.tile) === key && !game.players[callerId].hand.some(owned => owned.id === tile.id));
      const spare = game.players[callerId].hand.find(tile => {
        const spareKey = tileKindKey(tile.tile);
        const needed = keys.filter(candidate => candidate === spareKey).length;
        return game.players[callerId].hand.filter(owned => tileKindKey(owned.tile) === spareKey).length > needed;
      });
      if (!physical || !spare) throw new RangeError(`Unable to arrange a real ${type} call`);
      game = swapPhysical(game, physical, spare);
    }
  }
  const beforeCall = game;
  const currentTarget = game.players[winnerId].river.find(tile => tile.id === target.id)!;
  const caller = game.players[callerId];
  const owned: PhysicalTile[] = [];
  for (const key of keys) {
    const tile = caller.hand.find(candidate => tileKindKey(candidate.tile) === key && !owned.some(selected => selected.id === candidate.id));
    if (!tile) throw new RangeError(`Missing owned ${key}`);
    owned.push(tile);
  }
  const meldTiles = type === 'chi'
    ? [...owned, currentTarget].sort((a,b) => (a.tile.category === 'suited' ? a.tile.rank : 0) - (b.tile.category === 'suited' ? b.tile.rank : 0))
    : [...owned.slice(0, type === 'daiminkan' ? 3 : 2), currentTarget];
  const meld: OpenMeld = { type, tiles: meldTiles as OpenMeld['tiles'], calledTileId: currentTarget.id, fromPlayerId: winnerId } as OpenMeld;
  const players = [...game.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[winnerId] = { ...players[winnerId], river: players[winnerId].river.filter(tile => tile.id !== currentTarget.id) };
  players[callerId] = { ...caller, hand: caller.hand.filter(tile => !owned.some(selected => selected.id === tile.id)),
    melds: [...(caller.melds ?? []), meld],
    callDiscard: type === 'daiminkan' ? null : { forbiddenKinds: [] } };
  return { game: { ...game, players, callsMade: true, ...(type === 'daiminkan' ? { kanCount: 1 } : {}) }, initial:beforeCall };
}

/** Find an 8-orphan hand where duplicate copies are not treated as distinct kinds. */
export function eightOrphanGame(): GameState {
  const handKinds = ['man-1','man-9','pin-1','pin-9','sou-1','sou-9','east','south','man-1','man-1','man-2','man-3','man-4'];
  return arrangedDeal({ handKinds: { 0: handKinds }, firstDrawKinds: { 0: 'man-1' }, seed: 719 });
}

export function playerPonGame(game: GameState, playerId: PlayerId): { readonly game: GameState; readonly initial: GameState } {
  let current = game;
  const targetKey = 'man-2';
  while (current.players[playerId].hand.filter(tile => tileKindKey(tile.tile) === targetKey).length < 3) {
    const physical = allPhysical(current).find(tile => tileKindKey(tile.tile) === targetKey &&
      !current.players[playerId].hand.some(owned => owned.id === tile.id) && current.players[playerId].drawnTile?.id !== tile.id);
    const spare = current.players[playerId].hand.find(tile => tileKindKey(tile.tile) !== targetKey);
    if (!physical || !spare) throw new RangeError('Unable to arrange a real pon');
    current = swapPhysical(current, physical, spare);
  }
  const initial = current;
  const player = current.players[playerId];
  const tiles = player.hand.filter(tile => tileKindKey(tile.tile) === targetKey).slice(0,3) as [PhysicalTile,PhysicalTile,PhysicalTile];
  const meld: OpenMeld = { type:'pon', tiles, calledTileId:tiles[1].id, fromPlayerId:((playerId+3)%4) as PlayerId };
  const players = [...current.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[playerId] = { ...player, hand:player.hand.filter(tile => !tiles.some(used => used.id === tile.id)), melds:[...(player.melds ?? []),meld] };
  return { game:{ ...current, players, callsMade:true }, initial };
}

export function sameKindHistoryMismatchGame(): { readonly game: GameState; readonly initial: GameState } {
  const initial = nagashiGame([0]);
  const target = initial.players[0].discardHistory!.find(candidate => {
    const key = tileKindKey(candidate.tile);
    return initial.players[0].river.filter(tile => tileKindKey(tile.tile) === key).length === 1 &&
      allPhysical(initial).some(tile => tile.id !== candidate.id && tileKindKey(tile.tile) === key && !initial.players[0].river.some(river => river.id === tile.id));
  });
  if (!target) throw new RangeError('Missing a unique same-kind discard for the physical-ID fixture');
  const replacement = allPhysical(initial).find(tile => tile.id !== target.id && tileKindKey(tile.tile) === tileKindKey(target.tile) && !initial.players[0].river.some(river => river.id === tile.id));
  if (!replacement) throw new RangeError('Missing another physical copy for the same-kind history fixture');
  return { initial, game: swapPhysical(initial, target, replacement) };
}

export function noDiscardHistoryGame(): { readonly game: GameState; readonly initial: GameState } {
  const initial = nagashiGame([1]);
  const moved = initial.players[0].river;
  const players = [...initial.players] as [PlayerState,PlayerState,PlayerState,PlayerState];
  players[0] = { ...players[0], river:[], discardHistory:[] };
  players[2] = { ...players[2], river:[...players[2].river,...moved], discardHistory:[...players[2].river,...moved] };
  return { initial, game:{ ...initial, players } };
}

export function mixedDiscardNagashiGame(): { readonly game: GameState; readonly initial: GameState } {
  const initial = nagashiGame([0]);
  const terminal = initial.players[0].river[0];
  const middle = initial.players.slice(1).flatMap(player=>player.river)
    .find(tile=>tile.tile.category==='suited' && tile.tile.rank>=2 && tile.tile.rank<=8);
  if (!middle) throw new RangeError('Missing a middle discard for the nagashi regression');
  const swapped = swapPhysical(initial,terminal,middle);
  const players = swapped.players.map(player=>({ ...player, discardHistory:[...player.river] })) as unknown as GameState['players'];
  return { initial, game:{ ...swapped, players } };
}
