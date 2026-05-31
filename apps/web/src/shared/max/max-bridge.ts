import type { AuthPlatform } from '../../features/auth/auth.types.js';

export interface MaxWebAppUser {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface MaxWebApp {
  initData?: string;
  InitData?: string;
  initDataUnsafe?: {
    user?: MaxWebAppUser;
    start_param?: string;
  };
  colorScheme?: 'light' | 'dark';
  platform?: string;
  ready?: () => void;
  expand?: () => void;
}

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

export function getMaxWebApp(): MaxWebApp | null {
  return window.WebApp ?? null;
}

export function getLaunchContext() {
  const webApp = getMaxWebApp();
  const initData = webApp?.initData ?? webApp?.InitData ?? extractInitDataFromLocation();
  const fallbackParams = parseInitDataParams(initData);

  return {
    isInsideMax: Boolean(initData),
    initData,
    platform: normalizePlatform(webApp?.platform),
    user: webApp?.initDataUnsafe?.user ?? parseUserFromInitData(fallbackParams.get('user')),
    startParam: webApp?.initDataUnsafe?.start_param ?? fallbackParams.get('start_param') ?? undefined
  };
}

export function notifyMaxAppReady(): void {
  const webApp = getMaxWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}

function normalizePlatform(platform?: string): AuthPlatform | undefined {
  if (platform === 'ios' || platform === 'android' || platform === 'web' || platform === 'desktop') {
    return platform;
  }

  return undefined;
}

function extractInitDataFromLocation(): string {
  const candidates = [window.location.search, window.location.hash]
    .flatMap((value) => getLocationCandidates(value))
    .map((value) => normalizeInitData(value))
    .filter(Boolean);

  return candidates.find((value) => parseInitDataParams(value).has('hash')) ?? '';
}

function getLocationCandidates(rawValue: string): string[] {
  if (!rawValue) {
    return [];
  }

  const trimmed = rawValue.replace(/^[?#]/, '').trim();

  if (!trimmed) {
    return [];
  }

  const candidates = [trimmed];
  const queryIndex = trimmed.indexOf('?');

  if (queryIndex >= 0 && queryIndex < trimmed.length - 1) {
    candidates.push(trimmed.slice(queryIndex + 1));
  }

  const params = new URLSearchParams(trimmed);
  for (const key of ['WebAppData', 'webAppData', 'maxWebAppData', 'tgWebAppData', 'initData', 'appData']) {
    const value = params.get(key);
    if (value) {
      candidates.push(value);
    }
  }

  return candidates;
}

function normalizeInitData(value: string): string {
  let normalized = value.trim();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const params = parseInitDataParams(normalized);

    if (params.has('hash')) {
      return normalized;
    }

    try {
      const decoded = decodeURIComponent(normalized);

      if (decoded === normalized) {
        return normalized;
      }

      normalized = decoded;
    } catch {
      return normalized;
    }
  }

  return normalized;
}

function parseInitDataParams(value: string): URLSearchParams {
  return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
}

function parseUserFromInitData(rawUser: string | null): MaxWebAppUser | null {
  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as MaxWebAppUser;
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}
