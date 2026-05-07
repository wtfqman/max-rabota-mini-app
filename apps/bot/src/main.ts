import { bootstrap } from './app/bootstrap.js';
import { logger } from '@rabst24/config';

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Bot bootstrap failed');
  process.exit(1);
});
