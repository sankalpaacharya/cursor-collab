import express, { type Express } from 'express';
import cors from 'cors';
import { corsOptions } from './shared/config.ts';
import { healthRouter, type Stats } from './features/health/routes.ts';

/**
 * Builds the Express HTTP application. Socket.IO attaches to the same underlying
 * HTTP server (see index.ts); Express here serves health/metrics endpoints and
 * is the natural place to add REST APIs later.
 */
export function createApp(getStats: () => Promise<Stats>): Express {
  const app = express();
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(healthRouter(getStats));

  app.get('/', (_req, res) => {
    res.json({ service: 'cursor-server', message: 'Real-time cursor tracking backend' });
  });

  return app;
}
