import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { config } from '../../shared/config.ts';

export interface Stats {
  localConnections?: number;
  activeRooms?: number;
}

interface HealthOptions {
  getStats: () => Promise<Stats>;
}

/**
 * Health & readiness endpoints for load balancers and orchestrators, registered
 * as a Fastify plugin. `getStats` is injected so the route can report live
 * connection counts.
 */
export const healthRoutes: FastifyPluginAsync<HealthOptions> = async (
  app: FastifyInstance,
  opts: HealthOptions,
) => {
  // Liveness: is the process up? Cheap and dependency-free.
  app.get('/healthz', async () => ({
    status: 'ok',
    serverId: config.serverId,
    uptime: process.uptime(),
  }));

  // Readiness/metrics: include live stats so a balancer can make decisions and
  // operators can eyeball load per replica.
  app.get('/stats', async () => ({
    serverId: config.serverId,
    ...(await opts.getStats()),
  }));
};
