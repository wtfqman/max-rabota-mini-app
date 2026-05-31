import { appEnv } from '../config/app-env.js';

export interface ApiErrorBody {
  error?: {
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiBaseUrl = appEnv.apiBaseUrl;
let accessToken: string | null = null;

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(toApiUrl(path), {
    ...options,
    headers
  });

  const body = await parseBody<ApiErrorBody | T>(response);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    throw new ApiError(
      errorBody.error?.message ?? 'Не удалось загрузить данные.',
      response.status,
      errorBody.error?.details
    );
  }

  return body as T;
}

function toApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (apiBaseUrl === '/') {
    return normalizedPath;
  }

  return `${apiBaseUrl}${normalizedPath}`;
}

async function parseBody<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError('Не удалось загрузить данные. Попробуйте открыть приложение ещё раз.', response.status || 500, {
      contentType
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Не удалось загрузить данные. Попробуйте ещё раз.', response.status || 500);
  }
}
