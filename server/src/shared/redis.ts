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
      // Bound the initial connect so an unreachable host fails fast rather than
      // hanging server startup.
      connectTimeout: 5000,
      // Cap the back-off so a flapping Redis doesn't grow an unbounded delay.
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on('error', (err) => logger.error({ err: err.message, label }, 'redis error'));
  client.on('reconnecting', () => logger.warn({ label }, 'redis reconnecting'));
  client.on('ready', () => logger.info({ label }, 'redis ready'));

  return client;
}

/**
 * One-shot reachability probe used at startup to decide whether to run with
 * Redis (multi-replica) or fall back to in-memory mode. Uses a short timeout and
 * NO reconnection so it resolves quickly whether or not Redis is up.
 */
export async function isRedisReachable(): Promise<boolean> {
  const client = createClient({
    url: config.redisUrl,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  // Swallow connection errors here; the boolean return is the signal.
  client.on('error', () => {});
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    // If connect failed there's nothing open; if it succeeded, close it. Either
    // way, swallow errors — this is only a probe.
    try {
      await client.quit();
    } catch {
      /* already closed */
    }
  }
}
