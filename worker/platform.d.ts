interface SqlCursor<Row> {
  toArray(): Row[];
}

interface SqlStorage {
  exec<Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): SqlCursor<Row>;
}

interface DurableObjectStorage {
  sql: SqlStorage;
  setAlarm(timestamp: number): Promise<void>;
  deleteAll(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

interface Env {
  ROOMS: DurableObjectNamespace;
}

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};
