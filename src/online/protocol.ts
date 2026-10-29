/** Shared contract for the online waiting room and its server-owned game. */
import type { MatchFormat } from '../model/match.ts';
import type { PlayerId } from '../model/game.ts';
import type { PlayerGameView, PublicRoundResult } from './game-view.ts';

export const ONLINE_WS_PROTOCOL = 'heibon-mahjong.v1';

export type RoomStatus = 'waiting' | 'finalized' | 'closed';
export type RoomSeatKind = 'human' | 'cpu' | 'empty';

export type OnlineRoomSeat = {
  /** Stable participant slot used for authentication and host ownership. */
  seat: number;
  /** Match seat after finalization; null while the waiting list is unassigned. */
  gameSeat: number | null;
  kind: RoomSeatKind;
  name: string | null;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
};

export type OnlineRoomState = {
  roomCode: string;
  status: RoomStatus;
  format: MatchFormat;
  hostSeat: number | null;
  revision: number;
  createdAt: number;
  expiresAt: number;
  seats: OnlineRoomSeat[];
};

export type RoomActionPayload =
  | { type: 'set-ready'; ready: boolean }
  | { type: 'finalize-seats' }
  | { type: 'leave-room' }
  | { type: 'close-room' };

export type RoomMutationMessage = RoomActionPayload & {
  requestId: string;
  expectedRevision: number;
};

export type RoomClientMessage = RoomMutationMessage | { type: 'request-state' };
export type RoomActionResult = {
  type: 'action-result';
  requestId: string;
  ok: boolean;
  revision: number;
  code?: string;
};
export type RoomSocketError = {
  type: 'error';
  code: string;
  requestId?: string;
  retryAfterMs?: number;
};
export type RoomStateMessage = { type: 'room-state' } & OnlineRoomState;
export type LegacyRoomStateMessage = { type: 'room_state' } & OnlineRoomState;
export type RoomClosedMessage = { type: 'room-closed'; revision: number };
export type SeatTakenOverMessage = {
  type: 'seat-taken-over';
  seat: number;
  departedName: string;
  cpuName: string;
  hostChanged: boolean;
  hostSeat: number;
  hostName: string;
};

export type GameActionPayload =
  | { type: 'start-game' }
  | { type: 'discard'; tileId: string }
  | { type: 'declare-riichi'; tileId: string }
  | { type: 'declare-tsumo' }
  | { type: 'declare-ron'; windowId: string }
  | { type: 'pass-ron'; windowId: string }
  | { type: 'declare-call'; windowId: string; optionId: string }
  | { type: 'pass-call'; windowId: string }
  | { type: 'declare-kan'; optionId: string }
  | { type: 'declare-kyuushu-kyuuhai' }
  /** Confirm this result. expectedGameRevision must fall within the current result's revisions. */
  | { type: 'next-round' };

export type GameMutationMessage = GameActionPayload & {
  requestId: string;
  expectedGameRevision: number;
};

export type GameClientMessage = GameMutationMessage | { type: 'request-game-state' };
export type GameActionResult = {
  type: 'game-action-result';
  requestId: string;
  ok: boolean;
  gameRevision: number;
  code?: string;
};
export type GameErrorMessage = {
  type: 'game-error';
  code: string;
  requestId?: string;
};
export type GameStateMessage = { type: 'game-state'; view: PlayerGameView };
export type GameStartedMessage = { type: 'game-started'; view: PlayerGameView };
export type RoundEndedMessage = {
  type: 'round-ended';
  gameRevision: number;
  result: PublicRoundResult;
};
export type MatchEndedMessage = {
  type: 'match-ended';
  gameRevision: number;
  result: PublicRoundResult;
  rankings: readonly { playerId: PlayerId; points: number; rank: number }[];
};
export type GameAbortedMessage = {
  type: 'game-aborted';
  gameRevision: number;
  reason: 'participant-left';
};
