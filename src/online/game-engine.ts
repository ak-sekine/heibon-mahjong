import { chooseCpuRiichiDiscard, chooseShantenDiscardAsync } from '../game/cpu.ts';
import { getCallOptions, resolveCallResponses, type CallOption } from '../game/calls.ts';
import { drawOrStop } from '../game/draw.ts';
import { discardTileForOnline, canDiscard } from '../game/discard.ts';
import { declareKanForOnline, chooseCpuKan } from '../game/kan.ts';
import { assertPointConservation, nextRound, startMatch, updateMatchGame } from '../game/match.ts';
import { isClosedForRiichi, canDeclareRiichi } from '../game/riichi.ts';
import { getRonCandidates, markRonPassed, resolveRonDeclarations } from '../game/ron.ts';
import { isFourWindsDraw, canDeclareKyuushuKyuuhai, declareKyuushuKyuuhai } from '../game/special-draws.ts';
import { canDeclareTsumo, declareTsumo } from '../game/tsumo.ts';
import { completeKan } from '../game/kan.ts';
import { startGame } from '../game/start.ts';
import type { RandomSource } from '../game/shuffle.ts';
import { tileKindKey } from '../model/tile.ts';
import type { GameState, PlayerId, PlayerState } from '../model/game.ts';
import type { MatchState } from '../model/match.ts';
import { declarationsBetween, type PublicDeclarationEvent } from '../model/declaration.ts';
import type { GameMutationMessage } from './protocol.ts';
import type { OnlineGameSession, OnlineSeatIdentity, PlayerDecisionWindow } from './game-view.ts';

export const DECISION_TIMEOUT_MS = 30_000;

export class OnlineGameRuleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'OnlineGameRuleError';
  }
}

export function secureRandomSource(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000;
}

function applyControls(game: GameState, identities: OnlineGameSession['identities']): GameState {
  const players = game.players.map((player, seat) => ({
    ...player,
    control: identities[seat as PlayerId].control,
  })) as [PlayerState, PlayerState, PlayerState, PlayerState];
  return { ...game, players };
}

/** A CPU policy gets its own private tiles and all public state, never other hands. */
function cpuStrategyView(game: GameState, playerId: PlayerId): GameState {
  const players = game.players.map(player => player.id === playerId ? player : {
    ...player,
    hand: [],
    drawnTile: null,
    drawnTileSource: null,
  }) as [PlayerState, PlayerState, PlayerState, PlayerState];
  return { ...game, players };
}

function nextSecureGame(
  dealerId: PlayerId,
  identities: OnlineGameSession['identities'],
  random: RandomSource = secureRandomSource,
): GameState {
  return applyControls(startGame(random, dealerId), identities);
}

export function startOnlineGame(
  identities: OnlineGameSession['identities'],
  hostSeat: PlayerId,
  random: RandomSource = secureRandomSource,
): OnlineGameSession {
  const game = nextSecureGame(0, identities, random);
  const match = startMatch(game);
  assertPointConservation(match);
  return {
    schemaVersion: 1,
    gameRevision: 1,
    match,
    status: 'playing',
    identities,
    hostSeat,
    decision: null,
    declarations: [],
  };
}

function recordResolvedDeclarations(
  previous: OnlineGameSession,
  next: OnlineGameSession,
  now: number,
): OnlineGameSession {
  const signals = declarationsBetween(previous.match.game, next.match.game);
  if (!signals.length) return next;
  const history = previous.declarations ?? [];
  let id = history.reduce((last, event) => Math.max(last, event.id), 0);
  const events: PublicDeclarationEvent[] = signals.map(signal => ({
    id: ++id,
    roundNumber: previous.match.roundNumber,
    dealerId: previous.match.dealerId,
    honba: previous.match.honba,
    seat: signal.seat,
    kind: signal.kind,
    occurredAt: now,
  }));
  return { ...next, declarations: [...history, ...events] };
}

