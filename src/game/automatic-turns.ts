import type { GameState } from '../model/game.ts';
import { drawOrStop } from './draw.ts';
import { discardTile } from './discard.ts';
import { chooseRandomDiscard, type DiscardStrategy } from './cpu.ts';
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
  async run(read: () => GameState, write: (game: GameState) => void): Promise<void> {
    if (this.running) return;
    const token = this.generation;
    const abort = new AbortController();
    this.active = abort;
    const current = () => token === this.generation && !abort.signal.aborted;
    try {
      while (current()) {
        let game = read();
        if (game.phase === 'wall-exhausted') return;
        if (game.phase === 'awaiting-draw') {
          game = drawOrStop(game);
          write(game);
          if (!current() || game.phase === 'wall-exhausted') return;
        }
        const player = game.players[game.turnPlayerId];
        if (player.control === 'human') return;
        await (this.options.wait ?? waitForTurn)(300, abort.signal);
        if (!current()) return;
        // Read again after waiting, never commit an old snapshot.
        game = read();
        if (game.turnPlayerId !== player.id || game.phase !== 'awaiting-discard') return;
        const id = (this.options.chooseDiscard ?? chooseRandomDiscard)(game.players[player.id], this.options.random ?? Math.random);
        write(discardTile(game, player.id, id));
      }
    } finally {
      if (token === this.generation) this.active = null;
    }
  }
}
