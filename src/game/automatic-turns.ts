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
import { canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai } from './special-draws.ts';
import { diagnosticLog, markDiagnosticError, safeErrorInfo } from '../online/diagnostics.ts';

export type Wait = (milliseconds: number, signal: AbortSignal, context?: { cpuTurnId: string }) => Promise<void>;
export interface AutomaticTurnOptions {
  readonly random?: RandomSource;
  readonly chooseDiscard?: DiscardStrategy;
  readonly wait?: Wait;
}

/** Aborting clears the timer and resolves the wait; the runner checks its generation. */
export const waitForTurn: Wait = (milliseconds, signal, context) => new Promise(resolve => {
  if (signal.aborted) { resolve(); return; }
  const startedAt = Date.now();
  let finished = false;
  diagnosticLog.record('INFO', 'local_cpu_wait_timer_started', { timerType: 'cpu-turn', plannedMs: milliseconds, cpuTurnId: context?.cpuTurnId, source: 'AutomaticTurnRunner' });
  const finish = (event: 'local_cpu_wait_timer_fired' | 'local_cpu_wait_timer_interrupted') => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    diagnosticLog.record('INFO', event, { timerType: 'cpu-turn', plannedMs: milliseconds, elapsedMs: Date.now() - startedAt, cpuTurnId: context?.cpuTurnId, source: 'AutomaticTurnRunner' });
    resolve();
  };
  const timer = setTimeout(() => finish('local_cpu_wait_timer_fired'), milliseconds);
  const onAbort = () => finish('local_cpu_wait_timer_interrupted');
  signal.addEventListener('abort', onAbort, { once: true });
});

type ActiveCpuTurn = { turnId: string; seat: number; startedAt: number; startPhase: string; phase: string; remainingTiles: number; round: string | null; honba: number | null; waiting: boolean; warned: boolean; stage: string | null; lastCompletedStage: string | null; lastProgressAt: number; waitingAsync: boolean; warningTimer: ReturnType<typeof setTimeout> | null };
const STALL_WARNING_MS = 30_000;

export function recordLocalGameTransition(previous: GameState, next: GameState, source: string): void {
  if (previous.phase !== next.phase || previous.turnPlayerId !== next.turnPlayerId) {
    lastLocalTransition = `${previous.turnPlayerId}:${previous.phase}->${next.turnPlayerId}:${next.phase}:${source}`;
    diagnosticLog.record('INFO', 'local_game_state_transition', {
      seat: next.turnPlayerId, previousPhase: previous.phase, nextPhase: next.phase, phase: next.phase, source,
    });
  }
  const previousDecision = previous.phase === 'awaiting-ron' || previous.phase === 'awaiting-call';
  const nextDecision = next.phase === 'awaiting-ron' || next.phase === 'awaiting-call';
  if (!previousDecision && nextDecision) {
    diagnosticLog.record('INFO', 'local_decision_wait_started', { seat: next.turnPlayerId, phase: next.phase, decisionPending: true, source });
  } else if (previousDecision && !nextDecision) {
    diagnosticLog.record('INFO', 'local_decision_wait_released', { seat: next.turnPlayerId, previousPhase: previous.phase, nextPhase: next.phase, decisionPending: false, source });
  } else if (previousDecision && nextDecision && previous.phase !== next.phase) {
    diagnosticLog.record('INFO', 'local_decision_wait_transition', { seat: next.turnPlayerId, previousPhase: previous.phase, nextPhase: next.phase, decisionPending: true, source });
  }
  const previousTurnWasCpu = previous.players[previous.turnPlayerId].control === 'cpu';
  const nextTurnIsHuman = next.players[next.turnPlayerId].control === 'human';
  if (previousTurnWasCpu && (nextTurnIsHuman || nextDecision)) {
    diagnosticLog.record('INFO', 'local_cpu_to_human_wait', {
      seat: next.turnPlayerId, phase: next.phase, decisionPending: nextDecision, source,
    });
  }
  if (next.phase === 'won' || next.phase === 'wall-exhausted') {
    diagnosticLog.record('INFO', 'local_round_ended', { seat: next.turnPlayerId, phase: next.phase, source });
  }
}
let lastLocalTransition: string | null = null;
export function getLastLocalGameTransition(): string | null { return lastLocalTransition; }

