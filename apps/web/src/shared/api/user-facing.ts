import { ApiError } from './http.js';

type ErrorContext =
  | 'app_init'
  | 'profile_load'
  | 'favorites_load'
  | 'vacancies_load'
  | 'vacancy_load'
  | 'ad_load'
  | 'reviews_load'
  | 'my_ads_load'
  | 'vacancy_submit'
  | 'resume_submit'
  | 'equipment_submit'
  | 'photo_upload';

const messages: Record<ErrorContext, { default: string; auth: string }> = {
  app_init: {
    default: 'Не удалось открыть приложение. Попробуйте зайти ещё раз.',
    auth: 'Не удалось открыть приложение. Откройте mini app заново из MAX.'
  },
  profile_load: {
    default: 'Не удалось загрузить профиль. Попробуйте ещё раз.',
    auth: 'Не удалось загрузить профиль. Откройте приложение заново из MAX.'
  },
  favorites_load: {
    default: 'Не удалось загрузить избранное. Попробуйте ещё раз.',
    auth: 'Не удалось открыть избранное. Откройте приложение заново из MAX.'
  },
  vacancies_load: {
    default: 'Не удалось загрузить вакансии. Попробуйте ещё раз.',
    auth: 'Не удалось загрузить вакансии. Откройте приложение заново из MAX.'
  },
  vacancy_load: {
    default: 'Не удалось открыть вакансию. Попробуйте ещё раз.',
    auth: 'Не удалось открыть вакансию. Откройте приложение заново из MAX.'
  },
  ad_load: {
    default: 'Не удалось открыть объявление. Попробуйте ещё раз.',
    auth: 'Не удалось открыть объявление. Откройте приложение заново из MAX.'
  },
  reviews_load: {
    default: 'Не удалось загрузить отзывы. Попробуйте ещё раз.',
    auth: 'Не удалось загрузить отзывы. Откройте приложение заново из MAX.'
  },
  my_ads_load: {
    default: 'Не удалось загрузить ваши объявления. Попробуйте ещё раз.',
    auth: 'Не удалось загрузить ваши объявления. Откройте приложение заново из MAX.'
  },
  vacancy_submit: {
    default: 'Не удалось отправить вакансию. Проверьте данные и попробуйте ещё раз.',
    auth: 'Чтобы отправить вакансию, откройте mini app заново из MAX.'
  },
  resume_submit: {
    default: 'Не удалось отправить резюме. Проверьте данные и попробуйте ещё раз.',
    auth: 'Чтобы отправить резюме, откройте mini app заново из MAX.'
  },
  equipment_submit: {
    default: 'Не удалось отправить объявление. Проверьте данные и попробуйте ещё раз.',
    auth: 'Чтобы отправить объявление, откройте mini app заново из MAX.'
  },
  photo_upload: {
    default: 'Не удалось загрузить фото. Попробуйте выбрать изображения ещё раз.',
    auth: 'Не удалось загрузить фото. Откройте приложение заново из MAX.'
  }
};

export function getUserFacingError(error: unknown, context: ErrorContext): string {
  const messageSet = messages[context];

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return messageSet.auth;
    }

    const raw = (error.message || '').trim();
    if (raw && isHumanMessage(raw)) {
      return raw;
    }
  }

  if (error instanceof Error) {
    const raw = error.message.trim();
    if (raw && isHumanMessage(raw)) {
      return raw;
    }
  }

  return messageSet.default;
}

function isHumanMessage(message: string): boolean {
  const lower = message.toLowerCase();

  return ![
    'authentication required',
    'pending',
    'rejected',
    'api request failed',
    'prisma',
    'stack',
    'validation',
    'internal',
    'debug',
    'moderation'
  ].some((token) => lower.includes(token));
}

export function getRoleLabel(role: 'user' | 'moderator' | 'admin'): string {
  if (role === 'admin') {
    return 'Администратор';
  }

  if (role === 'moderator') {
    return 'Команда Rabst24';
  }

  return 'Пользователь';
}

export function getStatusLabel(status: 'active' | 'blocked' | 'deleted'): string {
  if (status === 'blocked') {
    return 'Пауза';
  }

  if (status === 'deleted') {
    return 'Скрыт';
  }

  return 'Активен';
}
