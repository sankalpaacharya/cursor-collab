import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { corsOptions } from '../shared/config.ts';
import { healthRoutes, type Stats } from '../features/health/routes.ts';

export async function createApp(getStats: () => Promise<Stats>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, corsOptions);
  await app.register(healthRoutes, { getStats });

  app.get('/', async () => ({
    service: 'cursor-server',
    message: 'Real-time cursor tracking backend',
  }));

  return app;
}
