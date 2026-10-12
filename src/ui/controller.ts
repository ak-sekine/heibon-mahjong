import type { GameState } from '../model/game.ts';
import { startGame } from '../game/start.ts';
import { canDiscard, discardTile } from '../game/discard.ts';

/** UI selection is separate from the immutable game state. */
export class GameController {
  game: GameState;
  selectedTileId: string | null = null;
  private readonly start: () => GameState;
  constructor(start: () => GameState = startGame) { this.start = start; this.game = start(); }
  select(tileId: string): void {
    const player = this.game.players[0];
    if (!canDiscard(this.game, 0) || ![...player.hand, player.drawnTile].some(tile => tile?.id === tileId)) return;
    this.selectedTileId = this.selectedTileId === tileId ? null : tileId;
  }
  get canConfirm(): boolean { return this.selectedTileId !== null && canDiscard(this.game, 0); }
  confirm(): void {
    if (!this.canConfirm) return;
    this.game = discardTile(this.game, 0, this.selectedTileId!);
    this.selectedTileId = null;
  }
  newGame(): void { this.game = this.start(); this.selectedTileId = null; }
}
