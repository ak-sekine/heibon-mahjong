import type { FuEntry } from '../analysis/fu.ts';
import type { ScoreTier } from '../analysis/score.ts';
import type { GameState, OpenMeld, PhysicalTile, PlayerId, PlayerState, WinDetails } from '../model/game.ts';
import type { MatchState, RoundSettlement } from '../model/match.ts';
import type { Tile } from '../model/tile.ts';
import type { PublicDeclarationEvent } from '../model/declaration.ts';
import { exposedDoraIndicators, uraDoraIndicators } from '../game/dora.ts';
import { canDiscard } from '../game/discard.ts';
import { getCallOptions, type CallOption } from '../game/calls.ts';
import { getKanOptions } from '../game/kan.ts';
import { getRiichiDiscardOptions } from '../game/riichi.ts';
import { canDeclareKyuushuKyuuhai } from '../game/special-draws.ts';
import { canDeclareTsumo } from '../game/tsumo.ts';
import { getRonCandidates, getRonTile } from '../game/ron.ts';

export type PublicTile = Readonly<{ id: string; tile: Tile }>;
export type PublicMeld = Readonly<{
  type: OpenMeld['type'];
  /** Null entries are the two masked ends of an ankan. */
  tiles: readonly (PublicTile | null)[];
  calledTileId: string;
  fromPlayerId: PlayerId;
  addedTileId?: string;
}>;

export type OnlineSeatIdentity = Readonly<{
  seat: PlayerId;
  name: string;
  control: 'human' | 'cpu';
  connected: boolean;
}>;

export type PublicWinSummary = Readonly<{
  winnerId: PlayerId;
  method: 'tsumo' | 'ron';
  discarderId?: PlayerId;
  winningTile: PublicTile;
  totalPoints: number;
  han: number;
  yakuHan: number;
  fu: number | null;
  rawFu: number | null;
  scoreTier: ScoreTier;
  yakumanCount: number;
  yaku: readonly Readonly<{ id: string; han: number; yakuman: boolean }>[];
  dora: Readonly<{ normal: number; ura: number; red: number }>;
  doraCounts: Readonly<{ normal: number; ura: number; red: number }>;
  fuEntries: readonly FuEntry[];
}>;

export type PublicRoundResult = Readonly<{
  reason: RoundSettlement['reason'];
  roundNumber: number;
  dealerId: PlayerId;
  honba: number;
  before: readonly number[];
  after: readonly number[];
  deltas: readonly number[];
  payments: RoundSettlement['payments'];
  deposits: RoundSettlement['deposits'];
  tenpai: RoundSettlement['tenpai'];
  nagashiManganWinners?: readonly PlayerId[];
  winners: readonly PublicWinSummary[];
  matchEnded: boolean;
  next: RoundSettlement['next'];
}>;

export type PlayerGameView = Readonly<{
  type: 'game-state';
  roomCode: string;
  gameRevision: number;
  /** Public declarations are retained so clients can catch up between snapshots. */
  declarations: readonly PublicDeclarationEvent[];
  viewerSeat: PlayerId;
  status: 'playing' | 'round-ended' | 'match-ended' | 'aborted';
  abortReason?: 'participant-left';
  round: Readonly<{
    roundNumber: number;
    dealerId: PlayerId;
    honba: number;
    points: readonly number[];
    depositSticks: number;
  }>;
  phase: GameState['phase'];
  turnPlayerId: PlayerId;
  liveWallCount: number;
  seats: readonly Readonly<{
    seat: PlayerId;
    name: string;
    control: 'human' | 'cpu';
    connected: boolean;
    wind: PlayerState['wind'];
    isDealer: boolean;
    points: number;
    riichi: boolean;
    riichiDeclarationTileId?: string;
    concealedCount: number;
    /** Present only for the authenticated viewer. */
    hand?: readonly PublicTile[];
    drawnTile?: PublicTile | null;
    /** Only publicly revealed winning/tenpai hands are included. */
    revealedHand?: readonly PublicTile[];
    river: readonly PublicTile[];
    melds: readonly PublicMeld[];
  }>[];
  doraIndicators: readonly PublicTile[];
  uraDoraIndicators?: readonly PublicTile[];
  self: Readonly<{
    seat: PlayerId;
    isHost: boolean;
    discardableTileIds: readonly string[];
    riichiTileIds: readonly string[];
    canTsumo: boolean;
    canKyuushuKyuuhai: boolean;
    kanOptions: readonly Readonly<{ id: string; type: string; tiles: readonly PublicTile[] }>[];
    callOptions: readonly Readonly<{
      id: string;
      type: CallOption['type'];
      tiles: readonly PublicTile[];
      calledTileId: string;
      handTileIds: readonly string[];
    }>[];
    canRon: boolean;
    ronTile: PublicTile | null;
    decision: null | Readonly<{
      windowId: string;
      type: 'ron' | 'call';
      expiresAt: number;
      expectedGameRevision: number;
      answered: boolean;
    }>;
  }>;
  result: PublicRoundResult | null;
}>;

