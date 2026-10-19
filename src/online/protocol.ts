/** Shared, game-state-free contract for the Step 14 online waiting room. */
export const ONLINE_WS_PROTOCOL = 'heibon-mahjong.v1';

export type RoomStatus = 'waiting' | 'finalized' | 'closed';
export type RoomSeatKind = 'human' | 'cpu' | 'empty';

export type OnlineRoomSeat = {
  seat: number;
  kind: RoomSeatKind;
  name: string | null;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
};

export type OnlineRoomState = {
  roomCode: string;
  status: RoomStatus;
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
