import type { CursorUser } from '../cursors/types.ts';

export interface PresenceStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  upsertUser(roomId: string, user: CursorUser): Promise<void>;
  removeUser(roomId: string, userId: string): Promise<boolean>;
  getRoom(roomId: string): Promise<CursorUser[]>;
  getUser(roomId: string, userId: string): Promise<CursorUser | null>;
  listRooms(): Promise<string[]>;
  sweepStale(ttlMs: number, now: number): Promise<Array<{ roomId: string; userId: string }>>;
}
