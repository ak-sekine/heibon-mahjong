import type { GameState } from '../model/game.ts';
import { canDeclareTsumo, declareTsumo } from '../game/tsumo.ts';
import { canDeclareRon, declareRon, passRon } from '../game/ron.ts';
import { startGame } from '../game/start.ts';
import { canDiscard, discardTile } from '../game/discard.ts';
import { AutomaticTurnRunner, type AutomaticTurnOptions } from '../game/automatic-turns.ts';

/** UI selection is separate from the immutable game state. */
export class GameController {
  game: GameState;
  selectedTileId: string | null = null;
  private readonly start: () => GameState;
  private readonly runner: AutomaticTurnRunner;
  private readonly onChange: () => void;
  constructor(start: () => GameState = startGame, options: AutomaticTurnOptions & { onChange?: () => void } = {}) {
    this.start = start;
    this.game = start();
    this.runner = new AutomaticTurnRunner(options);
    this.onChange = options.onChange ?? (() => {});
  }
  get progressing(): boolean { return this.runner.running; }
  select(tileId: string): void {
    const player = this.game.players[0];
    if (this.progressing || !canDiscard(this.game, 0) || ![...player.hand, player.drawnTile].some(tile => tile?.id === tileId)) return;
    this.selectedTileId = this.selectedTileId === tileId ? null : tileId;
  }
  get canConfirm(): boolean { return !this.progressing && this.selectedTileId !== null && canDiscard(this.game, 0); }
  confirm(): Promise<void> {
    if (!this.canConfirm) return Promise.resolve();
    this.game = discardTile(this.game, 0, this.selectedTileId!);
    this.selectedTileId = null;
    this.onChange();
    return this.runner.run(() => this.game, game => { this.game = game; this.onChange(); }, this.onChange);
  }
  get canTsumo(): boolean { return this.game.players[0].control === 'human' && !this.progressing && canDeclareTsumo(this.game, 0); }
  declareTsumo(): void {
    if (!this.canTsumo) return;
    const won = declareTsumo(this.game, 0);
    this.runner.cancel();
    this.game = won;
    this.selectedTileId = null;
    this.onChange();
  }
  get canRon(): boolean { return this.game.players[0].control === 'human' && canDeclareRon(this.game, 0); }
  declareRon(): void {
    if (!this.canRon) throw new RangeError('Human ron is not allowed now');
    const won = declareRon(this.game, 0);
    this.runner.cancel();
    this.game = won;
    this.selectedTileId = null;
    this.onChange();
  }
  passRon(): Promise<void> {
    if (!this.canRon) throw new RangeError('Human pass is not allowed now');
    const passed = passRon(this.game, 0);
    this.runner.cancel();
    this.game = passed;
    this.selectedTileId = null;
    this.onChange();
    return this.runner.run(() => this.game, game => { this.game = game; this.onChange(); }, this.onChange);
  }
  newGame(): void {
    this.runner.cancel();
    this.game = this.start();
    this.selectedTileId = null;
    this.onChange();
  }
}
