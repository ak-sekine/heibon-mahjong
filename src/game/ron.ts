import { completeKan } from './kan.ts';
import { resolveDiscardCalls } from './calls.ts';
import { concealedSize, winningMelds } from './melds.ts';
import type { GameState, PhysicalTile, PlayerId, PlayerState, RonCandidate } from '../model/game.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey, type Tile, type TileKind } from '../model/tile.ts';
import { isWinningShape } from '../analysis/winning-shape.ts';
import { evaluateWin } from './win.ts';

/** Shape waits deliberately ignore yaku; an impossible fifth copy is excluded. */
export function getWaitingTileKinds(hand: readonly Tile[], fixed: readonly import('../analysis/winning-shape.ts').WinningMeld[] = []): readonly TileKind[] {
  if (hand.length !== 13 - fixed.length*3) throw new RangeError('Waiting tiles require thirteen tiles');
  return TILE_KINDS.filter(kind => {
    if ([...hand,...fixed.flatMap(m=>m.type==='triplet'?Array.from({length:m.kan?4:3},()=>m.tile):m.tiles)].filter(t => tileKindKey(t) === tileKindKey(kind)).length >= 4) return false;
    return isWinningShape([...hand, ordinaryTile(kind)], fixed);
  });
}
export function isDiscardFuriten(player: PlayerState): boolean {
  const waits = new Set(getWaitingTileKinds(player.hand.map(t => t.tile), winningMelds(player.melds)).map(tileKindKey));
  return [...(player.discardHistory ?? []), ...player.river].some(t => waits.has(tileKindKey(t.tile)));
}
export function isFuriten(player: PlayerState): boolean {
  return player.temporaryFuriten || Boolean(player.riichi?.passedRon) || isDiscardFuriten(player);
}
/** The window must still point at the discarder seat's latest physical discard. */
export function getRonTile(game: GameState): PhysicalTile | null {
  const window = game.ronWindow;
  if (game.phase !== 'awaiting-ron' || game.winResult !== null || !window ||
      game.turnPlayerId !== window.discarderId) return null;
  if(window.kan) return window.kan.tile;
  const player = game.players[window.discarderId];
  if (!player || player.id !== window.discarderId || player.hand.length !== concealedSize(player) ||
      player.drawnTile !== null || player.drawnTileSource !== null) return null;
  const tile = player.river.at(-1);
  return tile?.id === window.tileId ? tile : null;
}
export function getRonCandidates(game: GameState): readonly RonCandidate[] {
  const tile = getRonTile(game);
  if (!tile) return [];
  const discarderId = game.ronWindow!.discarderId;
  const candidates: RonCandidate[] = [];
  for (let offset = 1; offset <= 3; offset++) {
    const id = ((discarderId + offset) % 4) as PlayerId;
    const player = game.players[id];
    if (player.id !== id || player.hand.length !== concealedSize(player) || player.drawnTile) continue;
    try {
      if (isFuriten(player)) continue;
      const result = evaluateWin(game, id, tile, 'ron');
      if (result && (game.ronWindow?.kind!=='ankan' || result.candidate.shape==='thirteen-orphans')) candidates.push({ ...result, winMethod: 'ron', discarderId });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return candidates;
}
export function canDeclareRon(game: GameState, playerId: PlayerId): boolean {
  return getRonCandidates(game).some(c => c.winnerId === playerId);
}
function resolve(game: GameState, winners: readonly RonCandidate[]): GameState {
  if (!getRonTile(game)) throw new RangeError('No current ron window');
  const { discarderId, tileId } = game.ronWindow!;
  if (winners.length) return { ...game, phase: 'won', ronWindow: null, pendingRiichi: null,
    winResult: { winMethod: 'ron', winningTile:getRonTile(game)!, discarderId, winningTileId: tileId, winners } };
  return game.ronWindow?.kan ? completeKan(game,game.ronWindow.kan) : resolveDiscardCalls(game);
}
/** Called after every legal discard. CPU declarations wait for the human decision. */
export function resolveDiscardRon(game: GameState): GameState {
  if (!getRonTile(game)) throw new RangeError('No current ron window');
  const candidates = getRonCandidates(game);
  if (candidates.some(c => game.players[c.winnerId].control === 'human')) return game;
  return resolve(game, candidates);
}
/** The human decision atomically includes all automatic CPU declarations. */
export function declareRon(game: GameState, playerId: PlayerId): GameState {
  const candidates = getRonCandidates(game);
  if (!candidates.some(c => c.winnerId === playerId)) throw new RangeError('Ron is not allowed now');
  if (candidates.some(c => c.winnerId !== playerId && game.players[c.winnerId].control === 'human')) {
    throw new RangeError('Human ron decision is still required');
  }
  return resolve(game, candidates);
}
export function passRon(game: GameState, playerId: PlayerId): GameState {
  if (game.players[playerId]?.control !== 'human' || !canDeclareRon(game, playerId)) {
    throw new RangeError('Passing ron is not allowed now');
  }
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  const player = players[playerId];
  players[playerId] = { ...player, temporaryFuriten: true,
    riichi: player.riichi ? { ...player.riichi, passedRon: true } : null };
  const passed = { ...game, players };
  return resolve(passed, getRonCandidates(passed));
}
