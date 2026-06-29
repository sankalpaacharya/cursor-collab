import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { corsOptions } from '../shared/config.ts';
import { healthRoutes, type Stats } from '../features/health/routes.ts';

/**
 * Builds the Fastify HTTP application. Socket.IO attaches to the same underlying
 * HTTP server (`app.server`, see index.ts); Fastify here serves health/metrics
 * endpoints and is the natural place to add REST APIs later.
 */
export async function createApp(getStats: () => Promise<Stats>): Promise<FastifyInstance> {
  // We log via our own pino instance elsewhere; disable Fastify's request log.
  const app = Fastify({ logger: false });

  await app.register(cors, corsOptions);
  await app.register(healthRoutes, { getStats });

  app.get('/', async () => ({
    service: 'cursor-server',
    message: 'Real-time cursor tracking backend',
  }));

  return app;
}
