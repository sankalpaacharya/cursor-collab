import { logger } from '../../shared/logger.ts';
import type { PresenceStore } from './store.types.ts';
import { MemoryPresenceStore } from './memory-store.ts';
import { RedisPresenceStore } from './redis-store.ts';

/**
 * Selects the presence backend and returns a connected store. Both
 * implementations share an identical async interface, so callers never branch
 * on which one is active. `useRedis` is decided once at startup (see bootstrap)
 * after probing Redis reachability.
 */
export async function createPresenceStore(useRedis: boolean): Promise<PresenceStore> {
  const store: PresenceStore = useRedis ? new RedisPresenceStore() : new MemoryPresenceStore();
  await store.connect();
  logger.info({ backend: useRedis ? 'redis' : 'memory' }, 'presence store ready');
  return store;
}
