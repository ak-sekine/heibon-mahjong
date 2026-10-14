import { ShantenCalculator, tileCounts } from '../analysis/shanten.ts';
import { isWinningShape } from '../analysis/winning-shape.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey } from '../model/tile.ts';
import { exposedDoraIndicators } from './dora.ts';
import { getRiichiDiscardOptions } from './riichi.ts';
import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { RandomSource } from './shuffle.ts';

/** Replaceable strategy; knows nothing about turns, timers or the DOM. */
export type DiscardStrategy = (player: PlayerState, random: RandomSource) => string;

export const chooseRandomDiscard: DiscardStrategy = (player, random = Math.random) => {
  if (player.hand.length !== 13 || player.drawnTile === null) {
    throw new RangeError('CPU selection requires fourteen tiles');
  }
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random source must return a value in [0, 1)');
  }
  const candidates = [...player.hand, player.drawnTile];
  return candidates[Math.floor(value * candidates.length)].id;
};

/** Most wait kinds, then lexicographically ascending physical ID. No mutation/RNG. */
export function chooseCpuRiichiDiscard(game: GameState, playerId: PlayerId, points: number): string | null {
  if (game.players[playerId].control !== 'cpu') return null;
  return [...getRiichiDiscardOptions(game, playerId, points)]
    .sort((a,b) => b.waitKindCount - a.waitKindCount || (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0))[0]?.tileId ?? null;
}

/** Only own tiles and public tiles cross the strategy boundary. */
export interface ShantenDiscardInput {
  readonly tiles: readonly import('../model/game.ts').PhysicalTile[];
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
  const counts = tileCounts(input.tiles.map(t=>t.tile),14);
  if (new Set(input.tiles.map(t=>t.id)).size !== 14) throw new RangeError('Duplicate physical ID');
  const calculator = new ShantenCalculator();
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
    if (!counts[discard]) continue;
    counts[discard]--;
    const shanten=calculator.calculate(counts).minimum;
    counts[discard]++;
    minimum=Math.min(minimum,shanten);
    candidates.set(discard,{shanten,effectiveTileCount:0,effectiveKindCount:0});
  }
  // Only minimum-shanten candidates can win; avoid useless hypothetical draws.
  for (const [discard,candidate] of candidates) {
    if (candidate.shanten !== minimum) continue;
    counts[discard]--;
    let effectiveTileCount=0, effectiveKindCount=0;
    for (let draw=0;draw<34;draw++) {
      if (counts[draw]>=4) continue;
      counts[draw]++;
      let improves=false;
      if (minimum===0) {
        const tiles=counts.flatMap((n,i)=>Array.from({length:n},()=>ordinaryTile(TILE_KINDS[i])));
        improves=isWinningShape(tiles);
      } else {
        for (let next=0;next<34;next++) {
          if (!counts[next] || next===draw) continue;
          counts[next]--;
          improves=calculator.calculate(counts).minimum<minimum;
          counts[next]++;
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
  return input.tiles.map(tile=>({tileId:tile.id,isRed:tile.tile.isRed,...candidates.get(kindIndex.get(tileKindKey(tile.tile))!)!}));
}

export function evaluateShantenDiscards(input: ShantenDiscardInput, reportCache?: (entries: number) => void): readonly DiscardEvaluation[] {
  const steps=evaluationSteps(input, reportCache);
  let result=steps.next();
  while (!result.done) result=steps.next();
  return result.value;
}

export async function chooseShantenDiscardAsync(game: GameState, playerId: PlayerId, signal: AbortSignal): Promise<string | null> {
  const player=game.players[playerId];
  if (player.riichi || !player.drawnTile || player.hand.length!==13) throw new RangeError('Invalid normal discard');
  const steps=evaluationSteps({tiles:[...player.hand,player.drawnTile],
    visibleTiles:[...game.players.flatMap(p=>p.river),...exposedDoraIndicators(game)]});
  let deadline=performance.now()+6;
  for (;;) {
    if (signal.aborted) return null;
    const result=steps.next();
    if (result.done) return [...result.value].sort(compareDiscardEvaluations)[0].tileId;
    if (performance.now()>=deadline) {
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      deadline=performance.now()+6;
    }
  }
}

export function chooseShantenDiscardFromPublic(input: ShantenDiscardInput): string {
  return [...evaluateShantenDiscards(input)].sort(compareDiscardEvaluations)[0].tileId;
}

export function chooseShantenDiscard(game: GameState, playerId: PlayerId): string {
  const player=game.players[playerId];
  if (player.riichi) throw new RangeError('Shanten strategy cannot bypass riichi tsumogiri');
  if (!player.drawnTile || player.hand.length!==13) throw new RangeError('CPU selection requires fourteen tiles');
  return chooseShantenDiscardFromPublic({tiles:[...player.hand,player.drawnTile],
    visibleTiles:[...game.players.flatMap(p=>p.river),...exposedDoraIndicators(game)]});
}
