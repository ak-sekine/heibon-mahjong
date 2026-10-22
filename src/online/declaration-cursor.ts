import type { PublicDeclarationEvent } from '../model/declaration.ts';
import { DECLARATION_BUBBLE_DURATION_MS } from '../rendering/declaration-bubbles.ts';

export type RecentDeclaration = Readonly<{
  event: PublicDeclarationEvent;
  remainingMs: number;
}>;

type RoundIdentity = Readonly<{ roundNumber: number; dealerId: number; honba: number }>;

export function collectRecentDeclarations(
  cursor: number | null,
  events: readonly PublicDeclarationEvent[],
  round: RoundIdentity,
  now: number,
): Readonly<{ cursor: number; recent: readonly RecentDeclaration[] }> {
  let nextCursor = cursor ?? 0;
  if (cursor === null) {
    return {
      cursor: Math.max(0, ...events.map(event => event.id)),
      recent: [],
    };
  }

  const recent: RecentDeclaration[] = [];
  for (const event of events) {
    if (event.id <= nextCursor) continue;
    nextCursor = Math.max(nextCursor, event.id);
    const age = now - event.occurredAt;
    if (event.roundNumber !== round.roundNumber || event.dealerId !== round.dealerId ||
        event.honba !== round.honba || age < 0 || age >= DECLARATION_BUBBLE_DURATION_MS) continue;
    recent.push({ event, remainingMs: DECLARATION_BUBBLE_DURATION_MS - age });
  }
  return { cursor: nextCursor, recent };
}
