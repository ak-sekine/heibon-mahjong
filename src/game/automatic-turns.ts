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

export type Wait = (milliseconds: number, signal: AbortSignal) => Promise<void>;
export interface AutomaticTurnOptions {
  readonly random?: RandomSource;
  readonly chooseDiscard?: DiscardStrategy;
  readonly wait?: Wait;
}

/** Aborting clears the timer and resolves the wait; the runner checks its generation. */
export const waitForTurn: Wait = (milliseconds, signal) => new Promise(resolve => {
  if (signal.aborted) { resolve(); return; }
  const startedAt = Date.now();
  let finished = false;
  diagnosticLog.record('INFO', 'local_cpu_wait_timer_started', { timerType: 'cpu-turn', plannedMs: milliseconds, source: 'AutomaticTurnRunner' });
  const finish = (event: 'local_cpu_wait_timer_fired' | 'local_cpu_wait_timer_interrupted') => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    diagnosticLog.record('INFO', event, { timerType: 'cpu-turn', plannedMs: milliseconds, elapsedMs: Date.now() - startedAt, source: 'AutomaticTurnRunner' });
    resolve();
  };
  const timer = setTimeout(() => finish('local_cpu_wait_timer_fired'), milliseconds);
  const onAbort = () => finish('local_cpu_wait_timer_interrupted');
  signal.addEventListener('abort', onAbort, { once: true });
});

type ActiveCpuTurn = { turnId: string; seat: number; startedAt: number; startPhase: string; phase: string; waiting: boolean; warned: boolean; warningTimer: ReturnType<typeof setTimeout> | null };
const STALL_WARNING_MS = 30_000;

export function recordLocalGameTransition(previous: GameState, next: GameState, source: string): void {
  if (previous.phase !== next.phase || previous.turnPlayerId !== next.turnPlayerId) {
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
        if (game.phase === 'awaiting-draw') {
          game = drawOrStop(game);
          observeWrite(game);
          if (!current() || game.phase === 'wall-exhausted') return;
        }
        const player = game.players[game.turnPlayerId];
        if (player.control === 'human') return;
        const turn = this.beginCpuTurn(player.id, game.phase);
        const scheduledGame = game;
        try {
          turn.waiting = true;
          await (this.options.wait ?? waitForTurn)(300, abort.signal);
          turn.waiting = false;
          if (!current()) { this.completeCpuTurn(turn, 'cancelled', read().phase); return; }
          // Read again after waiting, never commit an old snapshot.
          game = read();
          turn.phase = game.phase;
          if (!current() || game !== scheduledGame || (matchAccess && matchAccess.read().status !== 'playing') || game.turnPlayerId !== player.id || game.phase !== 'awaiting-discard') {
            this.completeCpuTurn(turn, 'state-changed', game.phase); return;
          }
          if (canDeclareTsumo(game, player.id)) {
            observeWrite(declareTsumo(game, player.id));
            this.completeCpuTurn(turn, 'tsumo', read().phase); return;
          }
          if (canDeclareKyuushuKyuuhai(game, player.id)) {
            observeWrite(declareKyuushuKyuuhai(game, player.id));
            this.completeCpuTurn(turn, 'kyuushu-kyuuhai', read().phase); return;
          }
          const kan=chooseCpuKan(game,player.id);
          if(kan) { observeWrite(declareKan(game,player.id,kan.id)); this.completeCpuTurn(turn, 'kan', read().phase); continue; }
          const currentPlayer = game.players[player.id];
          if (!currentPlayer.riichi && matchAccess) {
            const match = matchAccess.read();
            const riichiId = chooseCpuRiichiDiscard(game, player.id, match.points[player.id]);
            if (riichiId !== null) {
              const nextMatch = declareRiichi(match, player.id, riichiId);
              matchAccess.write(nextMatch);
              recordLocalGameTransition(match.game, nextMatch.game, 'AutomaticTurnRunner');
              this.completeCpuTurn(turn, 'riichi-discard', nextMatch.game.phase); continue;
            }
          }
          const id = currentPlayer.riichi ? currentPlayer.drawnTile!.id : this.options.chooseDiscard ? this.options.chooseDiscard(currentPlayer, this.options.random ?? Math.random) : await chooseShantenDiscardAsync(game, player.id, abort.signal);
          if (id === null || !current() || read() !== game || (matchAccess && matchAccess.read().status !== 'playing')) {
            this.completeCpuTurn(turn, 'state-changed', read().phase); return;
          }
          observeWrite(discardTile(game, player.id, id));
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

  private beginCpuTurn(seat: number, phase: string): ActiveCpuTurn {
    const now = Date.now();
    const turn: ActiveCpuTurn = {
      turnId: `local-${++this.turnSequence}`, seat, startedAt: now, startPhase: phase, phase, waiting: false,
      warned: false, warningTimer: null,
    };
    this.activeCpuTurn = turn;
    diagnosticLog.record('INFO', 'local_cpu_turn_started', { turnId: turn.turnId, seat, phase, startPhase: phase, source: 'AutomaticTurnRunner' });
    turn.warningTimer = setTimeout(() => this.reportCpuStall('watchdog'), STALL_WARNING_MS);
    return turn;
  }

  private completeCpuTurn(turn: ActiveCpuTurn, reason: string, phase: string): void {
    diagnosticLog.record('INFO', 'local_cpu_turn_completed', {
      turnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, endPhase: phase,
      phase, durationMs: Date.now() - turn.startedAt, reason, source: 'AutomaticTurnRunner',
    });
  }

  private failCpuTurn(turn: ActiveCpuTurn, error: unknown, phase: string): void {
    const info = safeErrorInfo(error);
    diagnosticLog.record('ERROR', 'local_cpu_turn_failed', {
      turnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, endPhase: phase,
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
    if (!turn || turn.warned || Date.now() - turn.startedAt < STALL_WARNING_MS) return;
    turn.warned = true;
    diagnosticLog.record('WARN', 'local_cpu_turn_stalled', {
      turnId: turn.turnId, seat: turn.seat, startPhase: turn.startPhase, phase: turn.phase,
      durationMs: Date.now() - turn.startedAt, warningAfterMs: STALL_WARNING_MS,
      runnerState: this.running ? 'running' : 'idle', waitingState: turn.waiting ? 'waiting' : 'processing', source,
    });
  }
}
