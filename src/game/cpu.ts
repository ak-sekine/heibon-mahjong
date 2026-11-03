import { concealedSize, winningMelds, isForbiddenDiscard } from './melds.ts';
import type { WinningMeld } from '../analysis/winning-shape.ts';
import { ShantenCalculator, tileCounts } from '../analysis/shanten.ts';
import { isWinningShape } from '../analysis/winning-shape.ts';
import { TILE_KINDS, ordinaryTile, tileKindKey } from '../model/tile.ts';
import { evaluateWin } from './win.ts';
import { exposedDoraIndicators } from './dora.ts';
import { getRiichiDiscardOptions, getRiichiDiscardOptionsWithinBudget } from './riichi.ts';
import { rulesForGame, type CpuDifficulty } from '../model/rules.ts';
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
  const candidates = rulesForGame(game).cpuDifficulty === 'beginner' ? options.filter(option => option.waitKindCount >= 3) : options;
  return [...candidates].map(option => ({ option, expectedHan: estimateCpuRiichiOptionHan(game, playerId, option) }))
    .sort((a,b) => b.option.waitKindCount - a.option.waitKindCount || b.expectedHan-a.expectedHan ||
      (a.option.tileId < b.option.tileId ? -1 : a.option.tileId > b.option.tileId ? 1 : 0))[0]?.option.tileId ?? null;
}

/** Average supported han across this wait after declaring riichi. The same win
 * evaluator used in live CPU play includes the configured ippatsu and dora rules. */
export function estimateCpuRiichiOptionHan(
  game: GameState,
  playerId: PlayerId,
  option: import('./riichi.ts').RiichiDiscardOption,
): number {
  const player = game.players[playerId];
  if (!player || !player.drawnTile || !option.waitingTileKinds.length) return 0;
  const tiles = [...player.hand, player.drawnTile].filter(tile => tile.id !== option.tileId);
  if (tiles.length !== player.hand.length || !tiles.length) return 0;
  const rules = rulesForGame(game);
  const players = [...game.players] as [PlayerState, PlayerState, PlayerState, PlayerState];
  players[playerId] = { ...player, hand: tiles, drawnTile: null, drawnTileSource: null,
    riichi: { declarationTileId: option.tileId, ippatsuEligible: rules.ippatsu, doubleRiichi: false } };
  const hypothetical = { ...game, players };
  const han = option.waitingTileKinds.map((kind, index) => evaluateWin(hypothetical, playerId,
    { id: `cpu-riichi-preview-${playerId}-${index}`, tile: ordinaryTile(kind) }, 'tsumo', { includeUraDora: false })?.totalHanIncludingDora ?? 0);
  return han.reduce((total, value) => total + value, 0) / han.length;
}

/** Only own tiles and public tiles cross the strategy boundary. */
export interface ShantenDiscardInput {
  readonly tiles: readonly import('../model/game.ts').PhysicalTile[];
  readonly openMelds?: readonly WinningMeld[];
  readonly forbiddenKinds?: readonly string[];
  readonly visibleTiles: readonly import('../model/game.ts').PhysicalTile[];
}
export interface RiichiDefenseInput {
  readonly ownTiles: readonly import('../model/game.ts').PhysicalTile[];
  readonly opponents: readonly Readonly<{
    readonly declarationTileId: string;
    readonly river: readonly import('../model/game.ts').PhysicalTile[];
  }>[];
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
  random: RandomSource = Math.random,
): Promise<string | null> {
  const player=game.players[playerId];
  if (player.riichi || player.hand.length+Number(Boolean(player.drawnTile))!==concealedSize(player)+1) throw new RangeError('Invalid normal discard');
  const steps=evaluationSteps({tiles:[...player.hand,...(player.drawnTile?[player.drawnTile]:[])], openMelds:winningMelds(player.melds), forbiddenKinds:player.callDiscard?.forbiddenKinds,
    visibleTiles:[...game.players.flatMap(p=>[...p.river,...(p.melds ?? []).flatMap(m=>m.tiles)]),...exposedDoraIndicators(game, game.rules)]});
  const slice = Math.max(0.5, Math.min(6, sliceMilliseconds));
  let deadline=performance.now()+slice;
  for (;;) {
    if (signal.aborted) return null;
    const result=steps.next();
    if (result.done) {
      const difficulty = rulesForGame(game).cpuDifficulty;
      return difficulty === 'advanced'
        ? chooseAdvancedFromEvaluations(publicRiichiDefenseInput(game, playerId), result.value)
        : chooseEvaluatedDiscard(result.value, difficulty, random);
    }
    if (performance.now()>=deadline) {
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      deadline=performance.now()+slice;
    }
  }
}

/** Bounded online fallback after sliced full evaluation is interrupted. Standard
 * preserves its historical physical-ID fallback; the other tiers keep their
 * core simplified/defensive policy using cheap shanten and public river data. */
