export const FEATURE_FLAG_KEYS = [
  'APPLICATIONS_ENABLED',
  'SAVED_SEARCHES_ENABLED',
  'USER_NOTIFICATIONS_ENABLED',
  'PROMOTIONS_ENABLED',
  'AD_ANALYTICS_ENABLED',
  'REPORTS_ENABLED',
  'PUBLIC_PROFILES_ENABLED',
  'RESUME_CONTACT_PURCHASE_ENABLED',
  'CONTACT_VERIFICATION_ENABLED',
  'MAX_CONTACT_VERIFICATION_ENABLED',
  'BOT_CONTACT_FALLBACK_ENABLED',
  'RESUME_CONNECTION_PURCHASE_ENABLED',
  'VERIFIED_PHONE_UNLOCK_ENABLED',
  'CONTACT_DISPUTES_ENABLED',
  'TELEGRAM_BOT_ENABLED',
  'TELEGRAM_SYNC_ENABLED',
  'TELEGRAM_INBOUND_ADS_ENABLED',
  'TELEGRAM_OUTBOUND_PUBLICATION_ENABLED',
  'TELEGRAM_TEST_MODE',
  'TELEGRAM_EDIT_SYNC_ENABLED',
  'TELEGRAM_DELETE_SYNC_ENABLED',
  'TELEGRAM_ACCOUNT_LINKING_ENABLED',
  'FINANCE_DASHBOARD_ENABLED'
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const PUBLIC_FEATURE_FLAG_KEYS = [
  'APPLICATIONS_ENABLED',
  'SAVED_SEARCHES_ENABLED',
  'USER_NOTIFICATIONS_ENABLED',
  'PROMOTIONS_ENABLED',
  'AD_ANALYTICS_ENABLED',
  'REPORTS_ENABLED',
  'PUBLIC_PROFILES_ENABLED',
  'RESUME_CONTACT_PURCHASE_ENABLED',
  'CONTACT_VERIFICATION_ENABLED',
  'MAX_CONTACT_VERIFICATION_ENABLED',
  'BOT_CONTACT_FALLBACK_ENABLED',
  'RESUME_CONNECTION_PURCHASE_ENABLED',
  'VERIFIED_PHONE_UNLOCK_ENABLED',
  'CONTACT_DISPUTES_ENABLED',
  'TELEGRAM_SYNC_ENABLED',
  'FINANCE_DASHBOARD_ENABLED'
] as const satisfies readonly FeatureFlagKey[];

export type PublicFeatureFlagKey = (typeof PUBLIC_FEATURE_FLAG_KEYS)[number];

export type PublicFeatureFlags = Record<PublicFeatureFlagKey, boolean>;

export function buildDisabledFeatureFlags(): FeatureFlags {
  return Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, false])) as FeatureFlags;
}

export function pickPublicFeatureFlags(flags: FeatureFlags): PublicFeatureFlags {
  return Object.fromEntries(PUBLIC_FEATURE_FLAG_KEYS.map((key) => [key, flags[key]])) as PublicFeatureFlags;
}

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === 'string' && FEATURE_FLAG_KEYS.includes(value as FeatureFlagKey);
}
