export function isValidExternalUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const PAYMENT_CONFIRMATION_HOSTS = new Set(['yookassa.ru', 'yoomoney.ru']);

export function isValidPaymentConfirmationUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isKnownHost =
      PAYMENT_CONFIRMATION_HOSTS.has(host) ||
      host.endsWith('.yookassa.ru') ||
      host.endsWith('.yoomoney.ru');

    return parsed.protocol === 'https:' && isKnownHost;
  } catch {
    return false;
  }
}
