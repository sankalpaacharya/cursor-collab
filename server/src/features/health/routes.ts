import { Router } from 'express';
import { config } from '../../shared/config.ts';

export interface Stats {
  localConnections?: number;
  activeRooms?: number;
}

/**
 * Health & readiness endpoints for load balancers and orchestrators.
 * `getStats` is injected so the route can report live connection counts.
 */
export function healthRouter(getStats: () => Promise<Stats>): Router {
  const router = Router();

  // Liveness: is the process up? Cheap and dependency-free.
  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', serverId: config.serverId, uptime: process.uptime() });
  });

  // Readiness/metrics: include live stats so a balancer can make decisions and
  // operators can eyeball load per replica.
  router.get('/stats', async (_req, res) => {
    res.json({ serverId: config.serverId, ...(await getStats()) });
  });

  return router;
}
