import type { OpenMeld, PlayerState } from '../model/game.ts';
import type { WinningMeld } from '../analysis/winning-shape.ts';
import { tileKindKey } from '../model/tile.ts';
export const meldCount = (p: PlayerState): number => p.melds?.length ?? 0;
export const concealedSize = (p: PlayerState): number => 13 - 3 * meldCount(p);
export function winningMelds(melds: readonly OpenMeld[] = []): readonly WinningMeld[] {
  return melds.map(m => m.type === 'pon' ? {type:'triplet',tile:m.tiles[0].tile}
    : {type:'sequence',tiles:m.tiles.map(t=>t.tile) as unknown as Extract<WinningMeld,{type:'sequence'}>['tiles']});
}
export const isForbiddenDiscard = (p: PlayerState, id: string): boolean => {
  const tile = [...p.hand, ...(p.drawnTile ? [p.drawnTile] : [])].find(t=>t.id===id);
  return Boolean(tile && p.callDiscard?.forbiddenKinds.includes(tileKindKey(tile.tile)));
};
