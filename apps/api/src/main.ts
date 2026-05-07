import { bootstrap } from './app/bootstrap.js';
import { config, logger } from '@rabst24/config';

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
