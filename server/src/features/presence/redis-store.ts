import type { RedisClientType } from 'redis';
import type { CursorUser } from '../cursors/types.ts';
import type { PresenceStore } from './store.types.ts';
import { createRedisClient } from '../../shared/redis.ts';

const ROOMS_KEY = 'cursor:rooms';
const roomKey = (roomId: string): string => `cursor:room:${roomId}`;

export class RedisPresenceStore implements PresenceStore {
  private client: RedisClientType;

  constructor() {
    this.client = createRedisClient('presence');
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  async upsertUser(roomId: string, user: CursorUser): Promise<void> {
    await this.client
      .multi()
      .sAdd(ROOMS_KEY, roomId)
      .hSet(roomKey(roomId), user.id, JSON.stringify(user))
      .exec();
  }

  async removeUser(roomId: string, userId: string): Promise<boolean> {
    const removed = await this.client.hDel(roomKey(roomId), userId);
    // If the room is now empty, drop it from the active-rooms set.
    const remaining = await this.client.hLen(roomKey(roomId));
    if (remaining === 0) await this.client.sRem(ROOMS_KEY, roomId);
    return removed > 0;
  }

  async getRoom(roomId: string): Promise<CursorUser[]> {
    const map = await this.client.hGetAll(roomKey(roomId));
    return Object.values(map).map((raw) => JSON.parse(raw) as CursorUser);
  }

  async getUser(roomId: string, userId: string): Promise<CursorUser | null> {
    const raw = await this.client.hGet(roomKey(roomId), userId);
    return raw ? (JSON.parse(raw) as CursorUser) : null;
  }

  async listRooms(): Promise<string[]> {
    return this.client.sMembers(ROOMS_KEY);
  }

  async sweepStale(
    ttlMs: number,
    now: number,
  ): Promise<Array<{ roomId: string; userId: string }>> {
    const removed: Array<{ roomId: string; userId: string }> = [];
    const rooms = await this.listRooms();
    for (const roomId of rooms) {
      const map = await this.client.hGetAll(roomKey(roomId));
      for (const [userId, raw] of Object.entries(map)) {
        const user = JSON.parse(raw) as CursorUser;
        if (now - user.lastSeen > ttlMs) {
          // hDel returns the count actually removed, so concurrent sweeps from
          // multiple replicas won't double-report the same removal.
          const didRemove = await this.client.hDel(roomKey(roomId), userId);
          if (didRemove > 0) removed.push({ roomId, userId });
        }
      }
      if ((await this.client.hLen(roomKey(roomId))) === 0) {
        await this.client.sRem(ROOMS_KEY, roomId);
      }
    }
    return removed;
  }
}
