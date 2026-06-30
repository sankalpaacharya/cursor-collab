import pino from 'pino';
import { config } from './config.ts';

const transport =
  config.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined;

export const logger = pino({
  level: config.logLevel,
  base: { serverId: config.serverId },
  transport,
});
