import { setDefaultResultOrder } from 'node:dns';
import { bootstrap } from './app/bootstrap.js';

setDefaultResultOrder('ipv4first');

void bootstrap();
