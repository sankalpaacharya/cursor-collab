import pino from 'pino';
import { config } from './config.ts';

/**
 * Structured logger. In development we pretty-print; in production we emit
 * newline-delimited JSON suitable for log aggregators.
 */
const transport =
  config.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined;

export const logger = pino({
  level: config.logLevel,
  base: { serverId: config.serverId },
  transport,
});
