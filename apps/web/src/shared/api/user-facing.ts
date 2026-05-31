import { ApiError } from './http.js';

type ErrorContext =
  | 'app_init'
  | 'profile_load'
  | 'favorites_load'
  | 'vacancies_load'
  | 'vacancy_load'
  | 'ad_load'
  | 'moderation_load'
  | 'moderation_action'
  | 'reviews_load'
  | 'review_submit'
  | 'my_ads_load'
  | 'vacancy_submit'
  | 'resume_submit'
  | 'equipment_submit'
  | 'product_submit'
  | 'photo_upload';

const authMessage = 'Нужно заново открыть mini app через MAX.';
const genericDataMessage = 'Не удалось загрузить данные. Попробуйте ещё раз.';
const genericSubmitMessage = 'Не удалось отправить объявление. Проверьте данные и попробуйте ещё раз.';

const messages: Record<ErrorContext, { default: string; auth: string }> = {
  app_init: {
    default: 'Не удалось открыть приложение. Попробуйте зайти ещё раз.',
    auth: authMessage
  },
  profile_load: {
    default: 'Не удалось загрузить профиль. Попробуйте ещё раз.',
    auth: authMessage
  },
  favorites_load: {
    default: 'Не удалось загрузить избранное. Попробуйте ещё раз.',
    auth: authMessage
  },
  vacancies_load: {
    default: 'Не удалось загрузить объявления. Попробуйте ещё раз.',
    auth: authMessage
  },
  vacancy_load: {
    default: 'Не удалось открыть вакансию. Попробуйте ещё раз.',
    auth: authMessage
  },
  ad_load: {
    default: 'Не удалось открыть объявление. Попробуйте ещё раз.',
    auth: authMessage
  },
  moderation_load: {
    default: 'Не удалось загрузить модерацию. Попробуйте ещё раз.',
    auth: authMessage
  },
  moderation_action: {
    default: 'Не удалось выполнить действие. Попробуйте ещё раз.',
    auth: authMessage
  },
  reviews_load: {
    default: 'Не удалось загрузить отзывы. Попробуйте ещё раз.',
    auth: authMessage
  },
  review_submit: {
    default: 'Не удалось отправить отзыв. Проверьте текст и попробуйте ещё раз.',
    auth: authMessage
  },
  my_ads_load: {
    default: 'Не удалось загрузить ваши объявления. Попробуйте ещё раз.',
    auth: authMessage
  },
  vacancy_submit: {
    default: 'Не удалось отправить вакансию. Проверьте данные и попробуйте ещё раз.',
    auth: authMessage
  },
  resume_submit: {
    default: 'Не удалось отправить резюме. Проверьте данные и попробуйте ещё раз.',
    auth: authMessage
  },
  equipment_submit: {
    default: genericSubmitMessage,
    auth: authMessage
  },
  product_submit: {
    default: genericSubmitMessage,
    auth: authMessage
  },
  photo_upload: {
    default: 'Не удалось загрузить фото. Попробуйте выбрать изображение ещё раз.',
    auth: authMessage
  }
};

export function getUserFacingError(error: unknown, context: ErrorContext): string {
  const messageSet = messages[context];

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return messageSet.auth;
    }

    if (error.status === 404) {
      return getNotFoundMessage(context) ?? messageSet.default;
    }

    const normalized = normalizeKnownTechnicalMessage(error.message);
    if (normalized) {
      return normalized;
    }

    if (isSafeHumanMessage(error.message)) {
      return error.message.trim();
    }
  }

  if (error instanceof Error) {
    const normalized = normalizeKnownTechnicalMessage(error.message);
    if (normalized) {
      return normalized;
    }

    if (isSafeHumanMessage(error.message)) {
      return error.message.trim();
    }
  }

  return messageSet.default;
}

function getNotFoundMessage(context: ErrorContext): string | null {
  if (context === 'ad_load' || context === 'vacancy_load') {
    return 'Не нашли это объявление. Возможно, его сняли с публикации.';
  }

  if (context === 'profile_load') {
    return 'Профиль пока не найден. Откройте mini app заново через MAX.';
  }

  return null;
}

function normalizeKnownTechnicalMessage(message: string): string | null {
  const lower = message.trim().toLowerCase();

  if (!lower) {
    return null;
  }

  if (lower.includes('video is not supported')) {
    return 'Видео уже поддерживается. Обновите приложение и попробуйте выбрать MP4, MOV или WebM ещё раз.';
  }

  if (lower.includes('file is too large')) {
    return 'Файл слишком большой. Фото можно до 5 МБ, видео до 60 МБ.';
  }

  if (lower.includes('invalid upload payload')) {
    return 'Не удалось загрузить файл. Поддерживаются фото JPEG/PNG/WebP и видео MP4/MOV/WebM.';
  }

  if (
    lower.includes('authentication required') ||
    lower.includes('auth required') ||
    lower.includes('invalid access_token') ||
    lower.includes('verify.token') ||
    lower.includes('unauthorized')
  ) {
    return authMessage;
  }

  if (lower.includes('pending moderation')) {
    return 'Объявление на модерации.';
  }

  if (lower === 'pending' || lower.includes('pending state')) {
    return 'На модерации.';
  }

  if (lower.includes('rejected')) {
    return 'Отклонено.';
  }

  if (lower.includes('draft')) {
    return 'Черновик.';
  }

  if (
    lower.includes('failed to load') ||
    lower.includes('api request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror')
  ) {
    return genericDataMessage;
  }

  return null;
}

function isSafeHumanMessage(message: string): boolean {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  if (!raw || raw.length > 180 || !/[а-яё]/i.test(raw)) {
    return false;
  }

  return ![
    'authentication required',
    'auth required',
    'pending',
    'rejected',
    'draft',
    'raw',
    'api request failed',
    'failed to fetch',
    'prisma',
    'stack',
    'validation',
    'internal',
    'debug',
    'schema',
    'database',
    'access_token',
    'token',
    'undefined',
    'null',
    'json',
    'route',
    'exception',
    '/api',
    'server returned',
    'сервер вернул',
    'внутрен',
    'техничес'
  ].some((token) => lower.includes(token));
}

export function getRoleLabel(role: 'user' | 'moderator' | 'admin'): string {
  if (role === 'admin') {
    return 'Администратор';
  }

  if (role === 'moderator') {
    return 'Команда поддержки';
  }

  return 'Пользователь';
}

export function getStatusLabel(status: 'active' | 'blocked' | 'deleted'): string {
  if (status === 'blocked') {
    return 'На паузе';
  }

  if (status === 'deleted') {
    return 'Скрыт';
  }

  return 'Активен';
}
