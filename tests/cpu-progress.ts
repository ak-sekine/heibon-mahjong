import type { OnlineGameSession } from '../src/online/game-view.ts';

/** A called discard leaves the river, but remains in discardHistory. */
export function cpuMadeProgress(before: OnlineGameSession, after: OnlineGameSession): boolean {
  if (after.gameRevision <= before.gameRevision) return false;
  // The baseline is taken before a human discard. A round ending on that
  // discard alone does not establish that a CPU action took place.
  if (after.status !== 'playing' && after.gameRevision > before.gameRevision + 1) return true;
  return after.match.game.players.some((player, seat) => {
    if (player.control !== 'cpu') return false;
    const previous = before.match.game.players[seat];
    return (player.discardHistory?.length ?? player.river.length) >
      (previous.discardHistory?.length ?? previous.river.length) ||
      (player.melds?.length ?? 0) > (previous.melds?.length ?? 0);
  });
}
