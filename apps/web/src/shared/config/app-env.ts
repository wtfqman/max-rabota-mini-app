const DEFAULT_API_BASE_URL = '/api';
const appUrl = normalizeBaseUrl(import.meta.env.VITE_APP_URL ?? window.location.origin, window.location.origin);

export const appEnv = {
  appUrl,
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL, DEFAULT_API_BASE_URL),
  miniAppUrl: appUrl,
  routerBasename: normalizeRouterBasename(import.meta.env.BASE_URL ?? '/'),
  isProduction: import.meta.env.PROD,
  devAuthEnabled: import.meta.env.VITE_DEV_AUTH_ENABLED === 'true'
} as const;

function normalizeBaseUrl(value: string, fallback: string): string {
  const normalized = value.trim() || fallback;

  if (normalized === '/') {
    return normalized;
  }

  return normalized.replace(/\/+$/, '');
}

function normalizeRouterBasename(value: string): string | undefined {
  const normalized = normalizeBasePath(value);
  return normalized === '/' ? undefined : normalized.replace(/\/+$/, '');
}

function normalizeBasePath(value: string): string {
  const normalized = value.trim();

  if (!normalized || normalized === './') {
    return '/';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
