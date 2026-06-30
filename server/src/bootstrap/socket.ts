import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { corsOptions } from '../shared/config.ts';
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

async function attachRedisAdapter(io: TypedServer, useRedis: boolean): Promise<() => Promise<void>> {
  if (!useRedis) {
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

export async function createSocketServer(
  httpServer: HttpServer,
  store: PresenceStore,
  useRedis: boolean,
): Promise<SocketServer> {
  const io: TypedServer = new Server(httpServer, {
    cors: corsOptions,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    transports: ['websocket'],
  });

  const closeAdapter = await attachRedisAdapter(io, useRedis);
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
