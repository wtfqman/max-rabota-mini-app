const DEFAULT_API_BASE_URL = '/api';
const appUrl = normalizeBaseUrl(import.meta.env.VITE_APP_URL ?? window.location.origin, window.location.origin);

export const appEnv = {
  appUrl,
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL),
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

function normalizeApiBaseUrl(value: string | undefined, fallback: string): string {
  const normalized = normalizeBaseUrl(value ?? fallback, fallback);

  if (normalized === '/') {
    return fallback;
  }

  if (/^https?:\/\//i.test(normalized)) {
    const url = new URL(normalized);
    return url.pathname === '/' ? `${url.origin}${fallback}` : normalized;
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
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
