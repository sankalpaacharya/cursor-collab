import http from 'node:http';
import { config } from './shared/config.ts';
import { logger } from './shared/logger.ts';
import { createApp } from './app.ts';
import { createPresenceStore } from './features/presence/index.ts';
import { createSocketServer, type SocketServer } from './socket.ts';
import type { Stats } from './features/health/routes.ts';

/**
 * Composition root: wires the presence store, Express app, HTTP server and
 * Socket.IO server together, then starts listening. Handles graceful shutdown
 * so that rolling deploys / autoscaling don't strand clients or leak presence.
 */
async function main(): Promise<void> {
  const store = await createPresenceStore();

  // `getStats` is shared by the HTTP /stats route. Defined before the socket
  // server exists, so it closes over `socketServer` lazily.
  let socketServer: SocketServer | undefined;
  const getStats = async (): Promise<Stats> => {
    const sockets = socketServer ? await socketServer.io.local.fetchSockets() : [];
    const rooms = await store.listRooms();
    return { localConnections: sockets.length, activeRooms: rooms.length };
  };

  const app = createApp(getStats);
  const httpServer = http.createServer(app);
  socketServer = await createSocketServer(httpServer, store);

  httpServer.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, serverId: config.serverId, env: config.nodeEnv },
      'cursor-server listening',
    );
  });

  // ---- Graceful shutdown -------------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Stop accepting new HTTP connections, close sockets (clients auto-reconnect
    // to another replica), then release Redis. Presence left behind is reaped by
    // the surviving replicas' sweep loop within presenceTtlMs.
    const timer = setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    timer.unref();

    try {
      await socketServer?.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
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
