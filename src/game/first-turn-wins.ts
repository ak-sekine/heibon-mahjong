import type { GameState, PlayerId, PhysicalTile } from '../model/game.ts';
import { tileKindKey } from '../model/tile.ts';

const playerIds: readonly PlayerId[] = [0, 1, 2, 3];

function physicalTiles(game: GameState): readonly PhysicalTile[] {
  return [
    ...game.liveWall,
    ...game.deadWall,
    ...game.players.flatMap(player => [
      ...player.hand,
      ...(player.drawnTile ? [player.drawnTile] : []),
      ...player.river,
      ...(player.melds ?? []).flatMap(meld => meld.tiles),
    ]),
  ];
}

/** Reject a forged deal/draw source unless the state still has the real 136 tiles. */
function hasValidPhysicalTiles(game: GameState): boolean {
  try {
    const tiles = physicalTiles(game);
    if (tiles.length !== 136 || new Set(tiles.map(tile => tile.id)).size !== 136) return false;
    const counts = new Map<string, number>();
    for (const tile of tiles) {
      const key = tileKindKey(tile.tile);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts.size === 34 && [...counts.values()].every(count => count === 4);
  } catch {
    return false;
  }
}

function hasNoCallsOrPendingWin(game: GameState): boolean {
  return game.callsMade === false && game.kanCount === 0 &&
    game.winResult === null && game.ronWindow === null && game.pendingRiichi === null &&
    game.abortiveDraw === undefined &&
    game.players.every(player => (player.melds?.length ?? 0) === 0 && player.callDiscard === null);
}

/** The only state in which the dealer's dealt fourteenth tile is a valid draw. */
export function isTenhouState(game: GameState, playerId: PlayerId): boolean {
  if (!playerIds.includes(playerId) || playerId !== game.dealerId ||
      game.turnPlayerId !== playerId || game.phase !== 'awaiting-discard' ||
      game.liveWall.length !== 69 || game.deadWall.length !== 14 ||
      !hasNoCallsOrPendingWin(game) || !hasValidPhysicalTiles(game)) return false;
  return game.players.every((player, id) =>
    player.id === id && player.hand.length === 13 && player.river.length === 0 &&
    Array.isArray(player.discardHistory) && player.discardHistory.length === 0 &&
    player.riichi === null &&
    (player.id === playerId
      ? player.drawnTile !== null && player.drawnTileSource === 'deal'
      : player.drawnTile === null && player.drawnTileSource === null));
}

/** A child's own first live-wall draw, before any call or kan in the hand. */
export function isChiihouState(game: GameState, playerId: PlayerId): boolean {
  const player = game.players[playerId];
  if (!playerIds.includes(playerId) || playerId === game.dealerId ||
      !player || player.id !== playerId || game.turnPlayerId !== playerId ||
      game.phase !== 'awaiting-discard' || game.liveWall.length === 0 ||
      !hasNoCallsOrPendingWin(game) || !hasValidPhysicalTiles(game) ||
      player.river.length !== 0 || !Array.isArray(player.discardHistory) ||
      player.discardHistory.length !== 0 || player.riichi !== null ||
      player.drawnTile === null || player.drawnTileSource !== 'live-wall') return false;
  return game.players.every(other => other.id === playerId ||
    other.drawnTile === null && other.drawnTileSource === null);
}
