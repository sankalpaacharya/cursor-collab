import { logger } from '../../shared/logger.ts';
import type { PresenceStore } from './store.types.ts';
import { MemoryPresenceStore } from './memory-store.ts';
import { RedisPresenceStore } from './redis-store.ts';

export async function createPresenceStore(useRedis: boolean): Promise<PresenceStore> {
  const store: PresenceStore = useRedis ? new RedisPresenceStore() : new MemoryPresenceStore();
  await store.connect();
  logger.info({ backend: useRedis ? 'redis' : 'memory' }, 'presence store ready');
  return store;
}
