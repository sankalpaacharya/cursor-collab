import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { config, corsOptions } from '../shared/config.ts';
import { logger } from '../shared/logger.ts';
import { createRedisClient } from '../shared/redis.ts';
import { registerCursorHandlers } from '../features/cursors/handlers.ts';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../features/cursors/types.ts';
import type { PresenceStore } from '../features/presence/store.types.ts';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketServer {
  io: TypedServer;
  close: () => Promise<void>;
}

/**
 * Attaches the Redis adapter so that `emit`/`broadcast` calls reach clients on
 * *any* replica, not just the local one. This is the mechanism that makes
 * horizontal scaling work: replica A publishes a cursor move to Redis, and
 * replicas B, C, ... deliver it to their own clients. No-op when Redis is off.
 */
async function attachRedisAdapter(io: TypedServer): Promise<() => Promise<void>> {
  if (!config.redisEnabled) {
    logger.warn('redis adapter disabled — running as a single replica');
    return async () => {};
  }

  const pubClient = createRedisClient('adapter-pub');
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('socket.io redis adapter attached');

  return async () => {
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
  };
}

/**
 * Builds the Socket.IO server, attaches the Redis adapter for cross-replica
 * fan-out, and registers the cursor handlers.
 */
export async function createSocketServer(
  httpServer: HttpServer,
  store: PresenceStore,
): Promise<SocketServer> {
  const io: TypedServer = new Server(httpServer, {
    cors: corsOptions,
    // Cursor updates are tiny and frequent; a snappy ping keeps dead-connection
    // detection fast so ghost cursors are removed promptly.
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Prefer websockets but allow polling as a fallback for restrictive networks.
    transports: ['websocket', 'polling'],
  });

  const closeAdapter = await attachRedisAdapter(io);
  const stopLoops = registerCursorHandlers(io, store);

  return {
    io,
    close: async () => {
      stopLoops();
      await io.close();
      await closeAdapter();
    },
  };
}
