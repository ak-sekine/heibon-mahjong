import { getCallOptions, resolveCallResponses } from '../game/calls.ts';
import { discardTile } from '../game/discard.ts';
import { drawOrStop } from '../game/draw.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import { getRonCandidates, passRon } from '../game/ron.ts';
import { startGame } from '../game/start.ts';
import { createWall } from '../game/wall.ts';
import type { GameState, PhysicalTile, PlayerId } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';

const fixtureSeeds: Readonly<Record<number, number>> = { 17: 1, 18: 276, 19: 5 };
const river23CallTypes = {
  playerOne: ['white', 'green', 'red', 'east'],
  playerTwo: ['man-1', 'man-3', 'man-5', 'pin-1'],
  playerZero: ['pin-3', 'pin-5', 'sou-1', 'sou-3'],
} as const;
const river23PlayerOneDiscards = [
  'white', 'green', 'red', 'east', 'man-1', 'man-5', 'pin-1',
  'pin-3', 'pin-5', 'sou-1', 'sou-3',
] as const;

export const riverTestUnsupportedReason =
  '24・25枚の河で打牌待ちになる局面は、合法な局進行から生成できません。自分の河23枚が打牌待ちになる局面が上限です。';

function seeded(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function takeTiles(available: PhysicalTile[], kind: string, count = 1): PhysicalTile[] {
  const result: PhysicalTile[] = [];
  for (let index = 0; index < count; index++) {
    const tileIndex = available.findIndex(tile => tileKindKey(tile.tile) === kind);
    if (tileIndex < 0) throw new RangeError(`テスト用配牌に${kind}が不足しています。`);
    result.push(available.splice(tileIndex, 1)[0]);
  }
  return result;
}

function buildRiver23WallOrder(): PhysicalTile[] {
  const available = createWall();
  const take = (kind: string, count = 1) => takeTiles(available, kind, count);
  const p0 = [
    ...river23CallTypes.playerZero.flatMap(kind => take(kind, 2)),
    ...['man-7', 'pin-6', 'pin-7', 'pin-8', 'sou-5'].flatMap(kind => take(kind)),
  ];
  const p1 = [
    ...river23CallTypes.playerOne.flatMap(kind => take(kind)),
    ...take('west', 2),
    ...take('man-1'), ...take('man-3'),
    ...river23CallTypes.playerZero.flatMap(kind => take(kind)),
    ...take('north'),
  ];
  const p2 = [
    ...river23CallTypes.playerTwo.flatMap(kind => take(kind, 2)),
    ...take('west'),
    ...['man-8', 'man-9', 'pin-2', 'pin-4'].flatMap(kind => take(kind)),
  ];
  const p3 = [
    ...river23CallTypes.playerOne.flatMap(kind => take(kind, 2)),
    ...['man-2', 'man-4', 'man-6', 'sou-6', 'sou-7'].flatMap(kind => take(kind)),
  ];
  const hands = [p0, p1, p2, p3];
  if (hands.some(hand => hand.length !== 13) || new Set(hands.flat().map(tile => tile.id)).size !== 52) {
    throw new RangeError('河23テストの初期配牌が不正です。');
  }

  // The fixed 136-tile permutation deals four legal 13-tile hands, a dealer
  // extra tile, and a live wall whose two marked draws complete legal calls.
  const dealt: PhysicalTile[] = [];
  for (let round = 0; round < 13; round++) {
    for (let seat = 0; seat < 4; seat++) dealt.push(hands[seat][round]);
  }
  const dealerExtra = take('sou-8')[0];
  const markedDraws = new Map<number, PhysicalTile>([
    [11, take('man-5')[0]],
    [14, take('pin-1')[0]],
  ]);
  const liveWall: PhysicalTile[] = [];
  const liveRemainder = [...available];
  let fillerIndex = 0;
  for (let index = 0; index < 69; index++) {
    const marked = markedDraws.get(index);
    if (marked) {
      liveWall.push(marked);
      continue;
    }
    const filler = liveRemainder[fillerIndex++];
    if (!filler) throw new RangeError('河23テストの牌山が不足しています。');
    liveWall.push(filler);
  }
  const usedIds = new Set([...dealt, dealerExtra, ...liveWall].map(tile => tile.id));
  const deadWall = createWall().filter(tile => !usedIds.has(tile.id));
  const order = [...dealt, dealerExtra, ...liveWall, ...deadWall];
  if (order.length !== 136 || new Set(order.map(tile => tile.id)).size !== 136) {
    throw new RangeError('河23テストの136枚の牌山が不正です。');
  }
  return order;
}

/** Return Fisher-Yates choices that produce a known, valid 136-tile permutation. */
function randomForWallOrder(order: readonly PhysicalTile[]): () => number {
  const working = createWall();
  const choices = new Array<number>(working.length);
  for (let index = working.length - 1; index > 0; index--) {
    const swapIndex = working.findIndex((tile, candidate) => candidate <= index && tile.id === order[index].id);
    if (swapIndex < 0) throw new RangeError('河23テストの牌山順を作成できません。');
    choices[index] = swapIndex;
    [working[index], working[swapIndex]] = [working[swapIndex], working[index]];
  }
  if (working.some((tile, index) => tile.id !== order[index].id)) {
    throw new RangeError('河23テストの牌山順を検証できません。');
  }
  let index = choices.length - 1;
  return () => {
    if (index < 1) throw new RangeError('河23テストの固定乱数列を使い切りました。');
    const value = (choices[index] + 0.25) / (index + 1);
    index--;
    return value;
  };
}

function chooseRiver23Call(game: GameState): ReturnType<typeof getCallOptions>[number] | null {
  const sourceId = game.ronWindow!.discarderId;
  const sourceTile = game.players[sourceId].river.at(-1);
  if (!sourceTile) throw new RangeError('河23テストの鳴き元牌がありません。');
  const kind = tileKindKey(sourceTile.tile);
  let callerId: PlayerId | null = null;
  if (sourceId === 1 && (river23CallTypes.playerOne as readonly string[]).includes(kind)) callerId = 3;
  else if (sourceId === 1 && (river23CallTypes.playerTwo as readonly string[]).includes(kind)) callerId = 2;
  else if (sourceId === 2 && kind === 'west') callerId = 1;
  else if (sourceId === 1 && (river23CallTypes.playerZero as readonly string[]).includes(kind)) callerId = 0;
  if (callerId === null) return null;
  const option = getCallOptions(game, callerId).find(candidate => candidate.calledTileId === sourceTile.id);
  if (!option) throw new RangeError(`河23テストで${kind}を鳴けません。`);
  return option;
}

function chooseRiver23Discard(
  game: GameState,
  p1DrawIndex: number,
  p2CallDiscardCount: number,
): { readonly tileId: string; readonly nextP1DrawIndex: number; readonly nextP2CallDiscardCount: number } {
  const player = game.players[game.turnPlayerId];
  const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
    .filter(tile => !isForbiddenDiscard(player, tile.id));
  let selected: PhysicalTile | undefined;
  let nextP1DrawIndex = p1DrawIndex;
  let nextP2CallDiscardCount = p2CallDiscardCount;

  if (player.id === 1 && player.callDiscard) {
    selected = candidates.find(tile => tileKindKey(tile.tile) === 'man-3');
  } else if (player.id === 2 && player.callDiscard) {
    selected = p2CallDiscardCount === 0
      ? candidates.find(tile => tileKindKey(tile.tile) === 'west')
      : undefined;
    nextP2CallDiscardCount++;
  } else if (player.id === 1 && player.drawnTile && p1DrawIndex < river23PlayerOneDiscards.length) {
    const targetKind = river23PlayerOneDiscards[p1DrawIndex];
    selected = candidates.find(tile => tileKindKey(tile.tile) === targetKind);
    if (!selected) throw new RangeError(`河23テストで${targetKind}を打牌できません。`);
    nextP1DrawIndex++;
  }

  if (!selected) {
    const protectedKinds = new Set<string>([
      ...river23CallTypes.playerOne,
      ...river23CallTypes.playerTwo,
      ...river23CallTypes.playerZero,
      'west',
    ]);
    selected = candidates.find(tile => !protectedKinds.has(tileKindKey(tile.tile))) ?? candidates[0];
  }
  if (!selected) throw new RangeError('河23テストで打牌候補がありません。');
  return { tileId: selected.id, nextP1DrawIndex, nextP2CallDiscardCount };
}

/**
 * Replay a fixed, legal 136-tile deal to a 23-discard turn. Calls and every
 * discard/draw use the ordinary game transitions; only seat control is changed.
 */
function createRiver23State(): GameState {
  const order = buildRiver23WallOrder();
  const dealt = startGame(randomForWallOrder(order));
  let game: GameState = {
    ...dealt,
    players: dealt.players.map(player => ({ ...player, control: 'human' as const })) as unknown as GameState['players'],
  };
  let p1DrawIndex = 0;
  let p2CallDiscardCount = 0;

  for (let operation = 0; operation < 400; operation++) {
    if (game.phase === 'awaiting-discard' && game.turnPlayerId === 0 && game.players[0].river.length === 23) {
      const cpuSeats = game.players.map(player => ({
        ...player,
        control: player.id === 0 ? 'human' as const : 'cpu' as const,
      })) as unknown as GameState['players'];
      return { ...game, players: cpuSeats };
    }
    if (game.phase === 'awaiting-ron') {
      const candidates = getRonCandidates(game);
      game = candidates.length ? passRon(game, candidates[0].winnerId) : game;
      continue;
    }
    if (game.phase === 'awaiting-call') {
      const option = chooseRiver23Call(game);
      game = resolveCallResponses(game, option ? [option] : []);
      continue;
    }
    if (game.phase === 'awaiting-draw') {
      game = drawOrStop(game);
      continue;
    }
    if (game.phase !== 'awaiting-discard') break;
    const discard = chooseRiver23Discard(game, p1DrawIndex, p2CallDiscardCount);
    p1DrawIndex = discard.nextP1DrawIndex;
    p2CallDiscardCount = discard.nextP2CallDiscardCount;
    game = discardTile(game, game.turnPlayerId, discard.tileId);
  }
  throw new RangeError('合法な河23テスト局面を固定進行から再現できませんでした。');
}

export function createRiverTestState(discardCount: number): GameState {
  if (discardCount === 23) return createRiver23State();
  const seed = fixtureSeeds[discardCount];
  if (seed === undefined) throw new RangeError(riverTestUnsupportedReason);

  const choice = seeded(seed * 9973 + 23);
  const dealt = startGame(seeded(seed));
  const players = dealt.players.map(player => ({ ...player, control: 'human' as const })) as unknown as GameState['players'];
  let game: GameState = { ...dealt, players };

  for (let operation = 0; operation < 400; operation++) {
    if (game.phase === 'awaiting-discard' && game.turnPlayerId === 0 && game.players[0].river.length === discardCount) {
      const cpuSeats = game.players.map(player => ({
        ...player,
        control: player.id === 0 ? 'human' as const : 'cpu' as const,
      })) as unknown as GameState['players'];
      return { ...game, players: cpuSeats };
    }
    if (game.phase === 'awaiting-ron') {
      const candidates = getRonCandidates(game);
      if (candidates.length) {
        game = passRon(game, candidates[Math.floor(choice() * candidates.length)].winnerId);
      }
      continue;
    }
    if (game.phase === 'awaiting-call') {
      const options = [0, 1, 2, 3].flatMap(seat => getCallOptions(game, seat as PlayerId));
      const option = options.length ? options[Math.floor(choice() * options.length)] : null;
      game = option ? resolveCallResponses(game, [option]) : resolveCallResponses(game, []);
      continue;
    }
    if (game.phase === 'awaiting-draw') {
      game = drawOrStop(game);
      continue;
    }
    if (game.phase !== 'awaiting-discard') break;

    const player = game.players[game.turnPlayerId];
    const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
      .filter(tile => !isForbiddenDiscard(player, tile.id));
    if (!candidates.length) break;
    game = discardTile(game, player.id, candidates[Math.floor(choice() * candidates.length)].id);
  }
  throw new RangeError(`合法な${discardCount}枚開始局面を固定シードで再現できませんでした。`);
}
