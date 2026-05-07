import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const devApiProxyTarget = env.VITE_DEV_API_PROXY_TARGET;

  return {
    plugins: [react()],
    root: webRoot,
    envDir: repoRoot,
    base: normalizeBasePath(env.VITE_APP_BASE_PATH),
    build: {
      outDir: path.resolve(repoRoot, 'dist/apps/web'),
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: devApiProxyTarget
        ? {
            '/api': {
              target: devApiProxyTarget,
              changeOrigin: true
            },
            '/uploads': {
              target: devApiProxyTarget,
              changeOrigin: true
            },
            '/health': {
              target: devApiProxyTarget,
              changeOrigin: true
            }
          }
        : undefined
    }
  };
});

function normalizeBasePath(value: string | undefined): string {
  const normalized = value?.trim();

  if (!normalized || normalized === './') {
    return '/';
  }

  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}
