import { declareKan, getKanOptions } from '../game/kan.ts';
import { declareCall, passCalls } from '../game/calls.ts';
import { isForbiddenDiscard } from '../game/melds.ts';
import type { MatchState, MatchFormat } from '../model/match.ts';
import type { GameRules } from '../model/rules.ts';
import { startMatch, updateMatchGame, nextRound } from '../game/match.ts';
import type { GameState, PlayerId } from '../model/game.ts';
import { canDeclareTsumo, declareTsumo } from '../game/tsumo.ts';
import { canDeclareRon, declareRon, passRon } from '../game/ron.ts';
import { canDeclareRiichi, declareRiichi } from '../game/riichi.ts';
import { startGame } from '../game/start.ts';
import { canDiscard, discardTile } from '../game/discard.ts';
import { AutomaticTurnRunner, recordLocalGameTransition, type AutomaticTurnOptions } from '../game/automatic-turns.ts';
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai } from '../game/special-draws.ts';
import { drawSeatAssignment, type MatchParticipant } from '../game/seating.ts';
import type { RandomSource } from '../game/shuffle.ts';

/** UI selection is separate from the immutable game state. */
export class GameController {
  private matchState: MatchState | null = null;
  get hasGame(): boolean { return this.matchState !== null; }
  get match(): MatchState {
    if (!this.matchState) throw new Error('No offline match is active');
    return this.matchState;
  }
  set match(match: MatchState) {
    this.matchState = match;
    const humanSeat = match.game.players.find(player => player.control === 'human')?.id;
    if (humanSeat !== undefined && humanSeat !== this.playerSeat) {
      this.playerSeat = humanSeat;
      this.playerNames = match.game.players.map((player, seat) => player.id === humanSeat ? '自分' : `CPU${seat < humanSeat ? seat + 1 : seat}`);
    }
  }
  get game(): GameState { return this.match.game; }
  set game(game: GameState) { this.match = updateMatchGame(this.match, game); }
  selectedTileId: string | null = null;
  playerSeat: PlayerId = 0;
  playerNames: readonly string[] = ['自分', 'CPU1', 'CPU2', 'CPU3'];
  private readonly start: (dealerId?: PlayerId) => GameState;
  private readonly random: RandomSource;
  private participants: readonly [MatchParticipant, MatchParticipant, MatchParticipant, MatchParticipant] = [
    { id: 'human', control: 'human', name: '自分' },
    { id: 'cpu1', control: 'cpu', name: 'CPU1' },
    { id: 'cpu2', control: 'cpu', name: 'CPU2' },
    { id: 'cpu3', control: 'cpu', name: 'CPU3' },
  ];
  private readonly randomizeSeating: boolean;
  private readonly runner: AutomaticTurnRunner;
  private readonly onChange: () => void;
  constructor(start: ((dealerId?: PlayerId) => GameState) | undefined = undefined, options: AutomaticTurnOptions & { onChange?: () => void; startImmediately?: boolean; random?: RandomSource; randomizeSeating?: boolean } = {}) {
    this.start = start ?? (id => startGame(Math.random, id));
    this.randomizeSeating = options.randomizeSeating ?? (start === undefined);
    this.random = options.random ?? Math.random;
    const { startImmediately = true, ...runnerOptions } = options;
    this.runner = new AutomaticTurnRunner(runnerOptions);
    this.onChange = options.onChange ?? (() => {});
    if (startImmediately) {
      this.beginMatch('tonpu');
      this.startInitialCpuTurns();
    }
  }
  private createRosterGame(dealerId: PlayerId): GameState {
    const game = this.start(dealerId);
    if (!this.randomizeSeating) return game;
    return { ...game, players: game.players.map((player, seat) => ({
      ...player, control: this.participants[seat].control,
    })) as unknown as GameState['players'] };
  }
  private beginMatch(rules: MatchFormat | GameRules): void {
    if (this.randomizeSeating) this.participants = drawSeatAssignment([
      { id: 'human', control: 'human', name: '自分' },
      { id: 'cpu1', control: 'cpu', name: 'CPU1' },
      { id: 'cpu2', control: 'cpu', name: 'CPU2' },
      { id: 'cpu3', control: 'cpu', name: 'CPU3' },
    ], this.random);
    this.playerSeat = this.participants.findIndex(participant => participant.control === 'human') as PlayerId;
    this.playerNames = this.participants.map(participant => participant.name);
    this.match = startMatch(this.createRosterGame(0), rules);
  }
  get progressing(): boolean { return this.runner.running; }
  reportIfStalled(source?: string): void { this.runner.reportIfStalled(source); }
  diagnosticSnapshot(): Record<string, unknown> { return this.runner.diagnosticSnapshot(this.game, this.match); }
  select(tileId: string): void {
    const player = this.game.players[this.playerSeat];
    if (isForbiddenDiscard(player,tileId)) return;
    if ((player.riichi && tileId !== player.drawnTile?.id) || this.progressing || !canDiscard(this.game, this.playerSeat) || ![...player.hand, player.drawnTile].some(tile => tile?.id === tileId)) return;
    this.selectedTileId = this.selectedTileId === tileId ? null : tileId;
  }
  private get discardId(): string | null { return this.game.players[this.playerSeat].riichi ? this.game.players[this.playerSeat].drawnTile?.id ?? null : this.selectedTileId; }
  get canConfirm(): boolean { return !this.progressing && this.discardId !== null && canDiscard(this.game, this.playerSeat); }
  get canRiichi(): boolean {
    return this.match.status === 'playing' && !this.progressing && this.selectedTileId !== null &&
      canDeclareRiichi(this.game, this.playerSeat, this.selectedTileId, this.match.points[this.playerSeat]);
  }
  declareRiichi(): Promise<void> {
    if (!this.canRiichi) return Promise.resolve();
    const previous = this.game;
    this.match = declareRiichi(this.match, this.playerSeat, this.selectedTileId!);
    recordLocalGameTransition(previous, this.game, 'GameController.declareRiichi');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  confirm(): Promise<void> {
    if (!this.canConfirm) return Promise.resolve();
    const previous = this.game;
    this.game = discardTile(this.game, this.playerSeat, this.discardId!);
    recordLocalGameTransition(previous, this.game, 'GameController.confirm');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  get canTsumo(): boolean { return this.game.players[this.playerSeat].control === 'human' && !this.progressing && canDeclareTsumo(this.game, this.playerSeat); }
  get canKyuushuKyuuhai(): boolean { return this.match.status === 'playing' && !this.progressing && canDeclareKyuushuKyuuhai(this.game, this.playerSeat); }
  declareKyuushuKyuuhai(): void {
    if (!this.canKyuushuKyuuhai) throw new RangeError('九種九牌 is not allowed now');
    const previous = this.game;
    this.runner.cancel();
    this.game = declareKyuushuKyuuhai(this.game, this.playerSeat);
    recordLocalGameTransition(previous, this.game, 'GameController.declareKyuushuKyuuhai');
    this.selectedTileId = null;
    this.onChange();
  }
  declareTsumo(): void {
    if (!this.canTsumo) return;
    const previous = this.game;
    const won = declareTsumo(this.game, this.playerSeat);
    this.runner.cancel();
    this.game = won;
    recordLocalGameTransition(previous, this.game, 'GameController.declareTsumo');
    this.selectedTileId = null;
    this.onChange();
  }
  get canRon(): boolean { return this.game.players[this.playerSeat].control === 'human' && canDeclareRon(this.game, this.playerSeat); }
  declareRon(): void {
    if (!this.canRon) throw new RangeError('Human ron is not allowed now');
    const previous = this.game;
    const won = declareRon(this.game, this.playerSeat);
    this.runner.cancel();
    this.game = won;
    recordLocalGameTransition(previous, this.game, 'GameController.declareRon');
    this.selectedTileId = null;
    this.onChange();
  }
  passRon(): Promise<void> {
    if (!this.canRon) throw new RangeError('Human pass is not allowed now');
    const previous = this.game;
    const passed = passRon(this.game, this.playerSeat);
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
    this.game = declareCall(this.game, this.playerSeat, optionId);
    recordLocalGameTransition(previous, this.game, 'GameController.call');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  passCalls(): Promise<void> {
    const previous = this.game;
    this.runner.cancel();
    this.game = passCalls(this.game, this.playerSeat);
    recordLocalGameTransition(previous, this.game, 'GameController.passCalls');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  kan(optionId:string): Promise<void> {
    if(this.progressing || !getKanOptions(this.game,this.playerSeat).some(o=>o.id===optionId)) throw new RangeError('Invalid human kan');
    const previous=this.game;
    this.runner.cancel();
    this.game=declareKan(this.game,this.playerSeat,optionId);
    recordLocalGameTransition(previous,this.game,'GameController.kan');
    this.selectedTileId=null;this.onChange();
    return this.runner.runMatch(()=>this.match,match=>{this.match=match;this.onChange();},this.onChange);
  }
  get canNextRound(): boolean { return this.match.status === 'round-ended'; }
  private startInitialCpuTurns(): void {
    if (!this.randomizeSeating || this.playerSeat === this.game.dealerId) return;
    void this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange)
      .catch(error => console.error('Initial CPU turn failed', error));
  }
  nextRound(): Promise<void> {
    if (!this.canNextRound) return Promise.resolve();
    const previous = this.game;
    this.runner.cancel();
    this.match = nextRound(this.match, id => this.createRosterGame(id));
    recordLocalGameTransition(previous, this.game, 'GameController.nextRound');
    this.selectedTileId = null;
    this.onChange();
    return this.runner.runMatch(() => this.match, match => { this.match = match; this.onChange(); }, this.onChange);
  }
  newGame(rules: MatchFormat | GameRules = 'tonpu'): void {
    const previous = this.matchState?.game ?? null;
    this.runner.cancel();
    this.beginMatch(rules);
    if (previous) recordLocalGameTransition(previous, this.game, 'GameController.newGame');
    this.selectedTileId = null;
    this.onChange();
    this.startInitialCpuTurns();
  }

  clearGame(): void {
    if (!this.matchState) return;
    this.runner.cancel();
    this.matchState = null;
    this.selectedTileId = null;
    this.onChange();
  }
}
