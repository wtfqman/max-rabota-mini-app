const TELEGRAM_TOKEN_PATTERN = /bot\d+:[A-Za-z0-9_-]+/g;

export function sanitizeTelegramError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      name: error.name,
      message: redactTelegramToken(error.message),
      stack: redactTelegramToken(error.stack),
      cause: sanitizeTelegramError(error.cause)
    };
  }

  if (Array.isArray(error)) {
    return error.map((item) => sanitizeTelegramError(item));
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        key.toLowerCase().includes('token') ? '[redacted]' : sanitizeTelegramError(value)
      ])
    );
  }

  if (typeof error === 'string') {
    return redactTelegramToken(error);
  }

  return error;
}

function redactTelegramToken(value: string | undefined): string | undefined {
  return value?.replace(TELEGRAM_TOKEN_PATTERN, 'bot[redacted]');
}
