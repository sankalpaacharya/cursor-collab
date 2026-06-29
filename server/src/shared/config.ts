import 'dotenv/config';
import { hostname } from 'node:os';
import { nanoid } from 'nanoid';

/**
 * Centralised, validated configuration.
 *
 * Every tunable is sourced from an environment variable with a sane default so
 * the server boots with zero configuration in development, while remaining fully
 * configurable for containerised / multi-replica deployments.
 */

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  // HTTP / WebSocket listener.
  port: toInt(process.env.PORT, 3001),
  host: process.env.HOST ?? '0.0.0.0',

  // Comma-separated list of allowed CORS origins, or "*" for any.
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // Redis connection used by the Socket.IO adapter (cross-replica fan-out)
  // and by the presence store (shared session state).
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // When false, the server runs fully in-memory (single replica, no Redis).
  // Useful for local development and unit tests.
  redisEnabled: (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false',

  // Stable identity for this replica. Surfaced to clients and used to attribute
  // presence entries to the owning server for crash recovery.
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
