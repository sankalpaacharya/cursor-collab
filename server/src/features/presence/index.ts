import { config } from '../../shared/config.ts';
import { logger } from '../../shared/logger.ts';
import type { PresenceStore } from './store.types.ts';
import { MemoryPresenceStore } from './memory-store.ts';
import { RedisPresenceStore } from './redis-store.ts';

/**
 * Selects the presence backend based on configuration and returns a connected
 * store. Both implementations share an identical async interface, so callers
 * never branch on which one is active.
 */
export async function createPresenceStore(): Promise<PresenceStore> {
  const store: PresenceStore = config.redisEnabled
    ? new RedisPresenceStore()
    : new MemoryPresenceStore();
  await store.connect();
  logger.info({ backend: config.redisEnabled ? 'redis' : 'memory' }, 'presence store ready');
  return store;
}
