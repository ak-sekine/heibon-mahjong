import type { GameState, PhysicalTile, PlayerId, PlayerState, SeatWind, WallState } from '../model/game.ts';

const IDS = [0, 1, 2, 3] as const;
const WINDS: readonly SeatWind[] = ['east', 'south', 'west', 'north'];

/** Thirteen rounds, starting with the dealer, then their separate extra tile. */
export function deal(wall: WallState, dealerId: PlayerId = 0): GameState {
  if (!IDS.includes(dealerId)) throw new RangeError('Invalid dealer');
  if (wall.liveWall.length !== 122 || wall.deadWall.length !== 14) {
    throw new RangeError('Dealing requires 122 live tiles and 14 dead tiles');
  }
  const hands: PhysicalTile[][] = IDS.map(() => []);
  let cursor = 0;
  for (let round = 0; round < 13; round++) {
    for (let offset = 0; offset < 4; offset++) {
      hands[(dealerId + offset) % 4].push(wall.liveWall[cursor++]);
    }
  }
  const extra = wall.liveWall[cursor++];
  const player = (id: PlayerId): PlayerState => ({
    id, control: id === 0 ? 'human' : 'cpu',
    wind: WINDS[(id - dealerId + 4) % 4],
    melds: [], discardHistory: [], callDiscard: null, hand: hands[id], drawnTile: id === dealerId ? extra : null, drawnTileSource: id === dealerId ? 'deal' : null, river: [], temporaryFuriten: false, riichi: null,
  });
  return {
    callsMade: false, winResult: null, ronWindow: null, pendingRiichi: null, dealerId, turnPlayerId: dealerId, phase: 'awaiting-discard',
    players: [player(0), player(1), player(2), player(3)],
    liveWall: wall.liveWall.slice(cursor), deadWall: [...wall.deadWall],
  };
}