function randomWindowId(): string {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

function setStatus(session: OnlineGameSession, match: MatchState): OnlineGameSession['status'] {
  if (session.status === 'aborted') return 'aborted';
  if (match.status === 'match-ended') return 'match-ended';
  if (match.status === 'round-ended') return 'round-ended';
  return 'playing';
}

function openWindow(
  type: PlayerDecisionWindow['type'],
  seats: readonly PlayerId[],
  now: number,
  baseGameRevision: number,
): PlayerDecisionWindow {
  return {
    windowId: randomWindowId(),
    type,
    openedAt: now,
    expiresAt: now + DECISION_TIMEOUT_MS,
    baseGameRevision,
    requiredSeats: seats,
    responses: Object.fromEntries(seats.map(seat => [seat, 'pending'])) as Record<number, 'pending' | 'yes' | 'pass' | `call:${string}`>,
  };
}

function humanSeats(session: OnlineGameSession): readonly PlayerId[] {
  return session.identities.filter(identity => identity.control === 'human').map(identity => identity.seat);
}

function advanceDecision(
  session: OnlineGameSession,
  match: MatchState,
  revision: number,
  now: number,
): OnlineGameSession {
  let currentMatch = match;
  let decision: PlayerDecisionWindow | null = null;
  if (currentMatch.status === 'playing' && currentMatch.game.phase === 'awaiting-ron') {
    const game = currentMatch.game;
    const candidates = getRonCandidates(game);
    const humans = candidates.filter(candidate => game.players[candidate.winnerId].control === 'human')
      .map(candidate => candidate.winnerId);
    if (humans.length) {
      decision = openWindow('ron', humans, now, revision);
    } else {
      const cpuWinners = candidates.filter(candidate => game.players[candidate.winnerId].control === 'cpu')
        .map(candidate => candidate.winnerId);
      let resolved: GameState;
      if (cpuWinners.length) resolved = resolveRonDeclarations(game, cpuWinners);
      else if (game.ronWindow?.kan) resolved = completeKan(game, game.ronWindow.kan);
      else resolved = { ...game, phase: 'awaiting-call' };
      currentMatch = updateMatchGame(currentMatch, resolved);
    }
  }
  if (!decision && currentMatch.status === 'playing' && currentMatch.game.phase === 'awaiting-call') {
    const game = currentMatch.game;
    if (isFourWindsDraw(game)) {
      currentMatch = updateMatchGame(currentMatch, {
        ...game,
        phase: 'wall-exhausted',
        abortiveDraw: 'four-winds',
        ronWindow: null,
      });
    } else {
      const humans = humanSeats(session).filter(seat => getCallOptions(game, seat).length > 0);
      if (humans.length) decision = openWindow('call', humans, now, revision);
      else currentMatch = updateMatchGame(currentMatch, awaitlessResolveCalls(game));
    }
  }
  return {
    ...session,
    gameRevision: revision,
    match: currentMatch,
    status: setStatus(session, currentMatch),
    roundReady: currentMatch.status === 'round-ended'
      ? session.roundReady ?? { baseGameRevision: revision, seats: [] } : undefined,
    decision,
  };
}

// Kept as a function so all no-human call resolution remains in the shared engine.
function awaitlessResolveCalls(game: GameState): GameState {
  return resolveCallResponses({ ...game, phase: 'awaiting-call' }, []);
}

function commitMatch(
  session: OnlineGameSession,
  match: MatchState,
  now: number,
): OnlineGameSession {
  return recordResolvedDeclarations(
    session,
    advanceDecision(session, match, session.gameRevision + 1, now),
    now,
  );
}

function markPassedCandidates(game: GameState, seats: readonly PlayerId[]): GameState {
  return seats.reduce((current, seat) => markRonPassed(current, seat), game);
}

function finishDecision(
  session: OnlineGameSession,
  decision: PlayerDecisionWindow,
  now: number,
): OnlineGameSession {
  const match = session.match;
  let game = match.game;
  if (decision.type === 'ron') {
    const passes = decision.requiredSeats.filter(seat => decision.responses[seat] === 'pass');
    game = markPassedCandidates(game, passes);
    const winners = getRonCandidates(game).filter(candidate =>
      game.players[candidate.winnerId].control === 'cpu' || decision.responses[candidate.winnerId] === 'yes',
    ).map(candidate => candidate.winnerId);
    if (winners.length) game = resolveRonDeclarations(game, winners);
    else if (game.ronWindow?.kan) game = completeKan(game, game.ronWindow.kan);
    else game = { ...game, phase: 'awaiting-call' };
  } else {
    const selected: CallOption[] = [];
    for (const seat of decision.requiredSeats) {
      const response = decision.responses[seat];
      if (typeof response !== 'string' || !response.startsWith('call:')) continue;
      const optionId = response.slice(5);
      const option = getCallOptions(game, seat).find(candidate => candidate.id === optionId);
      if (!option) throw new OnlineGameRuleError('stale_decision');
      selected.push(option);
    }
    game = resolveCallResponses(game, selected);
  }
  const settled = updateMatchGame(match, game);
  const next = advanceDecision({ ...session, decision: null }, settled, session.gameRevision + 1, now);
  return recordResolvedDeclarations(session, next, now);
}

/** Transfer control of a persisted seat without changing any of its game state. */
export function transferOnlineSeatToCpu(
  session: OnlineGameSession,
  seat: PlayerId,
  hostSeat: PlayerId,
  now = Date.now(),
): OnlineGameSession {
  if (session.status === 'aborted' || session.identities[seat]?.control !== 'human') {
    throw new OnlineGameRuleError('seat_not_human');
  }
  const cpuSeats = session.identities
    .filter(identity => identity.control === 'cpu' || identity.seat === seat)
    .map(identity => identity.seat)
    .sort((a, b) => a - b);
  const cpuNames = new Map(cpuSeats.map((cpuSeat, index) => [cpuSeat, `CPU${index + 1}`]));
  const identities = session.identities.map(identity => {
    const control = identity.seat === seat ? 'cpu' as const : identity.control;
    const cpuName = cpuNames.get(identity.seat);
    return {
      ...identity,
      ...(cpuName ? { name: cpuName } : {}),
      control,
      ...(identity.seat === seat ? { connected: true } : {}),
    };
  }) as unknown as OnlineGameSession['identities'];
  const players = session.match.game.players.map(player => player.id === seat
    ? { ...player, control: 'cpu' as const }
    : player) as unknown as OnlineGameSession['match']['game']['players'];
  const converted: OnlineGameSession = {
    ...session,
    match: { ...session.match, game: { ...session.match.game, players } },
    identities,
    hostSeat,
  };

  const decision = session.decision;
  if (!decision || !decision.requiredSeats.includes(seat)) {
    return startOnlineRoundIfReady({ ...converted, gameRevision: session.gameRevision + 1 });
  }

  const responses = { ...decision.responses };
  delete responses[seat];
  const updatedDecision: PlayerDecisionWindow = {
    ...decision,
    requiredSeats: decision.requiredSeats.filter(requiredSeat => requiredSeat !== seat),
    responses,
  };
  const withUpdatedDecision = { ...converted, decision: updatedDecision };
  if (updatedDecision.requiredSeats.some(requiredSeat => responses[requiredSeat] === 'pending')) {
    return { ...withUpdatedDecision, gameRevision: session.gameRevision + 1 };
  }

  // Resolve now when the departed seat was the last pending answer. The shared
  // resolver applies the existing CPU ron and call policies while retaining all
  // answers already submitted by the other humans.
  return finishDecision(withUpdatedDecision, updatedDecision, now);
}

function requireHuman(session: OnlineGameSession, seat: PlayerId, connectedSeats: ReadonlySet<PlayerId>): void {
  if (session.identities[seat]?.control !== 'human' || !connectedSeats.has(seat)) {
    throw new OnlineGameRuleError('unauthorized');
  }
}

export function applyOnlineGameAction(
  session: OnlineGameSession,
  actorSeat: PlayerId,
  action: GameMutationMessage,
  connectedSeats: ReadonlySet<PlayerId>,
  now = Date.now(),
): OnlineGameSession {
  requireHuman(session, actorSeat, connectedSeats);
  if (session.status !== 'playing' || session.match.status !== 'playing') {
    throw new OnlineGameRuleError('game_not_playing');
  }

  if (action.type === 'declare-ron' || action.type === 'pass-ron' ||
      action.type === 'declare-call' || action.type === 'pass-call') {
    const decision = session.decision;
    const expectedType = action.type.endsWith('ron') ? 'ron' : 'call';
    if (!decision || decision.type !== expectedType || action.windowId !== decision.windowId) {
      throw new OnlineGameRuleError('stale_decision');
    }
    if (decision.expiresAt <= now) throw new OnlineGameRuleError('stale_decision');
    if (!decision.requiredSeats.includes(actorSeat)) throw new OnlineGameRuleError('not_eligible');
    if (decision.responses[actorSeat] !== 'pending') throw new OnlineGameRuleError('already_responded');
    if (action.expectedGameRevision !== decision.baseGameRevision) throw new OnlineGameRuleError('stale_revision');

    let response: 'yes' | 'pass' | `call:${string}`;
    if (action.type === 'declare-ron') response = 'yes';
    else if (action.type === 'declare-call') {
      if (!getCallOptions(session.match.game, actorSeat).some(option => option.id === action.optionId)) {
        throw new OnlineGameRuleError('invalid_option');
      }
      response = `call:${action.optionId}`;
    } else response = 'pass';

    const responses = { ...decision.responses, [actorSeat]: response };
    const updatedDecision = { ...decision, responses };
    const partial: OnlineGameSession = {
      ...session,
      gameRevision: session.gameRevision + 1,
      decision: updatedDecision,
    };
    if (decision.requiredSeats.some(seat => responses[seat] === 'pending')) return partial;
    return finishDecision(partial, updatedDecision, now);
  }

  if (action.expectedGameRevision !== session.gameRevision) throw new OnlineGameRuleError('stale_revision');
  if (session.decision) throw new OnlineGameRuleError('decision_pending');

  const match = session.match;
  const game = match.game;
  let updated: MatchState;
  switch (action.type) {
    case 'discard':
      if (game.turnPlayerId !== actorSeat) throw new OnlineGameRuleError('not_your_turn');
      updated = { ...match, game: discardTileForOnline(game, actorSeat, action.tileId) };
      break;
    case 'declare-riichi': {
      if (game.turnPlayerId !== actorSeat || !canDeclareRiichi(game, actorSeat, action.tileId, match.points[actorSeat])) {
        throw new OnlineGameRuleError('invalid_riichi');
      }
      const player = game.players[actorSeat];
      const doubleRiichi = !game.callsMade && !game.players.some((candidate: PlayerState) => candidate.melds?.length) &&
        player.river.length === 0 && isClosedForRiichi(player);
      const discarded = discardTileForOnline(game, actorSeat, action.tileId);
      const nextGame = { ...discarded, pendingRiichi: {
        playerId: actorSeat,
        declarationTileId: action.tileId,
        doubleRiichi,
      } };
      updated = { ...match, game: nextGame };
      break;
    }
    case 'declare-tsumo':
      if (game.turnPlayerId !== actorSeat || !canDeclareTsumo(game, actorSeat)) throw new OnlineGameRuleError('invalid_tsumo');
      updated = updateMatchGame(match, declareTsumo(game, actorSeat));
      break;
    case 'declare-kan':
      if (game.turnPlayerId !== actorSeat) throw new OnlineGameRuleError('not_your_turn');
      updated = { ...match, game: declareKanForOnline(game, actorSeat, action.optionId) };
      break;
    case 'declare-kyuushu-kyuuhai':
      if (game.turnPlayerId !== actorSeat || !canDeclareKyuushuKyuuhai(game, actorSeat)) {
        throw new OnlineGameRuleError('invalid_kyuushu_kyuuhai');
      }
      updated = updateMatchGame(match, declareKyuushuKyuuhai(game, actorSeat));
      break;
    default:
      throw new OnlineGameRuleError('invalid_action');
  }
  if (updated.status === 'playing' && updated.game.pendingRiichi) {
    updated = { ...updated, game: { ...updated.game, pendingRiichi: updated.game.pendingRiichi } };
  }
  return commitMatch(session, updated, now);
}

export function timeoutOnlineDecision(session: OnlineGameSession, now = Date.now()): OnlineGameSession {
  const decision = session.decision;
  if (!decision || decision.expiresAt > now || session.status !== 'playing') return session;
  const responses = { ...decision.responses };
  for (const seat of decision.requiredSeats) if (responses[seat] === 'pending') responses[seat] = 'pass';
  const expired = { ...decision, responses };
  return finishDecision(session, expired, now);
}

/** Only human seats participate, regardless of transient WebSocket connectivity. */
export function startOnlineRoundIfReady(session: OnlineGameSession): OnlineGameSession {
  const humans = humanSeats(session);
  if (session.status !== 'round-ended' || !humans.length ||
      !humans.every(seat => session.roundReady?.seats.includes(seat))) return session;
  return startNextOnlineRound(session);
}

export function readyForNextOnlineRound(
  session: OnlineGameSession,
  seat: PlayerId,
  expectedGameRevision: number,
): OnlineGameSession {
  if (session.identities[seat]?.control !== 'human') throw new OnlineGameRuleError('unauthorized');
  if (session.status !== 'round-ended' || session.match.status !== 'round-ended') {
    throw new OnlineGameRuleError('round_not_ended');
  }
  const ready = session.roundReady ?? { baseGameRevision: session.gameRevision, seats: [] };
  // Accept simultaneous confirmations from snapshots of this result, but never
  // a request from before settlement or a future revision.
  if (expectedGameRevision < ready.baseGameRevision || expectedGameRevision > session.gameRevision) {
    throw new OnlineGameRuleError('stale_revision');
  }
  if (ready.seats.includes(seat)) return session;
  return startOnlineRoundIfReady({
    ...session,
    gameRevision: session.gameRevision + 1,
    roundReady: { ...ready, seats: [...ready.seats, seat] },
  });
}

export function startNextOnlineRound(
  session: OnlineGameSession,
  random: RandomSource = secureRandomSource,
): OnlineGameSession {
  if (session.status !== 'round-ended' || session.match.status !== 'round-ended') {
    throw new OnlineGameRuleError('round_not_ended');
  }
  const match = nextRound(session.match, dealer => nextSecureGame(dealer, session.identities, random));
  if (match.status !== 'playing') throw new OnlineGameRuleError('round_not_available');
  return {
    ...session,
    gameRevision: session.gameRevision + 1,
    match,
    status: 'playing',
    decision: null,
    roundReady: undefined,
  };
}

export async function advanceOnlineCpu(
  session: OnlineGameSession,
  now = Date.now(),
): Promise<OnlineGameSession> {
  if (session.status !== 'playing' || session.decision) return session;
  const match = session.match;
  const game = match.game;
  if (game.phase === 'awaiting-draw') return commitMatch(session, updateMatchGame(match, drawOrStop(game)), now);
  if (game.phase !== 'awaiting-discard' || game.players[game.turnPlayerId].control !== 'cpu') return session;
  const playerId = game.turnPlayerId;
  if (canDeclareTsumo(game, playerId)) return commitMatch(session, updateMatchGame(match, declareTsumo(game, playerId)), now);
  if (canDeclareKyuushuKyuuhai(game, playerId)) {
    return commitMatch(session, updateMatchGame(match, declareKyuushuKyuuhai(game, playerId)), now);
  }
  const strategyGame = cpuStrategyView(game, playerId);
  const kan = chooseCpuKan(strategyGame, playerId);
  if (kan) return commitMatch(session, { ...match, game: declareKanForOnline(game, playerId, kan.id) }, now);
  const riichiDiscard = chooseCpuRiichiDiscard(strategyGame, playerId, match.points[playerId], 2.5);
  if (riichiDiscard) {
    const player = game.players[playerId];
    const doubleRiichi = !game.callsMade && !game.players.some((candidate: PlayerState) => candidate.melds?.length) &&
      player.river.length === 0 && isClosedForRiichi(player);
    const discarded = discardTileForOnline(game, playerId, riichiDiscard);
    const nextGame = { ...discarded, pendingRiichi: {
      playerId,
      declarationTileId: riichiDiscard,
      doubleRiichi,
    } };
    return commitMatch(session, { ...match, game: nextGame }, now);
  }

  if (game.players[playerId].riichi) {
    const forcedDraw = game.players[playerId].drawnTile;
    if (!forcedDraw) throw new OnlineGameRuleError('cpu_turn_failed');
    return commitMatch(session, { ...match, game: discardTileForOnline(game, playerId, forcedDraw.id) }, now);
  }

  const abort = new AbortController();
  // Keep each Workers Free CPU invocation bounded. The existing evaluator is
  // interrupted after one short slice; a deterministic legal discard is the fallback.
  const budget = setTimeout(() => abort.abort(), 3);
  let tileId: string | null = null;
  try {
    tileId = await chooseShantenDiscardAsync(strategyGame, playerId, abort.signal, 2);
  } finally {
    clearTimeout(budget);
  }
  if (!tileId || !canDiscard(game, playerId) ||
      ![...game.players[playerId].hand, game.players[playerId].drawnTile].some(tile => tile?.id === tileId)) {
    const player = game.players[playerId];
    tileId = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]
      .filter(tile => !player.callDiscard?.forbiddenKinds.includes(tileKindKey(tile.tile)))
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null;
  }
  if (!tileId) throw new OnlineGameRuleError('cpu_turn_failed');
  return commitMatch(session, { ...match, game: discardTileForOnline(game, playerId, tileId) }, now);
}

