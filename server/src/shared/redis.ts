import { createClient, type RedisClientType } from 'redis';
import { config } from './config.ts';
import { logger } from './logger.ts';

/**
 * Factory for a node-redis client wired up with logging. We create separate
 * clients for distinct concerns (adapter pub, adapter sub, presence commands)
 * because a client running in subscribe mode cannot issue normal commands.
 */
export function createRedisClient(label: string): RedisClientType {
  const client: RedisClientType = createClient({
    url: config.redisUrl,
    socket: {
      // Cap the back-off so a flapping Redis doesn't grow an unbounded delay.
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on('error', (err) => logger.error({ err: err.message, label }, 'redis error'));
  client.on('reconnecting', () => logger.warn({ label }, 'redis reconnecting'));
  client.on('ready', () => logger.info({ label }, 'redis ready'));

  return client;
}
