import { concealedSize, winningMelds, isForbiddenDiscard } from './melds.ts';
import type { WinningMeld } from '../analysis/winning-shape.ts';
import { ShantenCalculator, tileCounts } from '../analysis/shanten.ts';
import { isWinningShape } from '../analysis/winning-shape.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey } from '../model/tile.ts';
import { exposedDoraIndicators } from './dora.ts';
import { getRiichiDiscardOptions, getRiichiDiscardOptionsWithinBudget } from './riichi.ts';
import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { RandomSource } from './shuffle.ts';

/** Replaceable strategy; knows nothing about turns, timers or the DOM. */
export type DiscardStrategy = (player: PlayerState, random: RandomSource) => string;

export const chooseRandomDiscard: DiscardStrategy = (player, random = Math.random) => {
  if (player.hand.length + Number(Boolean(player.drawnTile)) !== concealedSize(player)+1) {
    throw new RangeError('CPU selection requires fourteen tiles');
  }
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random source must return a value in [0, 1)');
  }
  const candidates = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])].filter(t=>!isForbiddenDiscard(player,t.id));
  return candidates[Math.floor(value * candidates.length)].id;
};

/** Most wait kinds, then lexicographically ascending physical ID. No mutation/RNG. */
export function chooseCpuRiichiDiscard(game: GameState, playerId: PlayerId, points: number, budgetMs = Number.POSITIVE_INFINITY): string | null {
  if (game.players[playerId].control !== 'cpu') return null;
  const options = Number.isFinite(budgetMs)
    ? getRiichiDiscardOptionsWithinBudget(game, playerId, points, budgetMs)
    : getRiichiDiscardOptions(game, playerId, points);
  if (options === null) return null;
  return [...options]
    .sort((a,b) => b.waitKindCount - a.waitKindCount || (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0))[0]?.tileId ?? null;
}

/** Only own tiles and public tiles cross the strategy boundary. */
export interface ShantenDiscardInput {
  readonly tiles: readonly import('../model/game.ts').PhysicalTile[];
  readonly openMelds?: readonly WinningMeld[];
  readonly forbiddenKinds?: readonly string[];
  readonly visibleTiles: readonly import('../model/game.ts').PhysicalTile[];
}
export interface DiscardEvaluation {
  readonly tileId: string;
  readonly shanten: number;
  readonly effectiveTileCount: number;
  readonly effectiveKindCount: number;
  readonly isRed: boolean;
}

export function compareDiscardEvaluations(a: DiscardEvaluation, b: DiscardEvaluation): number {
  return a.shanten-b.shanten || b.effectiveTileCount-a.effectiveTileCount ||
    b.effectiveKindCount-a.effectiveKindCount || Number(a.isRed)-Number(b.isRed) ||
    (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0);
}

