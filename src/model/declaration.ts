import type { GameState, OpenMeld, PlayerId } from './game.ts';

export type DeclarationKind = 'riichi' | 'pon' | 'kan' | 'chi' | 'ron';

/** Public display event. It deliberately contains no tile or hand information. */
export type PublicDeclarationEvent = Readonly<{
  id: number;
  roundNumber: number;
  dealerId: PlayerId;
  honba: number;
  seat: PlayerId;
  kind: DeclarationKind;
  occurredAt: number;
}>;

export type DeclarationSignal = Readonly<{
  seat: PlayerId;
  kind: DeclarationKind;
}>;

function meldKey(meld: OpenMeld): string {
  return `${meld.type}:${meld.tiles.map(tile => tile.id).sort().join(',')}`;
}

function declarationForMeld(meld: OpenMeld): DeclarationKind {
  if (meld.type === 'chi') return 'chi';
  if (meld.type === 'pon') return 'pon';
  return 'kan';
}

/** Find declarations established between two game states without exposing tiles. */
export function declarationsBetween(
  previous: GameState | null,
  next: GameState,
): readonly DeclarationSignal[] {
  if (!previous) return [];
  const events: DeclarationSignal[] = [];

  for (const player of next.players) {
    const oldPlayer = previous.players[player.id];
    if (!oldPlayer.riichi && player.riichi) events.push({ seat: player.id, kind: 'riichi' });

    const oldMelds = new Set((oldPlayer.melds ?? []).map(meldKey));
    for (const meld of player.melds ?? []) {
      if (!oldMelds.has(meldKey(meld))) events.push({ seat: player.id, kind: declarationForMeld(meld) });
    }
  }

  const win = next.winResult;
  if (next.phase === 'won' && win?.winMethod === 'ron' &&
      (previous.phase !== 'won' || previous.winResult !== win)) {
    for (const winner of win.winners) events.push({ seat: winner.winnerId, kind: 'ron' });
  }
  return events;
}
