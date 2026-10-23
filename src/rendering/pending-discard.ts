import type { GameState, PlayerId } from '../model/game.ts';

export type PendingDiscardTarget = Readonly<{
  seat: PlayerId;
  riverIndex: number;
}>;

/** Resolve the current discard decision to the exact physical tile in its owner's river. */
export function pendingDiscardTarget(
  game: Pick<GameState, 'phase' | 'turnPlayerId' | 'ronWindow' | 'players'>,
): PendingDiscardTarget | null {
  const { phase, turnPlayerId, ronWindow } = game;
  if ((phase !== 'awaiting-ron' && phase !== 'awaiting-call') || !ronWindow || ronWindow.kan ||
      ronWindow.kind === 'ankan' || ronWindow.kind === 'kakan' || turnPlayerId !== ronWindow.discarderId) {
    return null;
  }

  const player = game.players[ronWindow.discarderId];
  if (!player || player.id !== ronWindow.discarderId) return null;
  const riverIndex = player.river.findIndex(tile => tile.id === ronWindow.tileId);
  return riverIndex >= 0 && riverIndex === player.river.length - 1 ? { seat: player.id, riverIndex } : null;
}
