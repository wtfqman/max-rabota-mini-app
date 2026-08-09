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
const defaultRequestTimeoutMs = 20_000;
let accessToken: string | null = null;

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const timeout = createTimeoutSignal(options.signal);

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(toApiUrl(path), {
      ...options,
      cache: options.cache ?? 'no-store',
      headers,
      signal: timeout.signal
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
  } catch (error) {
    throw normalizeFetchError(error);
  } finally {
    timeout.cleanup();
  }
}

export async function apiTextRequest(path: string, options: RequestInit = {}): Promise<string> {
  const headers = new Headers(options.headers);
  const timeout = createTimeoutSignal(options.signal);

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  try {
    const response = await fetch(toApiUrl(path), {
      ...options,
      cache: options.cache ?? 'no-store',
      headers,
      signal: timeout.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new ApiError(text || 'Не удалось загрузить данные.', response.status);
    }

    return text;
  } catch (error) {
    throw normalizeFetchError(error);
  } finally {
    timeout.cleanup();
  }
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

function createTimeoutSignal(parentSignal?: AbortSignal | null): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let settled = false;
  const timeoutId = window.setTimeout(() => {
    settled = true;
    controller.abort();
  }, defaultRequestTimeoutMs);

  const abortFromParent = () => {
    settled = true;
    controller.abort();
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      if (!settled) {
        parentSignal?.removeEventListener('abort', abortFromParent);
      }
    }
  };
}

function normalizeFetchError(error: unknown): unknown {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('Сервер не ответил вовремя. Проверьте соединение и попробуйте ещё раз.', 408);
  }

  return error;
}
