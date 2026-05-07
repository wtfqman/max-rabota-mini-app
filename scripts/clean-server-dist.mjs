/* global process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'dist/apps/api',
  'dist/apps/bot',
  'dist/packages'
];

for (const target of targets) {
  try {
    await fs.rm(path.join(repoRoot, target), {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? ` (${error.code})` : '';
    process.stderr.write(`[clean-server-dist] skipped locked path: ${target}${code}\n`);
  }
}