export type PlayerDecisionWindow = Readonly<{
  windowId: string;
  type: 'ron' | 'call';
  openedAt: number;
  expiresAt: number;
  baseGameRevision: number;
  requiredSeats: readonly PlayerId[];
  /** `pass` also records a timed-out response. */
  responses: Readonly<Record<number, 'pending' | 'yes' | 'pass' | `call:${string}`>>;
}>;

export type OnlineGameStatus = 'playing' | 'round-ended' | 'match-ended' | 'aborted';

export type OnlineGameSession = Readonly<{
  schemaVersion: 1;
  gameRevision: number;
  match: MatchState;
  status: OnlineGameStatus;
  identities: readonly [OnlineSeatIdentity, OnlineSeatIdentity, OnlineSeatIdentity, OnlineSeatIdentity];
  hostSeat: PlayerId;
  decision: PlayerDecisionWindow | null;
  /** Missing only on sessions persisted before declaration events were added. */
  declarations?: readonly PublicDeclarationEvent[];
  abortReason?: 'participant-left';
}>;

function publicTile(tile: PhysicalTile): PublicTile {
  return { id: tile.id, tile: tile.tile };
}

function publicMeld(meld: OpenMeld): PublicMeld {
  if (meld.type === 'ankan') {
    const tiles = [...meld.tiles];
    const redIndex = tiles.findIndex(tile => tile.tile.isRed);
    if (redIndex > 1) [tiles[1], tiles[redIndex]] = [tiles[redIndex], tiles[1]];
    return {
      type: meld.type,
      tiles: [null, publicTile(tiles[1]), publicTile(tiles[2]), null],
      calledTileId: '',
      fromPlayerId: meld.fromPlayerId,
    };
  }
  return {
    type: meld.type,
    tiles: meld.tiles.map(publicTile),
    calledTileId: meld.calledTileId,
    fromPlayerId: meld.fromPlayerId,
    ...(meld.type === 'kakan' && meld.addedTileId ? { addedTileId: meld.addedTileId } : {}),
  };
}

function publicWin(
  result: WinDetails,
  method: 'tsumo' | 'ron',
  tile: PhysicalTile,
  discarderId?: PlayerId,
): PublicWinSummary {
  return {
    winnerId: result.winnerId,
    method,
    ...(method === 'ron' && discarderId !== undefined ? { discarderId } : {}),
    winningTile: publicTile(tile),
    totalPoints: result.totalPoints,
    han: result.totalHanIncludingDora,
    yakuHan: result.yakuHan,
    fu: result.fu,
    rawFu: result.rawFu,
    scoreTier: result.scoreTier,
    yakumanCount: result.yakumanCount,
    yaku: result.candidate.yaku.map(entry => ({ id: entry.id, han: entry.han, yakuman: entry.yakuman > 0 })),
    dora: { normal: result.doraHan, ura: result.uraDoraHan, red: result.redDoraHan },
    doraCounts: { normal: result.doraCount, ura: result.uraDoraCount, red: result.redDoraCount },
    fuEntries: result.fuBreakdown,
  };
}

function publicResult(match: MatchState): PublicRoundResult | null {
  const settlement = match.lastSettlement;
  if (!settlement) return null;
  const game = match.game;
  const win = game.winResult;
  const winners = !win ? [] : win.winMethod === 'ron'
    ? win.winners.map(result => publicWin(result, 'ron', win.winningTile!, win.discarderId))
    : [publicWin(win, 'tsumo', game.players[win.winnerId].drawnTile ??
      game.players[win.winnerId].hand.find(tile => tile.id === win.winningTileId)!)];
  return {
    reason: settlement.reason,
    roundNumber: settlement.roundNumber,
    dealerId: settlement.dealerId,
    honba: settlement.honba,
    before: settlement.before,
    after: settlement.after,
    deltas: settlement.deltas,
    payments: settlement.payments,
    deposits: settlement.deposits,
    tenpai: settlement.tenpai,
    ...(settlement.nagashiManganWinners ? { nagashiManganWinners: settlement.nagashiManganWinners } : {}),
    winners,
    matchEnded: settlement.matchEnded,
    next: settlement.next,
  };
}