/** Scheduling only: all tile changes go through pure game functions. */
export class AutomaticTurnRunner {
  private generation = 0;
  private active: AbortController | null = null;
  private activeCpuTurn: ActiveCpuTurn | null = null;
  private turnSequence = 0;
  private readonly options: AutomaticTurnOptions;
  constructor(options: AutomaticTurnOptions = {}) { this.options = options; }
  get running(): boolean { return this.active !== null; }
  reportIfStalled(source = 'manual'): void { this.reportCpuStall(source); }
  diagnosticSnapshot(game?: GameState, match?: MatchState): Record<string, unknown> {
    const turn = this.activeCpuTurn;
    const now = Date.now();
    const state = game;
    return {
      runnerState: this.running ? 'running' : 'idle', cpuTurnId: turn?.turnId ?? null,
      currentStage: turn?.stage ?? null, lastCompletedStage: turn?.lastCompletedStage ?? null,
      waitingAsync: turn?.waitingAsync ?? false, lastProgressAt: turn?.lastProgressAt ?? null,
      lastProgressElapsedMs: turn ? now - turn.lastProgressAt : null,
      currentTurn: state?.turnPlayerId ?? turn?.seat ?? null, phase: state?.phase ?? turn?.phase ?? 'unknown',
      remainingTiles: state?.liveWall.length ?? null, round: match ? `${match.roundWind}${match.roundNumber}` : null,
      honba: match?.honba ?? null, lastTransition: lastLocalTransition,
    };
  }
  cancel(): void {
    if (this.active) diagnosticLog.record('INFO', 'local_runner_cancelled', { runnerState: 'cancelled', source: 'AutomaticTurnRunner' });
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
    let runnerFailure: unknown = null;
    diagnosticLog.record('INFO', 'local_runner_started', { runnerState: 'running', source: 'AutomaticTurnRunner' });
    const observeWrite = (next: GameState) => {
      const previous = read();
      write(next);
      recordLocalGameTransition(previous, next, 'AutomaticTurnRunner');
    };
    try {
      while (current()) {
        if (matchAccess && matchAccess.read().status !== 'playing') return;
        let game = read();
        if (game.phase === 'wall-exhausted' || game.phase === 'won' || (game.phase === 'awaiting-ron' || game.phase === 'awaiting-call') || game.pendingRiichi) return;
        let turn: ActiveCpuTurn | null = null;
        if (game.phase === 'awaiting-draw') {
          if (game.players[game.turnPlayerId].control === 'cpu') turn = this.beginCpuTurn(game.turnPlayerId, game, matchAccess?.read());
          try {
            const drawn = turn
              ? this.stageSync(turn, 'draw_processing', game, matchAccess?.read(), () => drawOrStop(game))
              : drawOrStop(game);
            if (turn) this.stageSync(turn, 'state_transition', game, matchAccess?.read(), () => observeWrite(drawn));
            else observeWrite(drawn);
            game = drawn;
          } catch (error) {
            if (turn) { this.failCpuTurn(turn, error, read().phase); this.clearCpuTurn(turn); }
            throw error;
          }
          if (!current() || game.phase === 'wall-exhausted') {
            if (turn) { this.completeCpuTurn(turn, game.phase === 'wall-exhausted' ? 'wall-exhausted' : 'cancelled', game.phase); this.clearCpuTurn(turn); }
            return;
          }
        }
        const player = game.players[game.turnPlayerId];
        if (player.control === 'human') return;
        turn = turn ?? this.beginCpuTurn(player.id, game, matchAccess?.read());
        const scheduledGame = game;
        try {
          turn.waiting = true;
          await this.stageAsync(turn, 'wait_timer', game, matchAccess?.read(), () => (this.options.wait ?? waitForTurn)(300, abort.signal, { cpuTurnId: turn.turnId }));
          turn.waiting = false;
          if (!current()) { this.completeCpuTurn(turn, 'cancelled', read().phase); return; }
          // Read again after waiting, never commit an old snapshot.
          game = read();
          turn.phase = game.phase;
          if (!current() || game !== scheduledGame || (matchAccess && matchAccess.read().status !== 'playing') || game.turnPlayerId !== player.id || game.phase !== 'awaiting-discard') {
            this.completeCpuTurn(turn, 'state-changed', game.phase); return;
          }
          if (this.stageSync(turn, 'tsumo_judgment', game, matchAccess?.read(), () => canDeclareTsumo(game, player.id))) {
            const won = this.stageSync(turn, 'tsumo_resolution', game, matchAccess?.read(), () => declareTsumo(game, player.id));
            this.stageSync(turn, 'state_transition', game, matchAccess?.read(), () => observeWrite(won));
            this.completeCpuTurn(turn, 'tsumo', read().phase); return;
          }
          if (this.stageSync(turn, 'kyuushu_judgment', game, matchAccess?.read(), () => canDeclareKyuushuKyuuhai(game, player.id))) {
            const ended = this.stageSync(turn, 'kyuushu_resolution', game, matchAccess?.read(), () => declareKyuushuKyuuhai(game, player.id));
            this.stageSync(turn, 'state_transition', game, matchAccess?.read(), () => observeWrite(ended));
            this.completeCpuTurn(turn, 'kyuushu-kyuuhai', read().phase); return;
          }
          const kan=this.stageSync(turn,'kan_judgment',game,matchAccess?.read(),()=>chooseCpuKan(game,player.id));
          if(kan) {
            const declared = this.stageSync(turn,'kan_resolution',game,matchAccess?.read(),()=>declareKan(game,player.id,kan.id));
            this.stageSync(turn,'state_transition',game,matchAccess?.read(),()=>observeWrite(declared));
            this.completeCpuTurn(turn, 'kan', read().phase); continue;
          }
          const currentPlayer = game.players[player.id];
          if (!currentPlayer.riichi && matchAccess) {
            const match = matchAccess.read();
            const riichiId = this.stageSync(turn,'riichi_judgment',game,match,()=>chooseCpuRiichiDiscard(game, player.id, match.points[player.id]));
            if (riichiId !== null) {
              const nextMatch = this.stageSync(turn,'riichi_resolution',game,match,()=>declareRiichi(match, player.id, riichiId));
              this.stageSync(turn,'state_transition',game,match,()=>{ matchAccess.write(nextMatch); recordLocalGameTransition(match.game, nextMatch.game, 'AutomaticTurnRunner'); });
              this.completeCpuTurn(turn, 'riichi-discard', nextMatch.game.phase); continue;
            }
          } else this.stageSkipped(turn, 'riichi_judgment', currentPlayer.riichi ? 'already_riichi' : 'match_context_unavailable', game, matchAccess?.read());
          const id = currentPlayer.riichi
            ? this.stageSync(turn,'discard_selection',game,matchAccess?.read(),()=>currentPlayer.drawnTile!.id)
            : this.options.chooseDiscard
              ? this.stageSync(turn,'discard_selection',game,matchAccess?.read(),()=>this.options.chooseDiscard!(currentPlayer, this.options.random ?? Math.random))
              : await this.stageAsync(turn,'discard_selection',game,matchAccess?.read(),()=>chooseShantenDiscardAsync(game, player.id, abort.signal));
          if (id === null || !current() || read() !== game || (matchAccess && matchAccess.read().status !== 'playing')) {
            this.completeCpuTurn(turn, 'state-changed', read().phase); return;
          }
          const discarded = this.stageSync(turn,'discard_commit',game,matchAccess?.read(),()=>discardTile(game, player.id, id));
          this.stageSync(turn,'state_transition',game,matchAccess?.read(),()=>observeWrite(discarded));
          this.completeCpuTurn(turn, 'discarded', read().phase);
        } catch (error) {
          turn.waiting = false;
          this.failCpuTurn(turn, error, read().phase);
          throw error;
        } finally {
          this.clearCpuTurn(turn);
        }
      }
    } catch (error) {
      runnerFailure = error;
      throw error;
    } finally {
      if (token === this.generation) {
        this.active = null;
        let callbackFailure: unknown = null;
        try { onComplete(); }
        catch (error) {
          callbackFailure = error;
          const info = safeErrorInfo(error);
          diagnosticLog.record('ERROR', 'local_runner_completion_callback_failed', { ...info, errorId: markDiagnosticError(error), runnerState: 'failed', phase: read().phase, source: 'AutomaticTurnRunner.onComplete' });
        }
        const failure = runnerFailure ?? callbackFailure;
        const finalGame = read();
        diagnosticLog.record(failure ? 'ERROR' : 'INFO', failure ? 'local_runner_failed' : 'local_runner_completed', {
          ...(failure ? { ...safeErrorInfo(failure), errorId: markDiagnosticError(failure) } : {}),
          runnerState: failure ? 'failed' : 'completed', phase: finalGame.phase,
          decisionPending: finalGame.phase === 'awaiting-ron' || finalGame.phase === 'awaiting-call', source: 'AutomaticTurnRunner',
        });
        if (callbackFailure && !runnerFailure) throw callbackFailure;
      }
    }
  }

