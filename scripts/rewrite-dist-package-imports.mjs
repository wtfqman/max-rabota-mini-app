import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const packageEntries = new Map([
  ['@rabst24/bot-core', path.join(distRoot, 'packages/bot-core/src/index.js')],
  ['@rabst24/config', path.join(distRoot, 'packages/config/src/index.js')],
  ['@rabst24/core', path.join(distRoot, 'packages/core/src/index.js')],
  ['@rabst24/db', path.join(distRoot, 'packages/db/src/index.js')],
  ['@rabst24/max-api', path.join(distRoot, 'packages/max-api/src/index.js')],
  ['@rabst24/shared', path.join(distRoot, 'packages/shared/src/index.js')]
]);

const specifierPattern = /(['"])(@rabst24\/(?:bot-core|config|core|db|max-api|shared))\1/g;

for (const filePath of await listJavaScriptFiles(distRoot)) {
  const source = await readFile(filePath, 'utf8');
  const rewritten = source.replace(specifierPattern, (match, quote, packageName) => {
    const targetPath = packageEntries.get(packageName);

    if (!targetPath) {
      return match;
    }

    return `${quote}${toRelativeSpecifier(filePath, targetPath)}${quote}`;
  });

  if (rewritten !== source) {
    await writeFile(filePath, rewritten, 'utf8');
  }
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRelativeSpecifier(fromFilePath, toFilePath) {
  const relativePath = path.relative(path.dirname(fromFilePath), toFilePath).replaceAll(path.sep, '/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}
