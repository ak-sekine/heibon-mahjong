import { declareKan, getKanOptions } from '../game/kan.ts';
import { declareCall, passCalls } from '../game/calls.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import type { MatchState, MatchFormat } from '../model/match.ts';
import { startMatch, updateMatchGame, nextRound } from '../game/match.ts';
import type { GameState, PlayerId } from '../model/game.ts';
import { canDeclareTsumo, declareTsumo } from '../game/tsumo.ts';
import { canDeclareRon, declareRon, passRon } from '../game/ron.ts';
import { canDeclareRiichi, declareRiichi } from '../game/riichi.ts';
import { startGame } from '../game/start.ts';
import { canDiscard, discardTile } from '../game/discard.ts';
import { AutomaticTurnRunner, recordLocalGameTransition, type AutomaticTurnOptions } from '../game/automatic-turns.ts';
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai } from '../game/special-draws.ts';

/** UI selection is separate from the immutable game state. */
export class GameController {
  private matchState: MatchState | null = null;
  get hasGame(): boolean { return this.matchState !== null; }
  get match(): MatchState {
    if (!this.matchState) throw new Error('No offline match is active');
    return this.matchState;
  }
  set match(match: MatchState) { this.matchState = match; }
  get game(): GameState { return this.match.game; }
  set game(game: GameState) { this.match = updateMatchGame(this.match, game); }
  selectedTileId: string | null = null;
  private readonly start: (dealerId?: PlayerId) => GameState;
  private readonly runner: AutomaticTurnRunner;
  private readonly onChange: () => void;
  constructor(start: (dealerId?: PlayerId) => GameState = id => startGame(Math.random, id), options: AutomaticTurnOptions & { onChange?: () => void; startImmediately?: boolean } = {}) {
    this.start = start;
    const { startImmediately = true, ...runnerOptions } = options;
    if (startImmediately) this.match = startMatch(start());
    this.runner = new AutomaticTurnRunner(runnerOptions);
    this.onChange = options.onChange ?? (() => {});
  }
  get progressing(): boolean { return this.runner.running; }
  reportIfStalled(source?: string): void { this.runner.reportIfStalled(source); }
  diagnosticSnapshot(): Record<string, unknown> { return this.runner.diagnosticSnapshot(this.game, this.match); }
  select(tileId: string): void {
    const player = this.game.players[0];
    if (isForbiddenDiscard(player,tileId)) return;
    if ((player.riichi && tileId !== player.drawnTile?.id) || this.progressing || !canDiscard(this.game, 0) || ![...player.hand, player.drawnTile].some(tile => tile?.id === tileId)) return;
    this.selectedTileId = this.selectedTileId === tileId ? null : tileId;
  }
  private get discardId(): string | null { return this.game.players[0].riichi ? this.game.players[0].drawnTile?.id ?? null : this.selectedTileId; }
  get canConfirm(): boolean { return !this.progressing && this.discardId !== null && canDiscard(this.game, 0); }
  get canRiichi(): boolean {
    return this.match.status === 'playing' && !this.progressing && this.selectedTileId !== null &&
      canDeclareRiichi(this.game, 0, this.selectedTileId, this.match.points[0]);
  }
  declareRiichi(): Promise<void> {
    if (!this.canRiichi) return Promise.resolve();
    const previous = this.game;
    this.match = declareRiichi(this.match, 0, this.selectedTileId!);
    recordLocalGameTransition(previous, this.game, 'GameController.declareRiichi');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  confirm(): Promise<void> {
    if (!this.canConfirm) return Promise.resolve();
    const previous = this.game;
    this.game = discardTile(this.game, 0, this.discardId!);
    recordLocalGameTransition(previous, this.game, 'GameController.confirm');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  get canTsumo(): boolean { return this.game.players[0].control === 'human' && !this.progressing && canDeclareTsumo(this.game, 0); }
  get canKyuushuKyuuhai(): boolean { return this.match.status === 'playing' && !this.progressing && canDeclareKyuushuKyuuhai(this.game, 0); }
  declareKyuushuKyuuhai(): void {
    if (!this.canKyuushuKyuuhai) throw new RangeError('九種九牌 is not allowed now');
    const previous = this.game;
    this.runner.cancel();
    this.game = declareKyuushuKyuuhai(this.game, 0);
    recordLocalGameTransition(previous, this.game, 'GameController.declareKyuushuKyuuhai');
    this.selectedTileId = null;
    this.onChange();
  }
  declareTsumo(): void {
    if (!this.canTsumo) return;
    const previous = this.game;
    const won = declareTsumo(this.game, 0);
    this.runner.cancel();
    this.game = won;
    recordLocalGameTransition(previous, this.game, 'GameController.declareTsumo');
    this.selectedTileId = null;
    this.onChange();
  }
  get canRon(): boolean { return this.game.players[0].control === 'human' && canDeclareRon(this.game, 0); }
  declareRon(): void {
    if (!this.canRon) throw new RangeError('Human ron is not allowed now');
    const previous = this.game;
    const won = declareRon(this.game, 0);
    this.runner.cancel();
    this.game = won;
    recordLocalGameTransition(previous, this.game, 'GameController.declareRon');
    this.selectedTileId = null;
    this.onChange();
  }
  passRon(): Promise<void> {
    if (!this.canRon) throw new RangeError('Human pass is not allowed now');
    const previous = this.game;
    const passed = passRon(this.game, 0);
    this.runner.cancel();
    this.game = passed;
    recordLocalGameTransition(previous, this.game, 'GameController.passRon');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  call(optionId: string): Promise<void> {
    const previous = this.game;
    this.runner.cancel();
    this.game = declareCall(this.game, 0, optionId);
    recordLocalGameTransition(previous, this.game, 'GameController.call');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  passCalls(): Promise<void> {
    const previous = this.game;
    this.runner.cancel();
    this.game = passCalls(this.game, 0);
    recordLocalGameTransition(previous, this.game, 'GameController.passCalls');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  kan(optionId:string): Promise<void> {
    if(this.progressing || !getKanOptions(this.game,0).some(o=>o.id===optionId)) throw new RangeError('Invalid human kan');
    const previous=this.game;
    this.runner.cancel();
    this.game=declareKan(this.game,0,optionId);
    recordLocalGameTransition(previous,this.game,'GameController.kan');
    this.selectedTileId=null;this.onChange();
    return this.runner.runMatch(()=>this.match,match=>{this.match=match;this.onChange();},this.onChange);
  }
  get canNextRound(): boolean { return this.match.status === 'round-ended'; }
  nextRound(): Promise<void> {
    if (!this.canNextRound) return Promise.resolve();
    const previous = this.game;
    this.runner.cancel();
    this.match = nextRound(this.match, id => this.start(id));
    recordLocalGameTransition(previous, this.game, 'GameController.nextRound');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  newGame(format: MatchFormat = 'tonpu'): void {
    const previous = this.matchState?.game ?? null;
    this.runner.cancel();
    this.match = startMatch(this.start(), format);
    if (previous) recordLocalGameTransition(previous, this.game, 'GameController.newGame');
    this.selectedTileId = null;
    this.onChange();
  }

  clearGame(): void {
    if (!this.matchState) return;
    this.runner.cancel();
    this.matchState = null;
    this.selectedTileId = null;
    this.onChange();
  }
}
