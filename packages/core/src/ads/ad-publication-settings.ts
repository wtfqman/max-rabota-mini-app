export type RepeatPeriod = 'daily' | 'three_days' | 'weekly';
export type ActivePeriod = 'three_days' | 'seven_days' | 'fourteen_days' | 'manual';

export interface AdPublicationSettings {
  autoRepeat: boolean;
  repeatPeriod: RepeatPeriod;
  activePeriod: ActivePeriod;
  remindBeforeEnd: boolean;
  updatedAt: string;
  autoRepeatStartedAt: string | null;
  lastAutoPublishedAt: string | null;
  nextAutoPublishAt: string | null;
}

const metadataKey = 'publicationSettings';

const repeatMs: Record<RepeatPeriod, number> = {
  daily: 24 * 60 * 60 * 1000,
  three_days: 3 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

const activeMs: Record<Exclude<ActivePeriod, 'manual'>, number> = {
  three_days: 3 * 24 * 60 * 60 * 1000,
  seven_days: 7 * 24 * 60 * 60 * 1000,
  fourteen_days: 14 * 24 * 60 * 60 * 1000
};

export function defaultAdPublicationSettings(now = new Date()): AdPublicationSettings {
  return {
    autoRepeat: false,
    repeatPeriod: 'three_days',
    activePeriod: 'seven_days',
    remindBeforeEnd: true,
    updatedAt: now.toISOString(),
    autoRepeatStartedAt: null,
    lastAutoPublishedAt: null,
    nextAutoPublishAt: null
  };
}

export function getAdPublicationSettings(metadataJson: string | null | undefined): AdPublicationSettings | null {
  const metadata = parseAdMetadata(metadataJson);
  const rawSettings = metadata[metadataKey];

  if (!isRecord(rawSettings)) {
    return null;
  }

  return normalizeAdPublicationSettings(rawSettings);
}

export function mergeAdPublicationSettings(
  metadataJson: string | null | undefined,
  settings: Partial<AdPublicationSettings>,
  now = new Date()
): string {
  const metadata = parseAdMetadata(metadataJson);
  const previous = getAdPublicationSettings(metadataJson) ?? defaultAdPublicationSettings(now);
  const autoRepeat = typeof settings.autoRepeat === 'boolean' ? settings.autoRepeat : previous.autoRepeat;
  const autoRepeatStartedAt = autoRepeat
    ? previous.autoRepeatStartedAt ?? now.toISOString()
    : null;
  const normalized = normalizeAdPublicationSettings({
    ...previous,
    ...settings,
    autoRepeat,
    autoRepeatStartedAt,
    updatedAt: now.toISOString()
  });

  return JSON.stringify({
    ...metadata,
    [metadataKey]: normalized
  });
}

export function getRepeatIntervalMs(period: RepeatPeriod): number {
  return repeatMs[period];
}

export function getActiveUntil(settings: AdPublicationSettings): Date | null {
  if (!settings.autoRepeat || settings.activePeriod === 'manual' || !settings.autoRepeatStartedAt) {
    return null;
  }

  return new Date(new Date(settings.autoRepeatStartedAt).getTime() + activeMs[settings.activePeriod]);
}

export function getNextAutoPublishAt(settings: AdPublicationSettings, lastPublishedAt: Date | null): Date | null {
  if (!settings.autoRepeat) {
    return null;
  }

  if (!lastPublishedAt) {
    return new Date();
  }

  return new Date(lastPublishedAt.getTime() + getRepeatIntervalMs(settings.repeatPeriod));
}

export function normalizeAdPublicationSettings(
  value: Partial<AdPublicationSettings> | Record<string, unknown>,
  now = new Date()
): AdPublicationSettings {
  return {
    autoRepeat: Boolean(value.autoRepeat),
    repeatPeriod: isRepeatPeriod(value.repeatPeriod) ? value.repeatPeriod : 'three_days',
    activePeriod: isActivePeriod(value.activePeriod) ? value.activePeriod : 'seven_days',
    remindBeforeEnd: typeof value.remindBeforeEnd === 'boolean' ? value.remindBeforeEnd : true,
    updatedAt: toIsoString(value.updatedAt) ?? now.toISOString(),
    autoRepeatStartedAt: toIsoString(value.autoRepeatStartedAt),
    lastAutoPublishedAt: toIsoString(value.lastAutoPublishedAt),
    nextAutoPublishAt: toIsoString(value.nextAutoPublishAt)
  };
}

function parseAdMetadata(metadataJson: string | null | undefined): Record<string, unknown> {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isRepeatPeriod(value: unknown): value is RepeatPeriod {
  return value === 'daily' || value === 'three_days' || value === 'weekly';
}

function isActivePeriod(value: unknown): value is ActivePeriod {
  return value === 'three_days' || value === 'seven_days' || value === 'fourteen_days' || value === 'manual';
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
