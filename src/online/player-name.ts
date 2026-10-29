import type { PlayerGameView } from './game-view.ts';

/** Use the same CPU names on the board, round summary, and result details. */
export function onlinePlayerName(view: PlayerGameView, playerId: number): string {
  const seat = view.seats[playerId];
  if (!seat || seat.control !== 'cpu') return seat?.name ?? '';
  const cpuSeats = view.seats.filter(candidate => candidate.control === 'cpu')
    .sort((first, second) => first.seat - second.seat);
  const index = cpuSeats.findIndex(candidate => candidate.seat === seat.seat);
  return index < 0 ? seat.name : `CPU${index + 1}`;
}
