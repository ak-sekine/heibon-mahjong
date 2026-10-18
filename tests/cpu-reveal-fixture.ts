import { evaluateWin } from '../src/game/win.ts';
import { startGame } from '../src/game/start.ts';
import { createWall } from '../src/game/wall.ts';
import type { GameState, OpenMeld, PhysicalTile, PlayerId } from '../src/model/game.ts';
import { tileKindKey } from '../src/model/tile.ts';

/** Legal physical tiles for checking the CPU seat reveal at each meld count. */
export function cpuTsumoWithMelds(winnerId: 1 | 2 | 3, meldCount: 0 | 1 | 2 | 3 | 4): GameState {
  const pool = createWall();
  const takeGroup = (group: string): PhysicalTile[] => {
    const suit = group.at(-1)!;
    return [...group.slice(0, -1)].map(character => {
      const rank = character === '0' ? 5 : Number(character);
      const key = `${({ m: 'man', p: 'pin', s: 'sou' } as const)[suit]}-${rank}`;
      let index = pool.findIndex(tile => tileKindKey(tile.tile) === key && tile.tile.isRed === (character === '0'));
      if (index < 0) index = pool.findIndex(tile => tileKindKey(tile.tile) === key);
      if (index < 0) throw new RangeError(`Missing fixture tile ${key}`);
      return pool.splice(index, 1)[0];
    });
  };
  const concealedGroups = meldCount === 0 ? ['406m', '234p', '345p', '678s', '55s']
    : meldCount === 1 ? ['406m', '234p', '678s', '55s']
    : meldCount === 2 ? ['406m', '678s', '55s']
    : meldCount === 3 ? ['406m', '55s'] : ['05s'];
  const concealed = concealedGroups.flatMap(takeGroup);
  const winningTile = concealed.pop()!;
  const meldGroups = meldCount === 0 ? []
    : meldCount === 1 ? ['5555p']
    : meldCount === 2 ? ['234p', '4444s']
    : meldCount === 3 ? ['234p', '4444s', '888m']
    : ['234p', '4444s', '888m', '333m'];
  const melds = meldGroups.map((group, index): OpenMeld => {
    const tiles = takeGroup(group);
    const kan = tiles.length === 4;
    const concealedKan = kan && index !== 0;
    const calledTileId = concealedKan ? '' : tiles[0].id;
    const fromPlayerId = ((winnerId + 3) % 4) as PlayerId;
    if (kan) return {
      type: concealedKan ? 'ankan' : 'daiminkan',
      tiles: tiles as [PhysicalTile, PhysicalTile, PhysicalTile, PhysicalTile],
      calledTileId,
      fromPlayerId,
    };
    const sameKind = tiles.every(tile => tileKindKey(tile.tile) === tileKindKey(tiles[0].tile));
    return {
      type: sameKind ? 'pon' : 'chi',
      tiles: tiles as [PhysicalTile, PhysicalTile, PhysicalTile],
      calledTileId,
      fromPlayerId,
    };
  });
  const base = startGame(() => 0, 0);
  const players = base.players.map(player => {
    if (player.id === winnerId) return {
      ...player,
      hand: concealed,
      drawnTile: winningTile,
      drawnTileSource: melds.some(meld => ['ankan', 'daiminkan', 'kakan'].includes(meld.type)) ? 'rinshan' as const : 'live-wall' as const,
      melds,
      river: [],
      discardHistory: [],
      riichi: null,
    };
    return {
      ...player,
      hand: pool.splice(0, 13),
      drawnTile: null,
      drawnTileSource: null,
      melds: [],
      river: [],
      discardHistory: [],
      riichi: null,
    };
  }) as unknown as GameState['players'];
  const deadWall = pool.splice(0, 14);
  const game: GameState = {
    ...base,
    kanCount: melds.filter(meld => ['ankan', 'daiminkan', 'kakan'].includes(meld.type)).length,
    callsMade: melds.length > 0,
    turnPlayerId: winnerId,
    phase: 'awaiting-discard',
    winResult: null,
    ronWindow: null,
    pendingRiichi: null,
    players,
    deadWall,
    liveWall: pool,
  };
  const result = evaluateWin(game, winnerId, winningTile, 'tsumo');
  if (!result) throw new RangeError(`Fixture hand cannot win with ${meldCount} melds`);
  return { ...game, phase: 'won', winResult: { ...result, winMethod: 'tsumo' } };
}
