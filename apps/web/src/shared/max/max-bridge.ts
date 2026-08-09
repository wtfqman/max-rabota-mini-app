import type { AuthPlatform } from '../../features/auth/auth.types.js';

import { isValidExternalUrl, isValidPaymentConfirmationUrl } from '@rabst24/shared';

export { isValidExternalUrl };
export { isValidPaymentConfirmationUrl };

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
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  openMaxLink?: (url: string) => void;
  openExternalLink?: (url: string) => void;
  requestContact?: () => Promise<unknown>;
}

type BrowserWindowLike = {
  WebApp?: MaxWebApp;
  open?: (url: string, target: string, features: string) => { closed?: boolean; close?: () => void } | null;
  location?: {
    search?: string;
    hash?: string;
  };
};

export type ExternalNavigationHandle = { closed?: boolean; close?: () => void } | null;
export type MaxPlatform = AuthPlatform | 'unknown';
export type ExternalLinkMethod = 'WebApp.openLink' | 'WebApp.openExternalLink' | 'window.open' | 'none';

export interface ExternalLinkOpenResult {
  opened: boolean;
  platform: MaxPlatform;
  method: ExternalLinkMethod;
  reason?: string;
}

export function getMaxWebApp(): MaxWebApp | null {
  return getBrowserWindow()?.WebApp ?? null;
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
    startParam: webApp?.initDataUnsafe?.start_param ?? fallbackParams.get('start_param') ?? fallbackParams.get('startapp') ?? undefined
  };
}

export function notifyMaxAppReady(): void {
  const webApp = getMaxWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}

export function reserveExternalNavigation(): ExternalNavigationHandle {
  return null;
}

export function openExternalUrl(url: string, reservedWindow?: ExternalNavigationHandle): boolean {
  return openExternalUrlWithResult(url, reservedWindow).opened;
}

export function openExternalUrlWithResult(url: string, reservedWindow?: ExternalNavigationHandle): ExternalLinkOpenResult {
  const platform = getMaxPlatform();

  if (!isValidExternalUrl(url)) {
    closeReservedExternalNavigation(reservedWindow);
    return {
      opened: false,
      platform,
      method: 'none',
      reason: 'invalid_url'
    };
  }

  closeReservedExternalNavigation(reservedWindow);

  const webApp = getMaxWebApp();

  if (typeof webApp?.openLink === 'function') {
    try {
      webApp.openLink(url, { try_instant_view: false });
      return {
        opened: true,
        platform,
        method: 'WebApp.openLink'
      };
    } catch (error) {
      return {
        opened: false,
        platform,
        method: 'WebApp.openLink',
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  if (typeof webApp?.openExternalLink === 'function') {
    try {
      webApp.openExternalLink(url);
      return {
        opened: true,
        platform,
        method: 'WebApp.openExternalLink'
      };
    } catch (error) {
      return {
        opened: false,
        platform,
        method: 'WebApp.openExternalLink',
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  if (webApp) {
    return {
      opened: false,
      platform,
      method: 'none',
      reason: 'max_open_link_unavailable'
    };
  }

  try {
    const openedWindow = getBrowserWindow()?.open?.(url, '_blank', 'noopener,noreferrer') ?? null;

    if (openedWindow) {
      return {
        opened: true,
        platform,
        method: 'window.open'
      };
    }

    return {
      opened: false,
      platform,
      method: 'window.open',
      reason: 'window_open_blocked'
    };
  } catch (error) {
    return {
      opened: false,
      platform,
      method: 'window.open',
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function closeReservedExternalNavigation(handle?: ExternalNavigationHandle): void {
  if (!handle || handle.closed) {
    return;
  }

  handle.close?.();
}

export function getMaxPlatform(): MaxPlatform {
  return normalizePlatform(getMaxWebApp()?.platform) ?? 'unknown';
}

function getBrowserWindow(): BrowserWindowLike | null {
  return (globalThis as typeof globalThis & { window?: BrowserWindowLike }).window ?? null;
}

function normalizePlatform(platform?: string): AuthPlatform | undefined {
  if (platform === 'ios' || platform === 'android' || platform === 'web' || platform === 'desktop') {
    return platform;
  }

  return undefined;
}

function extractInitDataFromLocation(): string {
  const location = getBrowserWindow()?.location;
  const candidates = [location?.search ?? '', location?.hash ?? '']
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
