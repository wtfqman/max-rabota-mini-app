import { AppError } from './errors.js';

export type ExternalId = string | number | bigint;

export function toBigIntId(value: ExternalId | undefined | null, fieldName = 'id'): bigint {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`Missing ${fieldName}`, 400);
  }

  try {
    return typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new AppError(`Invalid ${fieldName}`, 400, { value });
  }
}

export function toStringId(value: ExternalId | undefined | null, fieldName = 'id'): string {
  if (value === undefined || value === null || value === '') {
    throw new AppError(`Missing ${fieldName}`, 400);
  }

  return typeof value === 'bigint' ? value.toString() : String(value);
}
