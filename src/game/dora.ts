import type { PhysicalTile, WallState } from '../model/game.ts';
import { DEFAULT_GAME_RULES, normalizeGameRules } from '../model/rules.ts';

/** Logical dead-wall layout: 0–3 rinshan, even 4–12 indicators,
 * odd 5–13 corresponding hidden ura indicators. Confirmed kans reveal immediately.
 */
export const DORA_INDICATOR_INDICES = Object.freeze([4, 6, 8, 10, 12] as const);

/** Return references to existing physical tiles; never consume or copy a tile. */
export function exposedDoraIndicators(wall: WallState, rulesValue: unknown = DEFAULT_GAME_RULES): readonly PhysicalTile[] {
  if (wall.deadWall.length !== 14) throw new RangeError('Dead wall must contain 14 tiles');
  const rules = normalizeGameRules(rulesValue);
  return DORA_INDICATOR_INDICES.slice(0, 1 + (rules.kanDora ? wall.kanCount ?? 0 : 0)).map(index=>wall.deadWall[index]);
}

/** Hidden partners of the exposed indicators. Only win results may render these. */
export function uraDoraIndicators(wall: WallState, rulesValue: unknown = DEFAULT_GAME_RULES): readonly PhysicalTile[] {
  if (wall.deadWall.length !== 14) throw new RangeError('Dead wall must contain 14 tiles');
  const rules = normalizeGameRules(rulesValue);
  return DORA_INDICATOR_INDICES.slice(0, 1 + (rules.kanDora ? wall.kanCount ?? 0 : 0)).map(index => wall.deadWall[index + 1]);
}
