type RoomSeat = { seat: number; name: string; connected: boolean };
type RoomState = {
  roomCode: string;
  createdAt: number;
  expiresAt: number;
  seats: RoomSeat[];
};
type RoomSession = {
  roomCode: string;
  participantToken: string;
  playerSeat: number;
  displayName: string;
  expiresAt: number;
};
type ApiRoomResponse = RoomSession & { seats: RoomSeat[]; createdAt?: number };

const SESSION_KEY = 'heibon-mahjong-online-session';
const WS_PROTOCOL = 'heibon-mahjong.v1';
const roomErrorMessages: Record<string, string> = {
  invalid_display_name: '表示名を1〜24文字で入力してください。',
  room_not_found: 'そのルームコードは見つかりません。',
  room_expired: 'ルームの有効期限が切れています。',
  room_full: 'このルームは満席です。',
  unauthorized: '認証に失敗しました。再接続してください。',
};

export class OnlineWaitingRoom {
  private readonly dialog = document.querySelector<HTMLDialogElement>('#online-dialog')!;
  private readonly status = document.querySelector<HTMLElement>('#online-status')!;
  private readonly seats = document.querySelector<HTMLOListElement>('#online-seats')!;
  private readonly codeOutput = document.querySelector<HTMLElement>('#online-room-code')!;
  private readonly expiryOutput = document.querySelector<HTMLElement>('#online-room-expiry')!;
  private readonly forms = document.querySelector<HTMLElement>('#online-room-forms')!;
  private readonly roomPanel = document.querySelector<HTMLElement>('#online-room')!;
  private readonly reconnectButton = document.querySelector<HTMLButtonElement>('#online-reconnect')!;
  private readonly apiUrl: string;
  private session: RoomSession | null = null;
  private socket: WebSocket | null = null;
  private connectGeneration = 0;

  constructor(apiUrl: string | undefined) {
    this.apiUrl = (apiUrl ?? '').replace(/\/+$/u, '');
    document.querySelector<HTMLButtonElement>('#online-open')!.addEventListener('click', () => {
      if (!this.dialog.open) this.dialog.showModal();
      if (this.session && !this.socket) void this.connect();
    });
    document.querySelector<HTMLButtonElement>('#online-close')!.addEventListener('click', () => {
      this.closeSocket();
      this.dialog.close();
    });
    document.querySelector<HTMLFormElement>('#online-create')!.addEventListener('submit', event => {
      event.preventDefault();
      void this.createRoom();
    });
    document.querySelector<HTMLFormElement>('#online-join')!.addEventListener('submit', event => {
      event.preventDefault();
      void this.joinRoom();
    });
    this.reconnectButton.addEventListener('click', () => { void this.connect(); });
    this.dialog.addEventListener('cancel', () => this.closeSocket());

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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, { ...init, cache: 'no-store' });
    } catch {
      throw new Error('オンラインサーバーに接続できません。時間をおいて再試行してください。');
    }
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { /* Use a generic failure message. */ }
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : '';
      throw new Error(roomErrorMessages[code] ?? 'オンラインサーバーが要求を処理できませんでした。');
    }
    return body as T;
  }

  private async createRoom(): Promise<void> {
    const name = document.querySelector<HTMLInputElement>('#online-name')!.value.trim();
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    this.forms.hidden = true;
    this.roomPanel.hidden = false;
    this.codeOutput.textContent = result.roomCode;
    this.expiryOutput.textContent = new Date(result.expiresAt).toLocaleString();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private restoreSession(): void {
    try {
      const value = sessionStorage.getItem(SESSION_KEY);
      if (!value) return;
      const session = JSON.parse(value) as RoomSession;
      if (!/^[A-HJ-NP-Z2-9]{6}$/u.test(session.roomCode) ||
          !/^[a-f0-9]{64}$/u.test(session.participantToken) ||
          !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) {
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      this.session = session;
      this.forms.hidden = true;
      this.roomPanel.hidden = false;
      this.codeOutput.textContent = session.roomCode;
      this.expiryOutput.textContent = new Date(session.expiresAt).toLocaleString();
      void this.connect();
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  private async connect(): Promise<void> {
    const session = this.session;
    if (!session || session.expiresAt <= Date.now()) {
      this.session = null;
      sessionStorage.removeItem(SESSION_KEY);
      this.forms.hidden = false;
      this.roomPanel.hidden = true;
      this.setStatus('ルームの有効期限が切れました。新しいルームを作成してください。');
      return;
    }
    const generation = ++this.connectGeneration;
    this.closeSocket(false);
    this.reconnectButton.hidden = true;
    this.setStatus('接続しています…');
    try {
      const response = await this.request<{ ticket: string }>(`/api/rooms/${session.roomCode}/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.participantToken}` },
      });
      if (generation !== this.connectGeneration) return;
      const wsUrl = new URL(`${this.apiUrl}/api/rooms/${session.roomCode}/socket`);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(wsUrl, [WS_PROTOCOL, `ticket.${response.ticket}`]);
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (this.socket === socket) this.setStatus('接続しました。');
      });
      socket.addEventListener('message', event => {
        if (typeof event.data !== 'string') return;
        let state: RoomState & { type?: string };
        try { state = JSON.parse(event.data) as RoomState & { type?: string }; } catch { return; }
        if (state.type !== 'room_state' || state.roomCode !== session.roomCode || !Array.isArray(state.seats)) return;
        this.renderState(state);
      });
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.setStatus('接続が切れました。再接続できます。');
        this.reconnectButton.hidden = false;
      });
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.setStatus('接続に問題があります。再接続をお試しください。');
      });
    } catch (error) {
      if (generation !== this.connectGeneration) return;
      this.setStatus(error instanceof Error ? error.message : '再接続できませんでした。');
      this.reconnectButton.hidden = false;
    }
  }

  private renderState(state: RoomState): void {
    const bySeat = new Map(state.seats.map(seat => [seat.seat, seat]));
    this.seats.replaceChildren();
    for (let seat = 0; seat < 4; seat++) {
      const participant = bySeat.get(seat);
      const item = document.createElement('li');
      const label = document.createElement('span');
      const status = document.createElement('span');
      label.textContent = `席${seat + 1}：${participant?.name ?? '参加者なし'}`;
      status.textContent = participant ? (participant.connected ? '接続中' : '切断中') : '空席';
      item.append(label, status);
      this.seats.append(item);
    }
    this.codeOutput.textContent = state.roomCode;
    this.expiryOutput.textContent = new Date(state.expiresAt).toLocaleString();
    this.roomPanel.hidden = false;
  }

  private closeSocket(invalidate = true): void {
    if (invalidate) this.connectGeneration++;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Dialog closed');
  }
}
