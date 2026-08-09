import 'dotenv/config';
import { z } from 'zod';
import { FEATURE_FLAG_KEYS, type FeatureFlags } from '@rabst24/shared';

const optionalUrl = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return value;
}, z.url().optional());

const optionalString = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const optionalNumericString = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  return String(value).trim();
}, z.string().regex(/^\d+$/).optional());

const trustProxyValue = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return 'loopback';
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  const numericValue = Number(normalized);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return String(value).trim();
}, z.union([z.boolean(), z.string().min(1), z.number().int().nonnegative()]));

const booleanValue = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}, z.boolean());

const featureFlagValue = booleanValue.default(false);

const optionalBooleanValue = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}, z.boolean().optional());

const moneyValue = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return '100.00';
  }

  const normalized = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(normalized)) {
    return value;
  }

  return normalized.toFixed(2);
}, z.string().regex(/^\d+\.\d{2}$/));

const DEFAULT_PRODUCTION_APP_URL = 'https://app.rabst24.ru';
const DEFAULT_DEVELOPMENT_APP_URL = 'http://localhost:5173';
const DEFAULT_DEVELOPMENT_API_PUBLIC_URL = 'http://localhost:3000/api';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  APP_DOMAIN: z.string().default('app.rabst24.ru'),
  APP_URL: optionalUrl,
  WEB_APP_URL: optionalUrl,
  API_PUBLIC_URL: optionalUrl,
  TRUST_PROXY: trustProxyValue.default('loopback'),
  HTTPS_ENABLED: booleanValue.default(false),
  DEV_AUTH_ENABLED: booleanValue.default(false),
  DEV_AUTH_MAX_USER_ID: z.string().default('9000000001'),
  DEV_AUTH_USERNAME: z.string().default('local_dev'),
  DEV_AUTH_FIRST_NAME: z.string().default('Local'),
  DEV_AUTH_LAST_NAME: z.string().default('Developer'),
  CORS_ORIGIN: z.string().default('https://app.rabst24.ru'),
  DATABASE_URL: z.string().min(1),
  MAX_BOT_TOKEN: z.string().min(1),
  MAX_API_BASE_URL: z.url().default('https://platform-api2.max.ru'),
  MAX_BOT_MODE: z.enum(['long-polling', 'webhook']).default('long-polling'),
  MAX_WEBHOOK_PATH: z.string().startsWith('/').default('/webhooks/max'),
  MAX_WEBHOOK_SECRET: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{5,256}$/)
    .optional(),
  MAX_INIT_DATA_SIGNATURE_CHECK_ENABLED: booleanValue.default(true),
  MAX_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86400),
  MAX_LONG_POLLING_TIMEOUT_SECONDS: z.coerce.number().int().min(0).max(90).default(30),
  MAX_LONG_POLLING_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  MAX_CHANNEL_CHAT_ID: optionalString,
  MAX_MINI_APP_WEB_APP: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_USERNAME: optionalString,
  TELEGRAM_API_BASE_URL: optionalUrl,
  TELEGRAM_BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_URL: optionalUrl,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
  TELEGRAM_ADMIN_IDS: z.string().default(''),
  TELEGRAM_TEST_CHANNEL_ID: optionalString,
  TELEGRAM_TEST_GROUP_ID: optionalString,
  YOOKASSA_ENABLED: optionalBooleanValue,
  YOOKASSA_SHOP_ID: optionalNumericString,
  YOOKASSA_SECRET_KEY: optionalString,
  YOOKASSA_API_BASE_URL: z.url().default('https://api.yookassa.ru'),
  YOOKASSA_WEBHOOK_PATH: z.string().startsWith('/').default('/webhooks/yookassa'),
  YOOKASSA_RETURN_URL: optionalUrl,
  YOOKASSA_TEST_MODE: booleanValue.default(false),
  AD_PLACEMENT_PAYMENT_AMOUNT_RUB: moneyValue.default('100.00'),
  APPLICATIONS_ENABLED: featureFlagValue,
  SAVED_SEARCHES_ENABLED: featureFlagValue,
  USER_NOTIFICATIONS_ENABLED: featureFlagValue,
  PROMOTIONS_ENABLED: featureFlagValue,
  AD_ANALYTICS_ENABLED: featureFlagValue,
  REPORTS_ENABLED: featureFlagValue,
  PUBLIC_PROFILES_ENABLED: featureFlagValue,
  RESUME_CONTACT_PURCHASE_ENABLED: featureFlagValue,
  CONTACT_VERIFICATION_ENABLED: featureFlagValue,
  MAX_CONTACT_VERIFICATION_ENABLED: featureFlagValue,
  BOT_CONTACT_FALLBACK_ENABLED: featureFlagValue,
  RESUME_CONNECTION_PURCHASE_ENABLED: featureFlagValue,
  VERIFIED_PHONE_UNLOCK_ENABLED: featureFlagValue.default(false),
  CONTACT_DISPUTES_ENABLED: featureFlagValue,
  CONTACT_VERIFICATION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CONTACT_REVERIFY_DEADLINE_HOURS: z.coerce.number().int().positive().default(24),
  TELEGRAM_BOT_ENABLED: featureFlagValue,
  TELEGRAM_SYNC_ENABLED: featureFlagValue,
  TELEGRAM_INBOUND_ADS_ENABLED: featureFlagValue,
  TELEGRAM_OUTBOUND_PUBLICATION_ENABLED: featureFlagValue,
  TELEGRAM_TEST_MODE: featureFlagValue.default(true),
  TELEGRAM_EDIT_SYNC_ENABLED: featureFlagValue,
  TELEGRAM_DELETE_SYNC_ENABLED: featureFlagValue,
  TELEGRAM_ACCOUNT_LINKING_ENABLED: featureFlagValue,
  FINANCE_DASHBOARD_ENABLED: featureFlagValue,
  OUTBOX_WORKER_ENABLED: booleanValue.default(true),
  OUTBOX_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  OUTBOX_WORKER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  MINI_APP_URL: optionalUrl,
  CHANNEL_URL: optionalUrl
}).superRefine((env, context) => {
  const yookassaEnabled = env.YOOKASSA_ENABLED ?? Boolean(env.YOOKASSA_SECRET_KEY);

  if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['SESSION_SECRET'],
      message: 'SESSION_SECRET is required in production'
    });
  }

  if (env.NODE_ENV === 'production' && env.DEV_AUTH_ENABLED) {
    context.addIssue({
      code: 'custom',
      path: ['DEV_AUTH_ENABLED'],
      message: 'DEV_AUTH_ENABLED must be false in production'
    });
  }

  if (yookassaEnabled && !env.YOOKASSA_SHOP_ID) {
    context.addIssue({
      code: 'custom',
      path: ['YOOKASSA_SHOP_ID'],
      message: 'YOOKASSA_SHOP_ID is required when YooKassa is enabled'
    });
  }

  if (yookassaEnabled && !env.YOOKASSA_SECRET_KEY) {
    context.addIssue({
      code: 'custom',
      path: ['YOOKASSA_SECRET_KEY'],
      message: 'YOOKASSA_SECRET_KEY is required when YooKassa is enabled'
    });
  }

  if (env.NODE_ENV === 'production' && yookassaEnabled && env.YOOKASSA_TEST_MODE) {
    context.addIssue({
      code: 'custom',
      path: ['YOOKASSA_TEST_MODE'],
      message: 'YOOKASSA_TEST_MODE must be false in production when YooKassa is enabled'
    });
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables', parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsedEnv.data;
const defaultAppUrl = env.NODE_ENV === 'development' ? DEFAULT_DEVELOPMENT_APP_URL : DEFAULT_PRODUCTION_APP_URL;
const appUrl = normalizeUrl(env.APP_URL ?? defaultAppUrl);
const webAppUrl = normalizeUrl(env.WEB_APP_URL ?? env.MINI_APP_URL ?? appUrl);
const apiPublicUrl = normalizeUrl(
  env.API_PUBLIC_URL ??
    (env.NODE_ENV === 'development' ? DEFAULT_DEVELOPMENT_API_PUBLIC_URL : `${appUrl}/api`)
);
const miniAppUrl = normalizeUrl(env.MINI_APP_URL ?? webAppUrl);
const yookassaEnabled = env.YOOKASSA_ENABLED ?? Boolean(env.YOOKASSA_SECRET_KEY);
const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const features = Object.fromEntries(FEATURE_FLAG_KEYS.map((key) => [key, env[key]])) as FeatureFlags;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  appDomain: env.APP_DOMAIN,
  appUrl,
  webAppUrl,
  apiPublicUrl,
  trustProxy: env.TRUST_PROXY,
  httpsEnabled: env.HTTPS_ENABLED,
  devAuth: {
    enabled: env.DEV_AUTH_ENABLED,
    maxUserId: env.DEV_AUTH_MAX_USER_ID,
    username: env.DEV_AUTH_USERNAME,
    firstName: env.DEV_AUTH_FIRST_NAME,
    lastName: env.DEV_AUTH_LAST_NAME
  },
  corsOrigin: env.CORS_ORIGIN,
  corsOrigins,
  features,
  outbox: {
    workerEnabled: env.OUTBOX_WORKER_ENABLED,
    workerIntervalMs: env.OUTBOX_WORKER_INTERVAL_MS,
    workerLockTimeoutMs: env.OUTBOX_WORKER_LOCK_TIMEOUT_MS
  },
  databaseUrl: env.DATABASE_URL,
  miniAppUrl,
  channelUrl: env.CHANNEL_URL,
  session: {
    secret:
      env.SESSION_SECRET ??
      'development-only-rabst24-session-secret-change-before-production',
    ttlSeconds: env.SESSION_TTL_SECONDS
  },
  max: {
    botToken: env.MAX_BOT_TOKEN,
    apiBaseUrl: env.MAX_API_BASE_URL,
    botMode: env.MAX_BOT_MODE,
    webhookPath: env.MAX_WEBHOOK_PATH,
    webhookSecret: env.MAX_WEBHOOK_SECRET,
    initDataSignatureCheckEnabled: env.MAX_INIT_DATA_SIGNATURE_CHECK_ENABLED,
    initDataMaxAgeSeconds: env.MAX_INIT_DATA_MAX_AGE_SECONDS,
    longPollingTimeoutSeconds: env.MAX_LONG_POLLING_TIMEOUT_SECONDS,
    longPollingLimit: env.MAX_LONG_POLLING_LIMIT,
    channelChatId: env.MAX_CHANNEL_CHAT_ID,
    miniAppWebApp: env.MAX_MINI_APP_WEB_APP
  },
  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    botUsername: env.TELEGRAM_BOT_USERNAME,
    apiBaseUrl: env.TELEGRAM_API_BASE_URL ? normalizeUrl(env.TELEGRAM_API_BASE_URL) : undefined,
    botMode: env.TELEGRAM_BOT_MODE,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    adminIds: env.TELEGRAM_ADMIN_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    testChannelId: env.TELEGRAM_TEST_CHANNEL_ID,
    testGroupId: env.TELEGRAM_TEST_GROUP_ID
  },
  yookassa: {
    enabled: yookassaEnabled,
    shopId: env.YOOKASSA_SHOP_ID ?? '1399748',
    secretKey: env.YOOKASSA_SECRET_KEY,
    apiBaseUrl: normalizeUrl(env.YOOKASSA_API_BASE_URL),
    webhookPath: env.YOOKASSA_WEBHOOK_PATH,
    returnUrl: normalizeUrl(env.YOOKASSA_RETURN_URL ?? `${miniAppUrl}/my-ads`),
    testMode: env.YOOKASSA_TEST_MODE,
    adPlacementAmountRub: env.AD_PLACEMENT_PAYMENT_AMOUNT_RUB
  },
  contacts: {
    verificationTtlDays: env.CONTACT_VERIFICATION_TTL_DAYS,
    reverifyDeadlineHours: env.CONTACT_REVERIFY_DEADLINE_HOURS,
    resumeConnectionPriceRub: '20.00' as const,
    consentDocumentVersion: 'contact-disclosure-2026-08-02'
  }
} as const;

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}
