import { setDefaultResultOrder } from 'node:dns';
import { bootstrap } from './app/bootstrap.js';
import { config, logger } from '@rabst24/config';

setDefaultResultOrder('ipv4first');

bootstrap().catch((error) => {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  ) {
    logger.fatal(
      { err: error, port: config.port },
      'API bootstrap failed: port is already in use'
    );
  } else {
    logger.fatal({ err: error }, 'API bootstrap failed');
  }

  process.exit(1);
});
