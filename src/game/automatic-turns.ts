import { chooseCpuKan, declareKan } from './kan.ts';
import type { MatchState } from '../model/match.ts';
import { updateMatchGame } from './match.ts';
import { declareRiichi } from './riichi.ts';
import type { GameState } from '../model/game.ts';
import { canDeclareTsumo, declareTsumo } from './tsumo.ts';
import { drawOrStop } from './draw.ts';
import { discardTile } from './discard.ts';
import { chooseCpuRiichiDiscard, chooseShantenDiscardAsync, type DiscardStrategy } from './cpu.ts';
import type { RandomSource } from './shuffle.ts';

export type Wait = (milliseconds: number, signal: AbortSignal) => Promise<void>;
export interface AutomaticTurnOptions {
  readonly random?: RandomSource;
  readonly chooseDiscard?: DiscardStrategy;
  readonly wait?: Wait;
}

/** Aborting clears the timer and resolves the wait; the runner checks its generation. */
export const waitForTurn: Wait = (milliseconds, signal) => new Promise(resolve => {
  if (signal.aborted) { resolve(); return; }
  const finish = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', finish);
    resolve();
  };
  const timer = setTimeout(finish, milliseconds);
  signal.addEventListener('abort', finish, { once: true });
});

/** Scheduling only: all tile changes go through pure game functions. */
export class AutomaticTurnRunner {
  private generation = 0;
  private active: AbortController | null = null;
  private readonly options: AutomaticTurnOptions;
  constructor(options: AutomaticTurnOptions = {}) { this.options = options; }
  get running(): boolean { return this.active !== null; }
  cancel(): void {
    this.generation++;
    this.active?.abort();
    this.active = null;
  }
  async runMatch(read: () => MatchState, write: (match: MatchState) => void, onComplete: () => void = () => {}): Promise<void> {
    return this.runLoop(() => read().game, game => write(updateMatchGame(read(), game)), onComplete, { read, write });
  }
  run(read: () => GameState, write: (game: GameState) => void, onComplete: () => void = () => {}): Promise<void> {
    return this.runLoop(read, write, onComplete);
  }
  private async runLoop(read: () => GameState, write: (game: GameState) => void, onComplete: () => void, matchAccess?: { read: () => MatchState; write: (match: MatchState) => void }): Promise<void> {
    if (this.running) return;
    const token = this.generation;
    const abort = new AbortController();
    this.active = abort;
    const current = () => token === this.generation && !abort.signal.aborted;
    try {
      while (current()) {
        if (matchAccess && matchAccess.read().status !== 'playing') return;
        let game = read();
        if (game.phase === 'wall-exhausted' || game.phase === 'won' || (game.phase === 'awaiting-ron' || game.phase === 'awaiting-call') || game.pendingRiichi) return;
        if (game.phase === 'awaiting-draw') {
          game = drawOrStop(game);
          write(game);
          if (!current() || game.phase === 'wall-exhausted') return;
        }
        const player = game.players[game.turnPlayerId];
        if (player.control === 'human') return;
        const scheduledGame = game;
        await (this.options.wait ?? waitForTurn)(300, abort.signal);
        if (!current()) return;
        // Read again after waiting, never commit an old snapshot.
        game = read();
        if (!current() || game !== scheduledGame || (matchAccess && matchAccess.read().status !== 'playing') || game.turnPlayerId !== player.id || game.phase !== 'awaiting-discard') return;
        if (canDeclareTsumo(game, player.id)) {
          write(declareTsumo(game, player.id));
          return;
        }
        const kan=chooseCpuKan(game,player.id);
        if(kan) { write(declareKan(game,player.id,kan.id)); continue; }
        const currentPlayer = game.players[player.id];
        if (!currentPlayer.riichi && matchAccess) {
          const match = matchAccess.read();
          const riichiId = chooseCpuRiichiDiscard(game, player.id, match.points[player.id]);
          if (riichiId !== null) {
            matchAccess.write(declareRiichi(match, player.id, riichiId));
            continue;
          }
        }
        const id = currentPlayer.riichi ? currentPlayer.drawnTile!.id : this.options.chooseDiscard ? this.options.chooseDiscard(currentPlayer, this.options.random ?? Math.random) : await chooseShantenDiscardAsync(game, player.id, abort.signal);
        if (id === null || !current() || read() !== game || (matchAccess && matchAccess.read().status !== 'playing')) return;
        write(discardTile(game, player.id, id));
      }
    } finally {
      if (token === this.generation) {
        this.active = null;
        onComplete();
      }
    }
  }
}
