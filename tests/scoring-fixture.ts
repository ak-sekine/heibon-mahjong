import type { PlayerState } from '../src/model/game.ts';
import { getWaitingTileKinds } from '../src/game/ron.ts';
import { tileKindKey } from '../src/model/tile.ts';
import { tsumoStart } from './tsumo-fixture.ts';
import { shuffle } from '../src/game/shuffle.ts';
const seeded = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
/** Browser-only fixtures built entirely from complete, legal fixed walls. */
import { tsumoGame } from './tsumo-fixture.ts';
import { cpuTsumoGame } from './cpu-tsumo-fixture.ts';
import { ronGame, ronStart } from './ron-fixture.ts';
import { declareTsumo } from '../src/game/tsumo.ts';
import { discardTile } from '../src/game/discard.ts';
import { drawTile } from '../src/game/draw.ts';
import { startGame } from '../src/game/start.ts';

const PINFU = ['123m','789m','234p','66p','678s'];
export function scoringGame(name: string) {
  switch(name) {
    case 'pinfu-parent': return tsumoGame(PINFU,false,[],'sou-9');
    case 'pinfu-child': return declareTsumo(cpuTsumoGame(1,PINFU,'sou-9'),1);
    case 'seven-pairs': return tsumoGame(['11m','33m','55p','77p','22s','44s','77z'],false,[],'sou-9');
    case 'triplets': return tsumoGame(['234m','345p','678s','222p','66m'],false,[],'sou-9');
    case 'shanpon-tsumo': return tsumoGame(['345m','678p','234s','66p','222m'],false,[],'sou-9');
    case 'shanpon-ron': return ronGame(1,[0],[['345m','678p','234s','66p','22m']],'man-2',false,'sou-9');
    case 'mangan-parent': return tsumoGame(['123m','456m','789p','22p','456s'],false,undefined,'man-4');
    case 'mangan-child': return declareTsumo(cpuTsumoGame(1),1);
    case 'yakuman-parent': return tsumoGame(['19m','19p','19s','12345677z'],false,[],'man-9');
    case 'yakuman-child': return declareTsumo(cpuTsumoGame(1,['19m','19p','19s','12345677z'],'man-9'),1);
    case 'ron-child': return ronGame(1,[0]);
    case 'ron-parent': {
      let game=ronStart(1,[0],undefined,'sou-5',true,'sou-4',true);
      game=discardTile(game,0,game.players[0].drawnTile!.id);
      game=drawTile(game,1);
      return discardTile(game,1,game.players[1].drawnTile!.id);
    }
    case 'haneman': return limitTsumo(['555z','666z','777z','222m','33p'],false,[],'sou-9');
    case 'baiman': return limitTsumo(['555z','666z','777z','111z','22z'],false,[],'sou-9');
    case 'sanbaiman': return limitTsumo(['555z','666z','777z','111z','22z'],false,[],'north');
    case 'seven-pairs-ron': return ronGame(1,[0],[['11m','33m','55p','77p','22s','44s','7z']],'red',false,'sou-9');
    case 'double': return ronGame(1,[0,2]);
    case 'triple': return ronGame(1,[0,2,3]);
    default: return startGame();
  }
}

/** Redistribute actual CPU tiles and reserve safe discards before the winning draw. */
function limitTsumo(groups: string[], last: boolean, redSuits: [], indicator: string) {
  let game = tsumoStart(groups, last, redSuits, indicator);
  const pool = shuffle(game.players.slice(1).flatMap(p => [...p.hand]), seeded(117));
  const players = game.players.map((player, index) => index === 0 ? player :
    { ...player, hand: pool.slice((index - 1) * 13, index * 13) }) as unknown as typeof game.players;
  const waits = new Set(players.flatMap(p => getWaitingTileKinds(p.hand.map(t => t.tile))).map(tileKindKey));
  const liveWall = [...game.liveWall];
  const safeIndex = () => {
    const index = liveWall.findIndex((t, i) => i >= 4 && !waits.has(tileKindKey(t.tile)));
    if (index < 0) throw new RangeError('No safe fixed-wall discard');
    return index;
  };
  const updated = [...players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  let index = safeIndex();
  const safe = liveWall[index]; liveWall[index] = updated[0].drawnTile!;
  updated[0] = { ...updated[0], drawnTile: safe };
  for (let i = 0; i < 3; i++) {
    index = safeIndex(); [liveWall[i], liveWall[index]] = [liveWall[index], liveWall[i]];
  }
  game = { ...game, players: updated, liveWall };
  for (let i = 0; i < 4; i++) {
    game = discardTile(game, game.turnPlayerId, game.players[game.turnPlayerId].drawnTile!.id);
    game = drawTile(game, game.turnPlayerId);
  }
  return game;
}
