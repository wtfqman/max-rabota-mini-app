import pino from 'pino';
import { config } from './env.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'authorization',
      '*.token',
      '*.secret',
      '*.botToken',
      '*.fileUrl',
      'telegramToken',
      'telegramFileUrl'
    ],
    censor: '[redacted]'
  },
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined
});
