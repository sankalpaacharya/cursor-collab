import type { CursorUser } from '../cursors/types.ts';

/**
 * Storage abstraction for presence (session state).
 *
 * Implemented by both the Redis-backed store (multi-replica) and the in-memory
 * store (single replica / tests), so the rest of the app never branches on the
 * backend in use.
 */
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