/** Explicit allowlist: this never serializes GameState, MatchState, or a whole PlayerState. */
export function createPlayerGameView(
  session: OnlineGameSession,
  viewerSeat: PlayerId,
  roomCode: string,
  connectedSeats: ReadonlySet<PlayerId>,
): PlayerGameView {
  const { match, decision } = session;
  const game = match.game;
  const winResult = game.winResult;
  const winningResults: readonly WinDetails[] = winResult
    ? winResult.winMethod === 'ron' ? winResult.winners : [winResult]
    : [];
  const winningSeats = new Set(winningResults.map(result => result.winnerId));
  const publicTenpai = match.lastSettlement?.reason === 'draw' ? match.lastSettlement.tenpai : null;
  const revealUra = winningResults.some(result => Boolean(game.players[result.winnerId].riichi));
  const selfPlayer = game.players[viewerSeat];
  const eligible = decision?.requiredSeats.includes(viewerSeat) ?? false;
  const answered = eligible && decision?.responses[viewerSeat] !== 'pending';
  const ownCallOptions = game.phase === 'awaiting-call' ? getCallOptions(game, viewerSeat) : [];
  const ownKanOptions = session.status === 'playing' ? getKanOptions(game, viewerSeat) : [];
  const ownRiichiOptions = session.status === 'playing'
    ? getRiichiDiscardOptions(game, viewerSeat, match.points[viewerSeat]) : [];
  const ownRon = getRonCandidates(game).some(candidate => candidate.winnerId === viewerSeat);
  const ronTile = ownRon ? getRonTile(game) : null;
  const seats = game.players.map(player => {
    const identity = session.identities[player.id];
    const concealed = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])];
    let revealedHand: readonly PublicTile[] | undefined;
    if (winningSeats.has(player.id)) {
      const tiles = [...concealed];
      if (winResult?.winMethod === 'ron' && player.id !== winResult.discarderId && winResult.winningTile &&
        !tiles.some(tile => tile.id === winResult.winningTile!.id)) tiles.push(winResult.winningTile);
      revealedHand = tiles.map(publicTile);
    // The existing local table only reveals CPU hands on an exhaustive draw.
    // Human tenpai is scored by the shared rules, but there is no explicit
    // human tenpai declaration in the protocol, so their concealed hand stays private.
    } else if (player.control === 'cpu' && publicTenpai?.[player.id]) {
      revealedHand = concealed.map(publicTile);
    }
    const viewer = player.id === viewerSeat;
    return {
      seat: player.id,
      name: identity.name,
      control: identity.control,
      connected: identity.control === 'cpu' || connectedSeats.has(player.id),
      wind: player.wind,
      isDealer: player.id === game.dealerId,
      points: match.points[player.id],
      riichi: player.riichi !== null,
      ...(player.riichi ? { riichiDeclarationTileId: player.riichi.declarationTileId } : {}),
      concealedCount: concealed.length,
      ...(viewer ? { hand: player.hand.map(publicTile), drawnTile: player.drawnTile ? publicTile(player.drawnTile) : null } : {}),
      ...(revealedHand ? { revealedHand } : {}),
      river: player.river.map(publicTile),
      melds: (player.melds ?? []).map(publicMeld),
    };
  }) as PlayerGameView['seats'];

  return {
    type: 'game-state',
    roomCode,
    gameRevision: session.gameRevision,
    declarations: session.declarations ?? [],
    viewerSeat,
    status: session.status,
    ...(session.abortReason ? { abortReason: session.abortReason } : {}),
    round: {
      roundNumber: match.roundNumber,
      dealerId: match.dealerId,
      honba: match.honba,
      points: match.points,
      depositSticks: match.depositSticks,
    },
    phase: game.phase,
    turnPlayerId: game.turnPlayerId,
    liveWallCount: game.liveWall.length,
    seats,
    doraIndicators: exposedDoraIndicators(game).map(publicTile),
    ...(revealUra ? { uraDoraIndicators: uraDoraIndicators(game).map(publicTile) } : {}),
    self: {
      seat: viewerSeat,
      isHost: session.hostSeat === viewerSeat,
      discardableTileIds: canDiscard(game, viewerSeat)
        ? [...selfPlayer.hand, ...(selfPlayer.drawnTile ? [selfPlayer.drawnTile] : [])]
          .filter(tile => !selfPlayer.riichi || tile.id === selfPlayer.drawnTile?.id)
          .map(tile => tile.id) : [],
      riichiTileIds: ownRiichiOptions.map(option => option.tileId),
      canTsumo: session.status === 'playing' && canDeclareTsumo(game, viewerSeat),
      canKyuushuKyuuhai: session.status === 'playing' && canDeclareKyuushuKyuuhai(game, viewerSeat),
      kanOptions: ownKanOptions.map(option => ({
        id: option.id,
        type: option.meld.type,
        tiles: option.meld.tiles.map(publicTile),
      })),
      callOptions: ownCallOptions.map(option => ({
        id: option.id,
        type: option.type,
        tiles: option.tiles.map(publicTile),
        calledTileId: option.calledTileId,
        handTileIds: option.handTileIds,
      })),
      canRon: ownRon,
      ronTile: ronTile ? publicTile(ronTile) : null,
      decision: eligible && decision ? {
        windowId: decision.windowId,
        type: decision.type,
        expiresAt: decision.expiresAt,
        expectedGameRevision: decision.baseGameRevision,
        answered: Boolean(answered),
      } : null,
    },
    result: publicResult(match),
  };
}
