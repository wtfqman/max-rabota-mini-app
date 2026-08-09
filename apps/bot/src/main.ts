import { setDefaultResultOrder } from 'node:dns';
import { bootstrap } from './app/bootstrap.js';
import { logger } from '@rabst24/config';

setDefaultResultOrder('ipv4first');

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Bot bootstrap failed');
  process.exit(1);
});
