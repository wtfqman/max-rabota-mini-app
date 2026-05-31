import 'dotenv/config';
import { z } from 'zod';

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
  MAX_API_BASE_URL: z.url().default('https://platform-api.max.ru'),
  MAX_BOT_MODE: z.enum(['long-polling', 'webhook']).default('long-polling'),
  MAX_WEBHOOK_PATH: z.string().startsWith('/').default('/webhooks/max'),
  MAX_WEBHOOK_SECRET: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{5,256}$/)
    .optional(),
  MAX_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86400),
  MAX_LONG_POLLING_TIMEOUT_SECONDS: z.coerce.number().int().min(0).max(90).default(30),
  MAX_LONG_POLLING_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  MAX_CHANNEL_CHAT_ID: optionalString,
  MAX_MINI_APP_WEB_APP: optionalString,
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  MINI_APP_URL: optionalUrl,
  CHANNEL_URL: optionalUrl
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['SESSION_SECRET'],
      message: 'SESSION_SECRET is required in production'
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
const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
    initDataMaxAgeSeconds: env.MAX_INIT_DATA_MAX_AGE_SECONDS,
    longPollingTimeoutSeconds: env.MAX_LONG_POLLING_TIMEOUT_SECONDS,
    longPollingLimit: env.MAX_LONG_POLLING_LIMIT,
    channelChatId: env.MAX_CHANNEL_CHAT_ID,
    miniAppWebApp: env.MAX_MINI_APP_WEB_APP
  }
} as const;

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}
