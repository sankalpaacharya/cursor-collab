import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { config } from '../../shared/config.ts';

export interface Stats {
  localConnections?: number;
  activeRooms?: number;
}

interface HealthOptions {
  getStats: () => Promise<Stats>;
}

export const healthRoutes: FastifyPluginAsync<HealthOptions> = async (
  app: FastifyInstance,
  opts: HealthOptions,
) => {
  app.get('/healthz', async () => ({
    status: 'ok',
    serverId: config.serverId,
    uptime: process.uptime(),
  }));

  app.get('/stats', async () => ({
    serverId: config.serverId,
    ...(await opts.getStats()),
  }));
};
