import { createClient, type RedisClientType } from 'redis';
import { config } from './config.ts';
import { logger } from './logger.ts';

export function createRedisClient(label: string): RedisClientType {
  const client: RedisClientType = createClient({
    url: config.redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on('error', (err) => logger.error({ err: err.message, label }, 'redis error'));
  client.on('reconnecting', () => logger.warn({ label }, 'redis reconnecting'));
  client.on('ready', () => logger.info({ label }, 'redis ready'));

  return client;
}

export async function isRedisReachable(): Promise<boolean> {
  const client = createClient({
    url: config.redisUrl,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.quit();
    } catch {
    }
  }
}