function* evaluationSteps(input: ShantenDiscardInput, reportCache?: (entries: number) => void): Generator<void, readonly DiscardEvaluation[]> {
  const open=input.openMelds ?? [];
  const size=14-3*open.length;
  const counts = tileCounts(input.tiles.map(t=>t.tile),size);
  if (new Set(input.tiles.map(t=>t.id)).size !== size) throw new RangeError('Duplicate physical ID');
  const calculator = new ShantenCalculator();
  const openCounts = Array<number>(34).fill(0);
  for (const meld of open) for (const tile of meld.type==='triplet'?Array.from({length:meld.kan?4:3},()=>meld.tile):meld.tiles) openCounts[TILE_KINDS.findIndex(k=>tileKindKey(k)===tileKindKey(tile))]++;
  const kindIndex = new Map(TILE_KINDS.map((k,i)=>[tileKindKey(k),i]));
  const visible = Array<number>(34).fill(0);
  // Own discard remains visible in the river, so availability is identical for all candidates.
  const seen = new Set<string>();
  for (const tile of [...input.tiles,...input.visibleTiles]) {
    if (seen.has(tile.id)) continue;
    seen.add(tile.id);
    const i=kindIndex.get(tileKindKey(tile.tile));
    if (i===undefined || ++visible[i]>4) throw new RangeError('Invalid visible tiles');
  }
  const candidates = new Map<number, Omit<DiscardEvaluation,'tileId'|'isRed'>>();
  let minimum=8;
  for (let discard=0;discard<34;discard++) {
    if (!counts[discard] || input.forbiddenKinds?.includes(tileKindKey(TILE_KINDS[discard]))) continue;
    counts[discard]--;
    const shanten=calculator.calculate(counts,open.length).minimum;
    counts[discard]++;
    minimum=Math.min(minimum,shanten);
    candidates.set(discard,{shanten,effectiveTileCount:0,effectiveKindCount:0});
    yield;
  }
  // Only minimum-shanten candidates can win; avoid useless hypothetical draws.
  for (const [discard,candidate] of candidates) {
    if (candidate.shanten !== minimum) continue;
    counts[discard]--;
    let effectiveTileCount=0, effectiveKindCount=0;
    for (let draw=0;draw<34;draw++) {
      if (counts[draw]+openCounts[draw]>=4) continue;
      counts[draw]++;
      let improves=false;
      if (minimum===0) {
        const tiles=counts.flatMap((n,i)=>Array.from({length:n},()=>ordinaryTile(TILE_KINDS[i])));
        improves=isWinningShape(tiles,open);
      } else {
        for (let next=0;next<34;next++) {
          if (!counts[next] || next===draw) continue;
          counts[next]--;
          improves=calculator.calculate(counts,open.length).minimum<minimum;
          counts[next]++;
          yield;
          if (improves) break;
        }
      }
      counts[draw]--;
      if (improves) { effectiveKindCount++; effectiveTileCount+=4-visible[draw]; }
      yield;
    }
    counts[discard]++;
    candidates.set(discard,{...candidate,effectiveTileCount,effectiveKindCount});
  }
  reportCache?.(calculator.cacheSize);
  return input.tiles.filter(t=>!input.forbiddenKinds?.includes(tileKindKey(t.tile))).map(tile=>({tileId:tile.id,isRed:tile.tile.isRed,...candidates.get(kindIndex.get(tileKindKey(tile.tile))!)!}));
}

export function evaluateShantenDiscards(input: ShantenDiscardInput, reportCache?: (entries: number) => void): readonly DiscardEvaluation[] {
  const steps=evaluationSteps(input, reportCache);
  let result=steps.next();
  while (!result.done) result=steps.next();
  return result.value;
}

export async function chooseShantenDiscardAsync(
  game: GameState,
  playerId: PlayerId,
  signal: AbortSignal,
  sliceMilliseconds = 6,
): Promise<string | null> {
  const player=game.players[playerId];
  if (player.riichi || player.hand.length+Number(Boolean(player.drawnTile))!==concealedSize(player)+1) throw new RangeError('Invalid normal discard');
  const steps=evaluationSteps({tiles:[...player.hand,...(player.drawnTile?[player.drawnTile]:[])], openMelds:winningMelds(player.melds), forbiddenKinds:player.callDiscard?.forbiddenKinds,
    visibleTiles:[...game.players.flatMap(p=>[...p.river,...(p.melds ?? []).flatMap(m=>m.tiles)]),...exposedDoraIndicators(game)]});
  const slice = Math.max(0.5, Math.min(6, sliceMilliseconds));
  let deadline=performance.now()+slice;
  for (;;) {
    if (signal.aborted) return null;
    const result=steps.next();
    if (result.done) return [...result.value].sort(compareDiscardEvaluations)[0].tileId;
    if (performance.now()>=deadline) {
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      deadline=performance.now()+slice;
    }
  }
}

export function chooseShantenDiscardFromPublic(input: ShantenDiscardInput): string {
  return [...evaluateShantenDiscards(input)].sort(compareDiscardEvaluations)[0].tileId;
}

export function chooseShantenDiscard(game: GameState, playerId: PlayerId): string {
  const player=game.players[playerId];
  if (player.riichi) throw new RangeError('Shanten strategy cannot bypass riichi tsumogiri');
  if (player.hand.length+Number(Boolean(player.drawnTile))!==concealedSize(player)+1) throw new RangeError('CPU selection requires fourteen tiles');
  return chooseShantenDiscardFromPublic({tiles:[...player.hand,...(player.drawnTile?[player.drawnTile]:[])], openMelds:winningMelds(player.melds), forbiddenKinds:player.callDiscard?.forbiddenKinds,
    visibleTiles:[...game.players.flatMap(p=>[...p.river,...(p.melds ?? []).flatMap(m=>m.tiles)]),...exposedDoraIndicators(game)]});
}