export function markOnlineGameAborted(session: OnlineGameSession): OnlineGameSession {
  return {
    ...session,
    gameRevision: session.gameRevision + 1,
    status: 'aborted',
    decision: null,
    abortReason: 'participant-left',
  };
}

export function hydrateOnlineGame(serialized: string): OnlineGameSession | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return null;
    const session = parsed as Partial<OnlineGameSession>;
    if (session.schemaVersion !== 1 || !Number.isSafeInteger(session.gameRevision) ||
        !session.match || !Array.isArray(session.identities) || session.identities.length !== 4 ||
        !Number.isInteger(session.hostSeat) || session.hostSeat! < 0 || session.hostSeat! > 3 ||
        !['playing', 'round-ended', 'match-ended', 'aborted'].includes(String(session.status)) ||
        !(session.decision === null || typeof session.decision === 'object')) return null;
    assertPointConservation(session.match);
    if (session.match.game.players.length !== 4 || session.match.game.players.some((player: PlayerState, seat: number) =>
      player.id !== seat || !['human', 'cpu'].includes(player.control))) return null;
    if (session.roundReady && (!Number.isSafeInteger(session.roundReady.baseGameRevision) ||
        session.roundReady.baseGameRevision < 0 || session.roundReady.baseGameRevision > session.gameRevision! ||
        !Array.isArray(session.roundReady.seats) || session.roundReady.seats.some(seat =>
          !Number.isInteger(seat) || seat < 0 || seat > 3))) return null;
    return { ...session, roundReady: session.status === 'round-ended'
      ? session.roundReady ?? { baseGameRevision: session.gameRevision!, seats: [] } : undefined } as OnlineGameSession;
  } catch {
    return null;
  }
}

export function onlineIdentitiesFromSeats(
  seats: readonly Readonly<{ seat: number; name: string | null; kind: 'human' | 'cpu'; connected: boolean }>[],
): OnlineGameSession['identities'] {
  const bySeat = new Map(seats.map(seat => [seat.seat, seat]));
  return [0, 1, 2, 3].map(seat => {
    const item = bySeat.get(seat);
    if (!item || !item.name) throw new OnlineGameRuleError('seat_assignment_invalid');
    return {
      seat: seat as PlayerId,
      name: item.name,
      control: item.kind,
      connected: item.kind === 'cpu' || item.connected === true,
    };
  }) as unknown as OnlineGameSession['identities'];
}
