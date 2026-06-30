import 'dotenv/config';
import { hostname } from 'node:os';
import { nanoid } from 'nanoid';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3001),
  host: process.env.HOST ?? '0.0.0.0',

  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  redisEnabled: (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false',

  serverId: process.env.SERVER_ID ?? `${hostname()}-${nanoid(6)}`,

  // Presence / heartbeat tuning.
  // Each server refreshes "lastSeen" for its connected sockets on this interval.
  heartbeatIntervalMs: toInt(process.env.HEARTBEAT_INTERVAL_MS, 10_000),
  // A presence entry is considered stale (owner likely crashed) after this long
  // without a refresh, and is swept out + a "left" event is broadcast.
  presenceTtlMs: toInt(process.env.PRESENCE_TTL_MS, 30_000),
  // How often each server runs the stale-presence sweep.
  sweepIntervalMs: toInt(process.env.SWEEP_INTERVAL_MS, 15_000),

  logLevel: process.env.LOG_LEVEL ?? 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

export const corsOptions = {
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()),
  methods: ['GET', 'POST'],
};