export function chooseCpuFallbackDiscard(game: GameState, playerId: PlayerId, random: RandomSource = Math.random): string | null {
  const player = game.players[playerId];
  const tiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])];
  const legal = tiles.filter(tile => !isForbiddenDiscard(player, tile.id));
  if (!legal.length) return null;
  const difficulty = rulesForGame(game).cpuDifficulty;
  if (difficulty === 'standard') return [...legal].sort((a, b) => a.id.localeCompare(b.id))[0].id;
  const open = winningMelds(player.melds);
  const defense = difficulty === 'advanced' ? publicRiichiDefenseInput(game, playerId) : null;
  const counts = tileCounts(tiles.map(tile => tile.tile), tiles.length);
  const calculator = new ShantenCalculator();
  const scored = legal.map(tile => {
    const index = TILE_KINDS.findIndex(kind => tileKindKey(kind) === tileKindKey(tile.tile));
    counts[index]--;
    const shanten = calculator.calculate(counts, open.length).minimum;
    counts[index]++;
    return { tile, shanten, danger: defense ? riichiDanger(defense, tile.id) : 0 };
  });
  const minimum = Math.min(...scored.map(candidate => candidate.shanten));
  const best = scored.filter(candidate => candidate.shanten === minimum);
  if (difficulty === 'beginner') {
    const pick = random();
    if (!Number.isFinite(pick) || pick < 0 || pick >= 1) throw new RangeError('Random source must return a value in [0, 1)');
    return best[Math.floor(pick * best.length)].tile.id;
  }
  return best.sort((a, b) => a.danger - b.danger || a.tile.id.localeCompare(b.tile.id))[0].tile.id;
}

function chooseEvaluatedDiscard(values: readonly DiscardEvaluation[], difficulty: CpuDifficulty, random: RandomSource): string {
  if (difficulty === 'beginner') {
    const minimum = Math.min(...values.map(value => value.shanten));
    const candidates = values.filter(value => value.shanten === minimum);
    const pick = random();
    if (!Number.isFinite(pick) || pick < 0 || pick >= 1) throw new RangeError('Random source must return a value in [0, 1)');
    return candidates[Math.floor(pick * candidates.length)].tileId;
  }
  return [...values].sort(compareDiscardEvaluations)[0].tileId;
}

export function chooseShantenDiscardFromPublic(input: ShantenDiscardInput, difficulty: CpuDifficulty = 'standard', random: RandomSource = Math.random): string {
  return chooseEvaluatedDiscard(evaluateShantenDiscards(input), difficulty, random);
}

export function chooseShantenDiscard(game: GameState, playerId: PlayerId): string {
  const player=game.players[playerId];
  if (player.riichi) throw new RangeError('Shanten strategy cannot bypass riichi tsumogiri');
  if (player.hand.length+Number(Boolean(player.drawnTile))!==concealedSize(player)+1) throw new RangeError('CPU selection requires fourteen tiles');
  const difficulty = rulesForGame(game).cpuDifficulty;
  const input = publicShantenInput(game, playerId);
  if (difficulty === 'advanced') return chooseAdvancedFromEvaluations(publicRiichiDefenseInput(game, playerId), evaluateShantenDiscards(input));
  return chooseShantenDiscardFromPublic(input, difficulty);
}

/** Public genbutsu against riichi declarations; no hidden hands or wall data. */
export function publicRiichiDefenseInput(game: GameState, playerId: PlayerId): RiichiDefenseInput {
  const player = game.players[playerId];
  return {
    ownTiles: [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])],
    opponents: game.players.filter(opponent => opponent.id !== playerId && opponent.riichi).map(opponent => ({
      declarationTileId: opponent.riichi!.declarationTileId,
      river: opponent.river,
    })),
  };
}

export function riichiDanger(input: RiichiDefenseInput, tileId: string): number {
  const tile = input.ownTiles.find(candidate => candidate.id === tileId);
  if (!tile) return Number.MAX_SAFE_INTEGER;
  const kind = tileKindKey(tile.tile);
  return input.opponents.reduce((risk, opponent) => {
    const declaration = opponent.river.findIndex(candidate => candidate.id === opponent.declarationTileId);
    const genbutsu = declaration >= 0 && opponent.river.slice(declaration).some(candidate => tileKindKey(candidate.tile) === kind);
    return risk + Number(!genbutsu);
  }, 0);
}

/** Advanced defense only breaks ties after shanten and visible ukeire. */
export function chooseAdvancedShantenDiscard(game: GameState, playerId: PlayerId): string {
  const player = game.players[playerId];
  if (player.riichi || player.hand.length + Number(Boolean(player.drawnTile)) !== concealedSize(player) + 1) throw new RangeError('Invalid normal discard');
  return chooseAdvancedFromEvaluations(publicRiichiDefenseInput(game, playerId), evaluateShantenDiscards(publicShantenInput(game, playerId)));
}

function publicShantenInput(game: GameState, playerId: PlayerId): ShantenDiscardInput {
  const player = game.players[playerId];
  return {
    tiles: [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])],
    openMelds: winningMelds(player.melds), forbiddenKinds: player.callDiscard?.forbiddenKinds,
    visibleTiles: [...game.players.flatMap(p => [...p.river, ...(p.melds ?? []).flatMap(m => m.tiles)]), ...exposedDoraIndicators(game, game.rules)],
  };
}

function chooseAdvancedFromEvaluations(input: RiichiDefenseInput, values: readonly DiscardEvaluation[]): string {
  return [...values].sort((a, b) => a.shanten - b.shanten || b.effectiveTileCount - a.effectiveTileCount ||
    b.effectiveKindCount - a.effectiveKindCount || riichiDanger(input, a.tileId) - riichiDanger(input, b.tileId) ||
    Number(a.isRed) - Number(b.isRed) || (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0))[0].tileId;
}
