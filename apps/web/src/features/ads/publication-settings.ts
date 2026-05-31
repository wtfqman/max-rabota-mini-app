export type RepeatPeriod = 'daily' | 'three_days' | 'weekly';
export type ActivePeriod = 'three_days' | 'seven_days' | 'fourteen_days' | 'manual';

export interface PublicationSettings {
  adId: string;
  autoRepeat: boolean;
  repeatPeriod: RepeatPeriod;
  activePeriod: ActivePeriod;
  remindBeforeEnd: boolean;
  updatedAt: string;
  autoRepeatStartedAt: string | null;
  lastAutoPublishedAt: string | null;
  nextAutoPublishAt: string | null;
}

export type PublicationSettingsMap = Record<string, PublicationSettings>;

export const repeatPeriodOptions: Array<{ value: RepeatPeriod; label: string }> = [
  { value: 'daily', label: 'каждый день' },
  { value: 'three_days', label: 'раз в 3 дня' },
  { value: 'weekly', label: 'раз в неделю' }
];

export const activePeriodOptions: Array<{ value: ActivePeriod; label: string }> = [
  { value: 'three_days', label: '3 дня' },
  { value: 'seven_days', label: '7 дней' },
  { value: 'fourteen_days', label: '14 дней' },
  { value: 'manual', label: 'вручную отключить' }
];

const STORAGE_KEY = 'rabst24:publication-settings:v1';

export function defaultPublicationSettings(adId: string): PublicationSettings {
  return {
    adId,
    autoRepeat: false,
    repeatPeriod: 'three_days',
    activePeriod: 'seven_days',
    remindBeforeEnd: true,
    updatedAt: new Date().toISOString(),
    autoRepeatStartedAt: null,
    lastAutoPublishedAt: null,
    nextAutoPublishAt: null
  };
}

export function loadPublicationSettings(): PublicationSettingsMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as PublicationSettingsMap;
    return Object.fromEntries(
      Object.entries(parsed).map(([adId, settings]) => [adId, normalizePublicationSettings(adId, settings)])
    );
  } catch {
    return {};
  }
}

export function savePublicationSettings(settings: PublicationSettingsMap): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getPublicationSettings(
  settings: PublicationSettingsMap,
  adId: string
): PublicationSettings {
  return normalizePublicationSettings(adId, settings[adId]);
}

export function upsertPublicationSettings(
  settings: PublicationSettingsMap,
  nextSettings: PublicationSettings
): PublicationSettingsMap {
  const next = {
    ...settings,
    [nextSettings.adId]: normalizePublicationSettings(nextSettings.adId, {
      ...nextSettings,
      updatedAt: new Date().toISOString()
    })
  };

  savePublicationSettings(next);
  return next;
}

export function normalizePublicationSettings(
  adId: string,
  settings?: Partial<PublicationSettings> | null
): PublicationSettings {
  const fallback = defaultPublicationSettings(adId);

  return {
    ...fallback,
    ...settings,
    adId,
    autoRepeat: Boolean(settings?.autoRepeat),
    repeatPeriod: settings?.repeatPeriod ?? fallback.repeatPeriod,
    activePeriod: settings?.activePeriod ?? fallback.activePeriod,
    remindBeforeEnd:
      typeof settings?.remindBeforeEnd === 'boolean' ? settings.remindBeforeEnd : fallback.remindBeforeEnd,
    updatedAt: settings?.updatedAt ?? fallback.updatedAt,
    autoRepeatStartedAt: settings?.autoRepeatStartedAt ?? null,
    lastAutoPublishedAt: settings?.lastAutoPublishedAt ?? null,
    nextAutoPublishAt: settings?.nextAutoPublishAt ?? null
  };
}

export function removePublicationSettings(settings: PublicationSettingsMap, adId: string): PublicationSettingsMap {
  const next = { ...settings };
  delete next[adId];
  savePublicationSettings(next);
  return next;
}
