import type { OpenMeld, PhysicalTile, PlayerId } from '../model/game.ts';

export type RiichiRiverReference =
  | { readonly state: 'none' | 'present'; readonly index: number }
  | { readonly state: 'claimed'; readonly index: -1 }
  | { readonly state: 'inconsistent'; readonly index: -1 };

/** A declaration may leave the river only when exactly one open meld proves it was called. */
export function riichiRiverReference(
  seat: PlayerId,
  river: readonly PhysicalTile[],
  declarationTileId: string | undefined,
  melds: readonly (Pick<OpenMeld, 'calledTileId' | 'fromPlayerId' | 'type'> & {
    readonly ownerSeat: PlayerId;
    readonly tiles: readonly ({ readonly id: string } | null)[];
  })[],
  discardHistory?: readonly PhysicalTile[],
): RiichiRiverReference {
  if (!declarationTileId) return { state: 'none', index: -1 };
  const riverMatches = river.flatMap((tile, index) => tile.id === declarationTileId ? [index] : []);
  if (riverMatches.length > 1) return { state: 'inconsistent', index: -1 };
  const calls = melds.filter(meld => meld.ownerSeat !== seat && meld.calledTileId === declarationTileId &&
    meld.fromPlayerId === seat && meld.type !== 'ankan' && meld.tiles.some(tile => tile?.id === declarationTileId));
  if (riverMatches.length === 1) return calls.length === 0
    ? { state: 'present', index: riverMatches[0] }
    : { state: 'inconsistent', index: -1 };
  const historyMatches = discardHistory?.filter(tile => tile.id === declarationTileId).length;
  const retainedInHistory = historyMatches === undefined || historyMatches === 1;
  return calls.length === 1 && retainedInHistory
    ? { state: 'claimed', index: -1 }
    : { state: 'inconsistent', index: -1 };
}