  private beginCpuTurn(seat: number, game: GameState, match?: MatchState): ActiveCpuTurn {
    const now = Date.now();
    const phase = game.phase;
    const turn: ActiveCpuTurn = {
      turnId: `local-${++this.turnSequence}`, seat, startedAt: now, startPhase: phase, phase, waiting: false,
      remainingTiles: game.liveWall.length, round: match ? `${match.roundWind}${match.roundNumber}` : null, honba: match?.honba ?? null,
      warned: false, warningTimer: null, stage: null, lastCompletedStage: null, lastProgressAt: now, waitingAsync: false,
    };
    this.activeCpuTurn = turn;
    diagnosticLog.record('INFO', 'local_cpu_turn_started', { ...this.stageContext(turn, game, match), turnId: turn.turnId, cpuTurnId: turn.turnId, seat, phase, startPhase: phase, runnerState: 'running', source: 'AutomaticTurnRunner' });
    turn.warningTimer = setTimeout(() => this.reportCpuStall('watchdog'), STALL_WARNING_MS);
    return turn;
  }

  private stageContext(turn: ActiveCpuTurn, game: GameState, match?: MatchState): Record<string, unknown> {
    return { cpuTurnId: turn.turnId, turnId: turn.turnId, seat: turn.seat, round: match ? `${match.roundWind}${match.roundNumber}` : null,
      honba: match?.honba ?? null, phase: game.phase, remainingTiles: game.liveWall.length, runnerState: this.running ? 'running' : 'idle',
      durationMs: Date.now() - turn.startedAt };
  }
  private stageSync<T>(turn: ActiveCpuTurn, stage: string, game: GameState, match: MatchState | undefined, operation: () => T): T {
    const startedAt = Date.now(); turn.stage = stage; turn.phase = game.phase; turn.remainingTiles = game.liveWall.length; turn.waitingAsync = false;
    const context = this.stageContext(turn, game, match);
    diagnosticLog.record('INFO', 'local_cpu_stage_started', { ...context, stage });
    try {
      const result = operation();
      this.finishStage(turn, stage, game, match, Date.now() - startedAt);
      return result;
    } catch (error) {
      turn.lastProgressAt = Date.now();
      const info = safeErrorInfo(error);
      diagnosticLog.record('ERROR', 'local_cpu_stage_failed', { ...this.stageContext(turn, game, match), stage, elapsedMs: Date.now() - startedAt, ...info, errorId: markDiagnosticError(error) });
      throw error;
    }
  }
  private async stageAsync<T>(turn: ActiveCpuTurn, stage: string, game: GameState, match: MatchState | undefined, operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now(); turn.stage = stage; turn.phase = game.phase; turn.remainingTiles = game.liveWall.length; turn.waitingAsync = true;
    diagnosticLog.record('INFO', 'local_cpu_stage_started', { ...this.stageContext(turn, game, match), stage, waitingAsync: true });
    try { const result = await operation(); this.finishStage(turn, stage, game, match, Date.now() - startedAt); return result; }
    catch (error) { turn.waitingAsync = false; turn.lastProgressAt = Date.now(); const info = safeErrorInfo(error); diagnosticLog.record('ERROR', 'local_cpu_stage_failed', { ...this.stageContext(turn, game, match), stage, elapsedMs: Date.now() - startedAt, ...info, errorId: markDiagnosticError(error) }); throw error; }
  }
  private finishStage(turn: ActiveCpuTurn, stage: string, game: GameState, match?: MatchState, elapsedMs?: number): void {
    if (Date.now() - turn.lastProgressAt >= STALL_WARNING_MS) this.reportCpuStall('stage-completed-after-long-block');
    turn.lastCompletedStage = stage; turn.stage = null; turn.waitingAsync = false; turn.lastProgressAt = Date.now();
    if (!turn.warned) {
      if (turn.warningTimer !== null) clearTimeout(turn.warningTimer);
      turn.warningTimer = setTimeout(() => this.reportCpuStall('watchdog'), STALL_WARNING_MS);
    }
    diagnosticLog.record('INFO', 'local_cpu_stage_completed', { ...this.stageContext(turn, game, match), stage, elapsedMs: elapsedMs ?? 0 });
  }
  private stageSkipped(turn: ActiveCpuTurn, stage: string, reason: string, game: GameState, match?: MatchState): void {
    diagnosticLog.record('INFO', 'local_cpu_stage_skipped', { ...this.stageContext(turn, game, match), stage, reason });
  }

