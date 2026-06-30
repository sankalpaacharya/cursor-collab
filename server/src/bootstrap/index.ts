import { config } from '../shared/config.ts';
import { logger } from '../shared/logger.ts';
import { isRedisReachable } from '../shared/redis.ts';
import { createApp } from './app.ts';
import { createPresenceStore } from '../features/presence/index.ts';
import { createSocketServer, type SocketServer } from './socket.ts';
import type { Stats } from '../features/health/routes.ts';

/**
 * Decide the presence/fan-out backend. With REDIS_ENABLED=true (the default) we
 * REQUIRE Redis: if it is unreachable we fail fast with a clear error rather than
 * silently degrading to a single in-memory replica. REDIS_ENABLED=false is the
 * explicit opt-in to single-replica in-memory mode (used by the test suite).
 */
async function resolveRedisMode(): Promise<boolean> {
  if (!config.redisEnabled) return false;

  if (await isRedisReachable()) return true;

  throw new Error(
    `Redis is unreachable at ${config.redisUrl}. Start Redis and retry ` +
      `(./start brings one up automatically), or set REDIS_ENABLED=false to run a ` +
      `single in-memory replica.`,
  );
}

/**
 * Composition root: wires the presence store, Fastify app, HTTP server and
 * Socket.IO server together, then starts listening. Handles graceful shutdown
 * so that rolling deploys / autoscaling don't strand clients or leak presence.
 */
async function main(): Promise<void> {
  const useRedis = await resolveRedisMode();
  const store = await createPresenceStore(useRedis);

  // `getStats` is shared by the HTTP /stats route. Defined before the socket
  // server exists, so it closes over `socketServer` lazily.
  let socketServer: SocketServer | undefined;
  const getStats = async (): Promise<Stats> => {
    const sockets = socketServer ? await socketServer.io.local.fetchSockets() : [];
    const rooms = await store.listRooms();
    return { localConnections: sockets.length, activeRooms: rooms.length };
  };

  const app = await createApp(getStats);
  // Fastify creates the underlying http.Server eagerly, so Socket.IO can attach
  // to `app.server` before we start listening.
  socketServer = await createSocketServer(app.server, store, useRedis);
  await app.listen({ port: config.port, host: config.host });

  logger.info(
    { port: config.port, host: config.host, serverId: config.serverId, env: config.nodeEnv },
    'cursor-server listening',
  );

  // ---- Graceful shutdown -------------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Close sockets (clients auto-reconnect to another replica), then the HTTP
    // server, then release Redis. Presence left behind is reaped by the
    // surviving replicas' sweep loop within presenceTtlMs.
    const timer = setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    timer.unref();

    try {
      await socketServer?.close();
      await app.close();
      await store.disconnect();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((err: unknown) => {
  logger.fatal({ err: (err as Error).message, stack: (err as Error).stack }, 'failed to start');
  process.exit(1);
});
