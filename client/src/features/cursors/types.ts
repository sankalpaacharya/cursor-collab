export interface CursorUser {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  serverId: string;
  lastSeen: number;
}

export interface JoinPayload {
  roomId: string;
  userId: string;
  name?: string;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  self?: CursorUser;
  peers?: CursorUser[];
}

export interface ServerToClientEvents {
  'cursor:init': (data: { self: CursorUser; peers: CursorUser[] }) => void;
  'cursor:joined': (data: { user: CursorUser }) => void;
  'cursor:moved': (data: { id: string; x: number; y: number }) => void;
  'cursor:left': (data: { id: string }) => void;
}

export interface ClientToServerEvents {
  'cursor:join': (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  'cursor:move': (payload: { x: number; y: number }) => void;
  'cursor:leave': () => void;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';