  private completeCpuTurn(turn: ActiveCpuTurn, reason: string, phase: string): void {
    diagnosticLog.record('INFO', 'local_cpu_turn_completed', {
      turnId: turn.turnId, cpuTurnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, endPhase: phase,
      phase, durationMs: Date.now() - turn.startedAt, reason, source: 'AutomaticTurnRunner',
    });
  }

  private failCpuTurn(turn: ActiveCpuTurn, error: unknown, phase: string): void {
    const info = safeErrorInfo(error);
    diagnosticLog.record('ERROR', 'local_cpu_turn_failed', {
      turnId: turn.turnId, cpuTurnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, endPhase: phase,
      phase, durationMs: Date.now() - turn.startedAt, reason: 'exception', ...info, source: 'AutomaticTurnRunner',
      errorId: markDiagnosticError(error),
    });
  }

  private clearCpuTurn(turn: ActiveCpuTurn): void {
    if (turn.warningTimer !== null) clearTimeout(turn.warningTimer);
    if (this.activeCpuTurn === turn) this.activeCpuTurn = null;
  }

  private reportCpuStall(source: string): void {
    const turn = this.activeCpuTurn;
    if (!turn || turn.warned || Date.now() - turn.lastProgressAt < STALL_WARNING_MS) return;
    turn.warned = true;
    diagnosticLog.record('WARN', 'local_runner_stalled', {
      turnId: turn.turnId, cpuTurnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, phase: turn.phase,
      durationMs: Date.now() - turn.startedAt, lastProgressElapsedMs: Date.now() - turn.lastProgressAt,
      lastCompletedStage: turn.lastCompletedStage, currentStage: turn.stage, waitingAsync: turn.waitingAsync,
      currentTurn: turn.seat, remainingTiles: turn.remainingTiles, round: turn.round, honba: turn.honba,
      displayState: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      warningAfterMs: STALL_WARNING_MS, runnerState: this.running ? 'running' : 'idle', waitingState: turn.waiting || turn.waitingAsync ? 'waiting' : 'processing', source,
    });
  }
}
