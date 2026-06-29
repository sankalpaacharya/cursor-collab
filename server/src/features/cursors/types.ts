/**
 * Domain + wire-protocol types for the cursors feature.
 *
 * The `ClientToServerEvents` / `ServerToClientEvents` interfaces are used to
 * strongly type the Socket.IO server, so payloads and acks are checked at
 * compile time on both the emit and handler sides.
 */

/** A participant and the current state of their cursor within a room. */
export interface CursorUser {
  id: string;
  name: string;
  color: string;
  /** Normalised coordinates in the range 0..1 (fraction of the workspace). */
  x: number;
  y: number;
  /** Replica that currently owns this user's connection. */
  serverId: string;
  /** Epoch ms of the last heartbeat/move; used for stale-presence sweeping. */
  lastSeen: number;
}

export interface JoinPayload {
  roomId: string;
  userId: string;
  name?: string;
}

export interface MovePayload {
  x: number;
  y: number;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  self?: CursorUser;
  peers?: CursorUser[];
}

export interface ClientToServerEvents {
  'cursor:join': (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  'cursor:move': (payload: MovePayload) => void;
  'cursor:leave': () => void;
}

export interface ServerToClientEvents {
  'cursor:init': (data: { self: CursorUser; peers: CursorUser[] }) => void;
  'cursor:joined': (data: { user: CursorUser }) => void;
  'cursor:moved': (data: { id: string; x: number; y: number }) => void;
  'cursor:left': (data: { id: string }) => void;
}

/** Per-socket state kept in memory on the owning replica. */
export interface SocketData {
  user: CursorUser | null;
  roomId: string | null;
}
