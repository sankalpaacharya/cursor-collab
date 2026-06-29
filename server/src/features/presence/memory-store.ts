import type { CursorUser } from '../cursors/types.ts';
import type { PresenceStore } from './store.types.ts';

/**
 * In-memory presence store.
 *
 * Used when Redis is disabled (single replica, local dev, unit tests). It
 * implements the exact same async interface as the Redis store so the rest of
 * the application is agnostic to which backend is in use.
 *
 * State shape: rooms -> Map<roomId, Map<userId, user>>
 */
export class MemoryPresenceStore implements PresenceStore {
  private rooms = new Map<string, Map<string, CursorUser>>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  private room(roomId: string): Map<string, CursorUser> {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    return room;
  }

  async upsertUser(roomId: string, user: CursorUser): Promise<void> {
    this.room(roomId).set(user.id, { ...user });
  }

  async removeUser(roomId: string, userId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const existed = room.delete(userId);
    if (room.size === 0) this.rooms.delete(roomId);
    return existed;
  }

  async getRoom(roomId: string): Promise<CursorUser[]> {
    return [...(this.rooms.get(roomId)?.values() ?? [])];
  }

  async getUser(roomId: string, userId: string): Promise<CursorUser | null> {
    return this.rooms.get(roomId)?.get(userId) ?? null;
  }

  async listRooms(): Promise<string[]> {
    return [...this.rooms.keys()];
  }

  /** Remove entries not seen since `now - ttlMs`. Returns removed pairs. */
  async sweepStale(
    ttlMs: number,
    now: number,
  ): Promise<Array<{ roomId: string; userId: string }>> {
    const removed: Array<{ roomId: string; userId: string }> = [];
    for (const [roomId, room] of this.rooms) {
      for (const [userId, user] of room) {
        if (now - user.lastSeen > ttlMs) {
          room.delete(userId);
          removed.push({ roomId, userId });
        }
      }
      if (room.size === 0) this.rooms.delete(roomId);
    }
    return removed;
  }
}
