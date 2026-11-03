import type { GameState, OpenMeld, PaoYakuId, PlayerId } from '../model/game.ts';
import { tileKindKey, type Honor } from '../model/tile.ts';

const dragonNames = ['white', 'green', 'red'] as const;
const windNames = ['east', 'south', 'west', 'north'] as const;

function setKinds(game: GameState, playerId: PlayerId): Set<string> {
  const player = game.players[playerId];
  const kinds = new Set<string>();
  // Only completed melds participate in pao establishment. Concealed hand
  // triplets are not public sets; ankan/kakan are already represented as melds.
  for (const meld of player.melds ?? []) {
    if (meld.type === 'chi') continue;
    const keys = meld.tiles.map(tile => tileKindKey(tile.tile));
    if (keys.length < 3 || keys.some(key => key !== keys[0])) continue;
    kinds.add(keys[0]);
  }
  return kinds;
}

function honorKey(honor: Honor): string {
  return tileKindKey({ category: 'honor', honor });
}

/** Record only the discard call that completes the player's third dragon or fourth wind set. */
export function recordSetPao(game: GameState, after: GameState, meld: OpenMeld): GameState {
  if (game.rules?.pao !== true || !['pon', 'daiminkan'].includes(meld.type) || meld.fromPlayerId === after.turnPlayerId) return after;
  const playerId = after.turnPlayerId;
  const priorSets = setKinds(game, playerId);
  const sets = setKinds(after, playerId);
  const callKey = tileKindKey(meld.tiles[0].tile);
  const responsibilities = { ...after.paoResponsibilities };
  const order = [...(after.paoResponsibilityOrder ?? [])];
  let changed = false;
  const dragonsComplete = dragonNames.every(honor => sets.has(honorKey(honor)));
  const exposesPreviouslyCompleteSet = meld.type === 'daiminkan' || !priorSets.has(callKey);
  if (dragonsComplete && exposesPreviouslyCompleteSet && dragonNames.some(honor => honorKey(honor) === callKey) &&
      responsibilities.daisangen === undefined) {
    responsibilities.daisangen = meld.fromPlayerId;
    order.push('daisangen');
    changed = true;
  }
  const windsComplete = windNames.every(honor => sets.has(honorKey(honor)));
  if (windsComplete && exposesPreviouslyCompleteSet && windNames.some(honor => honorKey(honor) === callKey) &&
      responsibilities.daisuushii === undefined) {
    responsibilities.daisuushii = meld.fromPlayerId;
    order.push('daisuushii');
    changed = true;
  }
  return changed ? { ...after, paoResponsibilities: responsibilities, paoResponsibilityOrder: order } : after;
}

/** Four-kan responsibility is set only on the fourth completed daiminkan. */
export function recordFourKanPao(game: GameState, option: { playerId: PlayerId; meld: OpenMeld; fromPlayerId: PlayerId },
  after: GameState): GameState {
  const priorOwnKanCount = (game.players[option.playerId].melds ?? []).filter(meld => meld.tiles.length === 4).length;
  if (game.rules?.pao !== true || option.meld.type !== 'daiminkan' || option.playerId === option.fromPlayerId ||
      priorOwnKanCount !== 3 || after.paoResponsibilities?.suukantsu !== undefined) return after;
  const order = [...(after.paoResponsibilityOrder ?? [])];
  order.push('suukantsu');
  return { ...after, paoResponsibilities: { ...after.paoResponsibilities, suukantsu: option.fromPlayerId },
    paoResponsibilityOrder: order };
}

export function paoResponsiblePlayer(game: GameState, yakuId: PaoYakuId): PlayerId | undefined {
  if (game.rules?.pao !== true) return undefined;
  const playerId = game.paoResponsibilities?.[yakuId];
  return playerId !== undefined && [0, 1, 2, 3].includes(playerId) ? playerId : undefined;
}
