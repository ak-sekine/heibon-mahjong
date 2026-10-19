import {
  ONLINE_WS_PROTOCOL,
  type OnlineRoomSeat,
  type OnlineRoomState,
  type RoomActionPayload,
  type RoomActionResult,
  type RoomSocketError,
} from './protocol.ts';

type RoomSeat = OnlineRoomSeat;
type RoomState = OnlineRoomState & { type?: string };
type RoomSession = {
  roomCode: string;
  participantToken: string;
  playerSeat: number;
  displayName: string;
  expiresAt: number;
};
type ApiRoomResponse = RoomSession & { seats: RoomSeat[]; createdAt?: number };
type PendingAction = {
  requestId: string;
  expectedRevision: number;
  payload: RoomActionPayload;
  sentGeneration: number | null;
};
type SocketActionResult = RoomActionResult;
type SocketError = RoomSocketError;

const SESSION_KEY = 'heibon-mahjong-online-session';
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;
const SEAT_NAMES = ['東', '南', '西', '北'] as const;
const roomErrorMessages: Record<string, string> = {
  invalid_display_name: '表示名を1〜24文字で入力してください。',
  invalid_room_code: 'ルームコードを確認してください。',
  room_not_found: 'そのルームコードは見つかりません。',
  room_expired: 'ルームの有効期限が切れています。',
  room_closed: 'このルームは終了しました。',
  room_finalized: '座席確定後は新しい参加者を受け付けていません。',
  room_full: 'このルームは満席です。',
  unauthorized: '認証に失敗しました。セッションを確認してください。',
  rate_limited: '操作が短時間に集中しています。少し待ってから再試行してください。',
};
const socketErrorMessages: Record<string, string> = {
  invalid_message: 'サーバーが操作内容を確認できませんでした。',
  invalid_json: '送信内容を読み取れませんでした。',
  message_too_large: '送信内容が大きすぎます。',
  rate_limited: '操作が短時間に集中しています。少し待ってから再試行してください。',
  request_id_reused: '操作IDが重複しました。状態を更新してから操作してください。',
  revision_conflict: 'ルーム状態が更新されました。最新状態を確認して、もう一度操作してください。',
  not_host: 'この操作はホストだけが行えます。',
  room_finalized: '座席確定後は準備状態を変更できません。',
  already_finalized: '座席はすでに確定しています。',
  no_participants: '座席確定には人間の参加者が必要です。',
  player_disconnected: '接続中の人間プレイヤーがそろっていません。',
  players_not_ready: 'すべての人間プレイヤーが準備完了していません。',
  stale_connection: '古い接続から操作が届きました。再接続してください。',
  room_closed: 'このルームは終了しました。',
  unauthorized: '参加者を認証できませんでした。',
};

class RoomApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RoomApiError';
  }
}

export class OnlineWaitingRoom {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#online-dialog')!;
  private readonly status = document.querySelector<HTMLElement>('#online-status')!;
  private readonly connection = document.querySelector<HTMLElement>('#online-connection')!;
  private readonly seats = document.querySelector<HTMLOListElement>('#online-seats')!;
  private readonly codeOutput = document.querySelector<HTMLElement>('#online-room-code')!;
  private readonly expiryOutput = document.querySelector<HTMLElement>('#online-room-expiry')!;
  private readonly selfOutput = document.querySelector<HTMLElement>('#online-my-seat')!;
  private readonly hostOutput = document.querySelector<HTMLElement>('#online-host')!;
  private readonly errorOutput = document.querySelector<HTMLElement>('#online-error')!;
  private readonly finalizedMessage = document.querySelector<HTMLElement>('#online-finalized-message')!;
  private readonly forms = document.querySelector<HTMLElement>('#online-room-forms')!;
  private readonly roomPanel = document.querySelector<HTMLElement>('#online-room')!;
  private readonly reconnectButton = document.querySelector<HTMLButtonElement>('#online-reconnect')!;
  private readonly readyButton = document.querySelector<HTMLButtonElement>('#online-ready')!;
  private readonly finalizeButton = document.querySelector<HTMLButtonElement>('#online-finalize')!;
  private readonly leaveButton = document.querySelector<HTMLButtonElement>('#online-leave')!;
  private readonly closeRoomButton = document.querySelector<HTMLButtonElement>('#online-close-room')!;
  private readonly apiUrl: string;
  private session: RoomSession | null = null;
  private state: RoomState | null = null;
  private socket: WebSocket | null = null;
  private connectGeneration = 0;
  private connectionPromise: Promise<void> | null = null;
  private reconnectTimer: number | null = null;
  private stableConnectionTimer: number | null = null;
  private stateSyncTimer: number | null = null;
  private reconnectAttempt = 0;
  private automaticReconnectAllowed = true;
  private dialogWasClosedByUser = false;
  private pendingAction: PendingAction | null = null;
  private pendingActionTimer: number | null = null;

  constructor(apiUrl: string | undefined) {
    this.apiUrl = (apiUrl ?? '').replace(/\/+$/u, '');
    document.querySelector<HTMLButtonElement>('#online-open')!.addEventListener('click', () => {
      this.dialogWasClosedByUser = false;
      this.automaticReconnectAllowed = true;
      if (!this.dialog.open) this.dialog.showModal();
      if (this.session && !this.isSocketOpen()) void this.connect();
    });
    document.querySelector<HTMLButtonElement>('#online-close')!.addEventListener('click', () => this.closeDialog());
    document.querySelector<HTMLFormElement>('#online-create')!.addEventListener('submit', event => {
      event.preventDefault();
      void this.createRoom();
    });
    document.querySelector<HTMLFormElement>('#online-join')!.addEventListener('submit', event => {
      event.preventDefault();
      void this.joinRoom();
    });
    this.reconnectButton.addEventListener('click', () => {
      this.automaticReconnectAllowed = true;
      this.dialogWasClosedByUser = false;
      this.reconnectAttempt = 0;
      void this.connect();
    });
    this.readyButton.addEventListener('click', () => this.toggleReady());
    this.finalizeButton.addEventListener('click', () => this.sendAction({ type: 'finalize-seats' }));
    this.leaveButton.addEventListener('click', () => this.leaveRoom());
    this.closeRoomButton.addEventListener('click', () => this.closeRoom());
    document.querySelector<HTMLButtonElement>('#online-copy-code')!.addEventListener('click', () => {
      void this.copyRoomCode();
    });
    this.dialog.addEventListener('cancel', () => this.stopAutomaticConnection());
    window.addEventListener('online', () => this.resumeConnection());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resumeConnection();
      else {
        this.clearReconnectTimer();
        this.clearStateSyncTimer();
      }
    });
    window.addEventListener('pagehide', () => {
      this.clearReconnectTimer();
      this.clearStableConnectionTimer();
      this.clearStateSyncTimer();
      this.clearPendingActionTimer();
      this.connectGeneration++;
      const socket = this.socket;
      this.socket = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Page hidden');
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted && this.session && !this.dialogWasClosedByUser) {
        this.automaticReconnectAllowed = true;
        void this.connect();
      }
    });

    if (!this.apiUrl) {
      this.setStatus('オンライン接続先はまだ設定されていません。');
      this.forms.hidden = true;
      return;
    }
    if (!this.isSecureApiUrl(this.apiUrl)) {
      this.setStatus('オンライン接続先の設定を確認してください。');
      this.forms.hidden = true;
      return;
    }
    this.restoreSession();
  }

  private isSecureApiUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch {
      return false;
    }
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private setError(message = ''): void {
    this.errorOutput.textContent = message;
    this.errorOutput.hidden = !message;
  }

  private setConnection(message: string): void {
    this.connection.textContent = message;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, { ...init, cache: 'no-store' });
    } catch {
      throw new RoomApiError('オンラインサーバーに接続できません。時間をおいて再試行してください。', 'network_error', 0);
    }
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { /* Use a generic failure message. */ }
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : '';
      const retryHeader = Number(response.headers.get('Retry-After') ?? 0);
      const retryAfterMs = Number.isFinite(body.retryAfterMs)
        ? Number(body.retryAfterMs)
        : Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : undefined;
      throw new RoomApiError(roomErrorMessages[code] ?? 'オンラインサーバーが要求を処理できませんでした。', code, response.status, retryAfterMs);
    }
    return body as T;
  }

  private async createRoom(): Promise<void> {
    const name = document.querySelector<HTMLInputElement>('#online-name')!.value.trim();
    this.setError();
    this.setStatus('ルームを作成しています…');
    try {
      const result = await this.request<ApiRoomResponse>('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      this.setSession(result, name);
      await this.connect();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'ルームを作成できませんでした。');
    }
  }

  private async joinRoom(): Promise<void> {
    const name = document.querySelector<HTMLInputElement>('#online-join-name')!.value.trim();
    const codeInput = document.querySelector<HTMLInputElement>('#online-join-code')!;
    const code = codeInput.value.trim().toUpperCase();
    this.setError();
    this.setStatus('ルームに参加しています…');
    try {
      const result = await this.request<ApiRoomResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      this.setSession(result, name);
      await this.connect();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'ルームに参加できませんでした。');
    }
  }

  private setSession(result: ApiRoomResponse, displayName: string): void {
    this.session = {
      roomCode: result.roomCode,
      participantToken: result.participantToken,
      playerSeat: result.playerSeat,
      displayName,
      expiresAt: result.expiresAt,
    };
    this.state = null;
    this.automaticReconnectAllowed = true;
    this.dialogWasClosedByUser = false;
    this.pendingAction = null;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    this.forms.hidden = true;
    this.roomPanel.hidden = false;
    this.codeOutput.textContent = result.roomCode;
    this.expiryOutput.textContent = new Date(result.expiresAt).toLocaleString();
    this.finalizedMessage.hidden = true;
    this.setError();
    if (!this.dialog.open) this.dialog.showModal();
    this.renderControls();
  }

  private restoreSession(): void {
    try {
      const value = sessionStorage.getItem(SESSION_KEY);
      if (!value) return;
      const session = JSON.parse(value) as RoomSession;
      if (!session || !ROOM_CODE_PATTERN.test(session.roomCode) ||
          !/^[a-f0-9]{64}$/u.test(session.participantToken) ||
          !Number.isInteger(session.playerSeat) || session.playerSeat < 0 || session.playerSeat > 3 ||
          typeof session.displayName !== 'string' || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      this.session = session;
      this.forms.hidden = true;
      this.roomPanel.hidden = false;
      this.codeOutput.textContent = session.roomCode;
      this.expiryOutput.textContent = new Date(session.expiresAt).toLocaleString();
      this.automaticReconnectAllowed = true;
      void this.connect();
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  private async connect(): Promise<void> {
    if (this.connectionPromise) return this.connectionPromise;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) return;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();
    this.clearStateSyncTimer();
    const session = this.session;
    if (!session) return;
    if (session.expiresAt <= Date.now()) {
      this.finishSession('ルームの有効期限が切れました。新しいルームを作成してください。');
      return;
    }
    const generation = ++this.connectGeneration;
    this.closeSocket(false);
    this.reconnectButton.hidden = true;
    this.setConnection('接続しています…');
    this.renderControls();
    const task = this.establishConnection(session, generation);
    this.connectionPromise = task;
    try {
      await task;
    } finally {
      if (this.connectionPromise === task) this.connectionPromise = null;
    }
  }

  private async establishConnection(session: RoomSession, generation: number): Promise<void> {
    try {
      const response = await this.request<{ ticket: string }>(`/api/rooms/${session.roomCode}/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.participantToken}` },
      });
      if (generation !== this.connectGeneration || this.session !== session) return;
      const wsUrl = new URL(`${this.apiUrl}/api/rooms/${session.roomCode}/socket`);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(wsUrl, [ONLINE_WS_PROTOCOL, `ticket.${response.ticket}`]);
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.stableConnectionTimer = window.setTimeout(() => {
          this.stableConnectionTimer = null;
          if (this.isCurrentSocket(socket, generation)) this.reconnectAttempt = 0;
        }, 30_000);
        this.reconnectButton.hidden = true;
        this.setConnection('接続しました。ルーム状態を同期しています…');
      });
      socket.addEventListener('message', event => {
        if (!this.isCurrentSocket(socket, generation) || typeof event.data !== 'string') return;
        this.receiveMessage(socket, generation, event.data);
      });
      socket.addEventListener('close', event => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.clearStableConnectionTimer();
        this.clearStateSyncTimer();
        this.socket = null;
        if (event.code === 4001) {
          this.automaticReconnectAllowed = false;
          this.reconnectButton.hidden = false;
          this.setConnection('別の接続に切り替わりました。必要なら再接続してください。');
          this.renderControls();
          return;
        }
        if (event.code === 4002) {
          this.finishSession('ルームが終了または期限切れになりました。');
          return;
        }
        if (event.code === 4003) {
          this.finishSession('ルームを退出しました。');
          return;
        }
        this.setConnection('接続が切れました。自動再接続を試みています…');
        this.renderControls();
        this.scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        if (this.isCurrentSocket(socket, generation)) this.setConnection('接続に問題があります。再接続を試みています…');
      });
    } catch (error) {
      if (generation !== this.connectGeneration) return;
      if (error instanceof RoomApiError && (error.code === 'unauthorized' || error.code === 'room_closed' || error.code === 'room_expired')) {
        this.finishSession(error.message);
        return;
      }
      this.setConnection(error instanceof Error ? error.message : '再接続できませんでした。');
      const retryAfter = error instanceof RoomApiError ? error.retryAfterMs : undefined;
      this.scheduleReconnect(retryAfter);
    }
  }

  private isCurrentSocket(socket: WebSocket, generation: number): boolean {
    return this.socket === socket && this.connectGeneration === generation;
  }

  private receiveMessage(socket: WebSocket, generation: number, serialized: string): void {
    let message: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(serialized);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      message = value as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.type === 'room-state' || message.type === 'room_state') {
      const roomState = this.normalizeState(message);
      if (!roomState || roomState.roomCode !== this.session?.roomCode) return;
      this.clearStateSyncTimer();
      this.setConnection('接続中');
      this.renderState(roomState);
      if (this.pendingAction) this.sendPendingAction(socket, generation);
      if (roomState.status === 'closed') this.finishSession('ルームが終了しました。');
      return;
    }
    if (message.type === 'action-result') {
      this.receiveActionResult(message as unknown as SocketActionResult);
      return;
    }
    if (message.type === 'room-closed') {
      this.finishSession('ルームが終了しました。');
      return;
    }
    if (message.type === 'error') this.receiveSocketError(message as unknown as SocketError);
  }

  private normalizeState(message: Record<string, unknown>): RoomState | null {
    if (typeof message.roomCode !== 'string' ||
        (message.status !== 'waiting' && message.status !== 'finalized' && message.status !== 'closed') ||
        !Number.isSafeInteger(message.revision) || !Number.isSafeInteger(message.createdAt) ||
        !Number.isSafeInteger(message.expiresAt) || !Array.isArray(message.seats) || message.seats.length !== 4) return null;
    const seats: RoomSeat[] = [];
    for (const value of message.seats) {
      if (!value || typeof value !== 'object') return null;
      const seat = value as Record<string, unknown>;
      if (!Number.isInteger(seat.seat) || (seat.seat as number) < 0 || (seat.seat as number) > 3 ||
          !['human', 'cpu', 'empty'].includes(String(seat.kind)) ||
          (seat.name !== null && typeof seat.name !== 'string') || typeof seat.connected !== 'boolean' ||
          typeof seat.ready !== 'boolean' || typeof seat.isHost !== 'boolean') return null;
      seats.push(seat as unknown as RoomSeat);
    }
    if (new Set(seats.map(seat => seat.seat)).size !== 4 ||
        ![0, 1, 2, 3].every(seat => seats.some(value => value.seat === seat)) ||
        (message.hostSeat !== null && (!Number.isInteger(message.hostSeat) || (message.hostSeat as number) < 0 || (message.hostSeat as number) > 3)) ||
        !Number.isFinite(message.createdAt) || !Number.isFinite(message.expiresAt)) return null;
    return message as unknown as RoomState;
  }

  private renderState(state: RoomState): void {
    if (this.state && state.revision < this.state.revision) return;
    this.state = state;
    const bySeat = new Map(state.seats.map(seat => [seat.seat, seat]));
    const self = bySeat.get(this.session?.playerSeat ?? -1);
    this.seats.replaceChildren();
    for (const seatNumber of [0, 1, 2, 3]) {
      const participant = bySeat.get(seatNumber)!;
      const item = document.createElement('li');
      item.dataset.kind = participant.kind;
      const label = document.createElement('span');
      const detail = document.createElement('span');
      const markers = [
        participant.kind === 'human' ? '人間' : participant.kind === 'cpu' ? 'CPU' : '空席',
        participant.kind === 'human' ? (participant.connected ? '接続中' : '切断中') : '',
        participant.kind === 'human' ? (participant.ready ? '準備完了' : '未準備') : '',
        participant.isHost ? 'ホスト' : '',
        seatNumber === this.session?.playerSeat && participant.kind === 'human' ? '自分' : '',
      ].filter(Boolean);
      label.textContent = `${SEAT_NAMES[seatNumber]}：${participant.name ?? '参加者なし'}`;
      detail.textContent = markers.join(' · ');
      item.append(label, detail);
      this.seats.append(item);
    }
    this.codeOutput.textContent = state.roomCode;
    this.expiryOutput.textContent = new Date(state.expiresAt).toLocaleString();
    this.selfOutput.textContent = self?.kind === 'human'
      ? `自分の席：${SEAT_NAMES[self.seat]}（${self.name ?? this.session?.displayName ?? '参加者'}）`
      : '自分の席：確認できません';
    const host = state.hostSeat === null ? undefined : bySeat.get(state.hostSeat);
    this.hostOutput.textContent = host?.kind === 'human'
      ? `ホスト：${host.name ?? '参加者'}${host.seat === this.session?.playerSeat ? '（あなた）' : ''}`
      : 'ホスト：なし';
    this.finalizedMessage.hidden = state.status !== 'finalized';
    if (state.status === 'finalized') {
      this.setStatus('対局準備完了。オンライン対局の開始機能は今後のステップで対応します。');
    }
    this.roomPanel.hidden = false;
    this.renderControls();
  }

  private renderControls(): void {
    const session = this.session;
    const state = this.state;
    const self = state?.seats.find(seat => seat.seat === session?.playerSeat && seat.kind === 'human');
    const humans = state?.seats.filter(seat => seat.kind === 'human') ?? [];
    const allReady = humans.length > 0 && humans.every(seat => seat.connected && seat.ready);
    const pending = this.pendingAction !== null;
    const socketConnected = this.isSocketOpen();
    this.readyButton.hidden = !self || state?.status !== 'waiting';
    this.readyButton.textContent = self?.ready ? '準備を解除' : '準備完了';
    this.readyButton.disabled = pending || !self?.connected || !socketConnected;
    this.finalizeButton.hidden = !self?.isHost || state?.status !== 'waiting';
    this.finalizeButton.disabled = pending || !socketConnected || !allReady;
    this.leaveButton.hidden = !session || state?.status === 'closed';
    this.leaveButton.disabled = pending || !socketConnected;
    this.closeRoomButton.hidden = !self?.isHost || state?.status === 'closed';
    this.closeRoomButton.disabled = pending || !socketConnected;
    if (this.socket?.readyState === WebSocket.OPEN) this.reconnectButton.hidden = true;
  }

  private toggleReady(): void {
    const self = this.state?.seats.find(seat => seat.seat === this.session?.playerSeat && seat.kind === 'human');
    if (!self) return;
    this.sendAction({ type: 'set-ready', ready: !self.ready });
  }

  private sendAction(payload: RoomActionPayload): void {
    if (!this.session || !this.state || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.setError('接続がありません。再接続してから操作してください。');
      return;
    }
    if (this.pendingAction) return;
    this.setError();
    this.pendingAction = {
      requestId: crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      expectedRevision: this.state.revision,
      payload,
      sentGeneration: null,
    };
    this.renderControls();
    this.sendPendingAction(this.socket, this.connectGeneration);
  }

  private sendPendingAction(socket: WebSocket, generation: number): void {
    const pending = this.pendingAction;
    if (!pending || pending.sentGeneration === generation || socket.readyState !== WebSocket.OPEN) return;
    pending.sentGeneration = generation;
    socket.send(JSON.stringify({ ...pending.payload, requestId: pending.requestId, expectedRevision: pending.expectedRevision }));
    this.armPendingActionTimer();
  }

  private armPendingActionTimer(): void {
    this.clearPendingActionTimer();
    this.pendingActionTimer = window.setTimeout(() => {
      this.pendingActionTimer = null;
      if (!this.pendingAction) return;
      this.setError('サーバーの応答を待っています。再接続すると同じ操作IDで状態を確認します。');
      this.socket?.send(JSON.stringify({ type: 'request-state' }));
    }, 15_000);
  }

  private receiveActionResult(result: SocketActionResult): void {
    if (!this.pendingAction || result.requestId !== this.pendingAction.requestId || typeof result.ok !== 'boolean') return;
    const completed = this.pendingAction;
    this.pendingAction = null;
    this.clearPendingActionTimer();
    this.renderControls();
    if (!result.ok) {
      const message = socketErrorMessages[result.code ?? ''] ?? '操作を適用できませんでした。';
      this.setError(message);
      if (result.code === 'revision_conflict') this.socket?.send(JSON.stringify({ type: 'request-state' }));
      return;
    }
    this.setError();
    if (completed.payload.type === 'leave-room') {
      this.finishSession('ルームを退出しました。');
    } else if (completed.payload.type === 'close-room') {
      this.finishSession('ルームを終了しました。');
    }
  }

  private receiveSocketError(error: SocketError): void {
    const code = error.code ?? 'invalid_message';
    if ((error.requestId && this.pendingAction?.requestId === error.requestId) ||
        (code === 'rate_limited' && this.pendingAction !== null)) {
      this.pendingAction = null;
      this.clearPendingActionTimer();
      this.renderControls();
    }
    this.setError(socketErrorMessages[code] ?? 'サーバーが操作を受け付けませんでした。');
    if (code === 'unauthorized' || code === 'room_closed') {
      this.finishSession(socketErrorMessages[code]);
    }
  }

  private async copyRoomCode(): Promise<void> {
    if (!this.session) return;
    try {
      await navigator.clipboard.writeText(this.session.roomCode);
      this.setStatus('ルームコードをコピーしました。');
    } catch {
      this.setError('コピーできませんでした。ルームコードを選択してコピーしてください。');
    }
  }

  private leaveRoom(): void {
    if (!this.session || !window.confirm('このルームから退出しますか？退出するとこの参加トークンは使えなくなります。')) return;
    this.sendAction({ type: 'leave-room' });
  }

  private closeRoom(): void {
    if (!this.session || !window.confirm('ルームを終了しますか？参加者全員が待機ルームから切断されます。')) return;
    this.sendAction({ type: 'close-room' });
  }

  private finishSession(message: string): void {
    this.stopAutomaticConnection();
    this.session = null;
    this.state = null;
    this.pendingAction = null;
    this.clearPendingActionTimer();
    sessionStorage.removeItem(SESSION_KEY);
    this.forms.hidden = false;
    this.roomPanel.hidden = true;
    this.setError();
    this.setStatus(message);
    this.renderControls();
  }

  private closeDialog(): void {
    this.dialogWasClosedByUser = true;
    this.stopAutomaticConnection();
    this.dialog.close();
  }

  private stopAutomaticConnection(): void {
    this.automaticReconnectAllowed = false;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();
    this.clearStateSyncTimer();
    this.clearPendingActionTimer();
    this.connectGeneration++;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Waiting dialog closed');
    this.reconnectButton.hidden = true;
    this.setConnection('待機画面を閉じました。席は保持されます。');
  }

  private closeSocket(invalidate = true): void {
    if (invalidate) this.connectGeneration++;
    this.clearStableConnectionTimer();
    this.clearStateSyncTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Connection replaced');
  }

  private isSocketOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(retryAfterMs?: number): void {
    if (!this.automaticReconnectAllowed || !this.session || this.reconnectTimer !== null) return;
    if (this.session.expiresAt <= Date.now()) {
      this.finishSession('ルームの有効期限が切れました。新しいルームを作成してください。');
      return;
    }
    this.reconnectButton.hidden = false;
    this.renderControls();
    if (document.visibilityState === 'hidden' || !navigator.onLine) return;
    const base = retryAfterMs !== undefined
      ? Math.min(30_000, Math.max(1_000, retryAfterMs))
      : Math.min(30_000, 1_000 * (2 ** this.reconnectAttempt++));
    const delay = retryAfterMs !== undefined ? base : Math.round(base * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private resumeConnection(): void {
    if (document.visibilityState === 'hidden' || !this.session || !this.automaticReconnectAllowed || this.connectionPromise) return;
    if (this.isSocketOpen()) {
      if (this.stateSyncTimer !== null) return;
      const socket = this.socket!;
      const generation = this.connectGeneration;
      try {
        this.setConnection('復帰後のルーム状態を確認しています…');
        socket.send(JSON.stringify({ type: 'request-state' }));
      } catch {
        this.closeSocket();
        this.renderControls();
        this.scheduleReconnect();
        return;
      }
      this.stateSyncTimer = window.setTimeout(() => {
        this.stateSyncTimer = null;
        if (!this.isCurrentSocket(socket, generation)) return;
        this.setConnection('接続状態を確認できません。再接続します…');
        this.closeSocket();
        this.renderControls();
        this.scheduleReconnect();
      }, 8_000);
      return;
    }
    this.clearReconnectTimer();
    void this.connect();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearStableConnectionTimer(): void {
    if (this.stableConnectionTimer !== null) window.clearTimeout(this.stableConnectionTimer);
    this.stableConnectionTimer = null;
  }

  private clearStateSyncTimer(): void {
    if (this.stateSyncTimer !== null) window.clearTimeout(this.stateSyncTimer);
    this.stateSyncTimer = null;
  }

  private clearPendingActionTimer(): void {
    if (this.pendingActionTimer !== null) window.clearTimeout(this.pendingActionTimer);
    this.pendingActionTimer = null;
  }
}
