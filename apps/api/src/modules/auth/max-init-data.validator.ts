import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@rabst24/shared';
import { z } from 'zod';
import type { MaxInitDataUser, ValidatedMaxInitData } from './auth.types.js';

const maxInitUserSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    language_code: z.string().nullable().optional(),
    photo_url: z.string().nullable().optional()
  })
  .passthrough();

export interface MaxInitDataValidatorOptions {
  botToken: string;
  maxAgeSeconds: number;
}

export class MaxInitDataValidator {
  constructor(private readonly options: MaxInitDataValidatorOptions) {}

  validate(initData: string): ValidatedMaxInitData {
    const candidates = this.buildCandidateParams(initData);
    const matched = candidates.find((params) => {
      const hash = params.get('hash');

      if (!hash) {
        return false;
      }

      const dataCheckString = this.buildDataCheckString(params);
      const expectedHash = this.createSignature(dataCheckString);

      return this.safeCompareHex(hash, expectedHash);
    });

    if (!matched) {
      if (!candidates.some((params) => params.has('hash'))) {
        throw new AppError('Missing MAX init data hash', 401);
      }

      throw new AppError('Invalid MAX init data signature', 401);
    }

    const authDate = this.parseAuthDate(matched.get('auth_date'));
    const user = this.parseUser(matched.get('user'));

    return {
      queryId: matched.get('query_id') ?? undefined,
      authDate,
      startParam: matched.get('start_param') ?? undefined,
      user
    };
  }

  private parseInitData(initData: string): URLSearchParams {
    const normalized = this.normalizeInitData(initData);
    const params = new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized);

    if (!params.has('hash')) {
      throw new AppError('Invalid MAX init data format', 401);
    }

    return params;
  }

  private buildCandidateParams(initData: string): URLSearchParams[] {
    const seen = new Set<string>();
    const candidates: URLSearchParams[] = [];

    const pushCandidate = (params: URLSearchParams) => {
      const signature = [...params.entries()].map(([key, value]) => `${key}=${value}`).join('&');

      if (!signature || seen.has(signature)) {
        return;
      }

      seen.add(signature);
      candidates.push(params);
    };

    const rawCandidates = this.buildRawCandidates(initData);

    for (const raw of rawCandidates) {
      const normalizedRaw = raw.startsWith('?') ? raw.slice(1) : raw;

      pushCandidate(new URLSearchParams(normalizedRaw));
      pushCandidate(this.parsePairs(normalizedRaw, false));
      pushCandidate(this.parsePairs(normalizedRaw, true));

      const topLevel = new URLSearchParams(normalizedRaw);
      for (const key of ['WebAppData', 'webAppData', 'initData', 'tgWebAppData']) {
        const nested = topLevel.get(key);

        if (!nested) {
          continue;
        }

        for (const nestedRaw of this.buildRawCandidates(nested)) {
          const normalizedNested = nestedRaw.startsWith('?') ? nestedRaw.slice(1) : nestedRaw;
          pushCandidate(new URLSearchParams(normalizedNested));
          pushCandidate(this.parsePairs(normalizedNested, false));
          pushCandidate(this.parsePairs(normalizedNested, true));
        }
      }
    }

    return candidates;
  }

  private buildRawCandidates(value: string): string[] {
    const candidates = new Set<string>();
    let current = value.trim();

    if (!current) {
      return [];
    }

    candidates.add(current);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const decoded = decodeURIComponent(current);

        if (!decoded || decoded === current) {
          break;
        }

        candidates.add(decoded);
        current = decoded;
      } catch {
        break;
      }
    }

    return [...candidates];
  }

  private parsePairs(raw: string, decodeValues: boolean): URLSearchParams {
    const params = new URLSearchParams();

    for (const pair of raw.split('&')) {
      if (!pair) {
        continue;
      }

      const separatorIndex = pair.indexOf('=');
      const key = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
      const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';

      if (!key) {
        continue;
      }

      params.append(key, decodeValues ? this.safeDecode(rawValue) : rawValue);
    }

    return params;
  }

  private safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private normalizeInitData(initData: string): string {
    let normalized = initData.trim();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (new URLSearchParams(normalized.startsWith('?') ? normalized.slice(1) : normalized).has('hash')) {
        return normalized;
      }

      try {
        const decoded = decodeURIComponent(normalized);
        if (decoded === normalized) {
          return normalized;
        }
        normalized = decoded;
      } catch {
        return normalized;
      }
    }

    return normalized;
  }

  private buildDataCheckString(params: URLSearchParams): string {
    return [...params.entries()]
      .filter(([key]) => key !== 'hash')
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  private createSignature(dataCheckString: string): string {
    const secretKey = createHmac('sha256', 'WebAppData').update(this.options.botToken).digest();

    return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  }

  private parseAuthDate(value: string | null): Date {
    if (!value) {
      throw new AppError('Missing MAX init auth date', 401);
    }

    const timestamp = Number(value);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new AppError('Invalid MAX init auth date', 401);
    }

    const timestampMs = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    const nowMs = Date.now();
    const futureSkewMs = 5 * 60 * 1000;

    if (timestampMs > nowMs + futureSkewMs) {
      throw new AppError('MAX init data auth date is in the future', 401);
    }

    const ageSeconds = Math.floor((nowMs - timestampMs) / 1000);

    if (ageSeconds > this.options.maxAgeSeconds) {
      throw new AppError('MAX init data expired', 401);
    }

    return new Date(timestampMs);
  }

  private parseUser(value: string | null): MaxInitDataUser {
    if (!value) {
      throw new AppError('Missing MAX init user', 401);
    }

    try {
      const parsed = maxInitUserSchema.parse(JSON.parse(value));
      const rawId = this.extractRawUserId(value) ?? parsed.id;

      return {
        id: String(rawId),
        first_name: parsed.first_name ?? null,
        last_name: parsed.last_name ?? null,
        username: parsed.username ?? null,
        language_code: parsed.language_code ?? null,
        photo_url: parsed.photo_url ?? null
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Invalid MAX init user payload', 401);
    }
  }

  private extractRawUserId(rawUserJson: string): string | null {
    const match = rawUserJson.match(/"id"\s*:\s*"?(\d+)"?/);
    return match?.[1] ?? null;
  }

  private safeCompareHex(left: string, right: string): boolean {
    if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
      return false;
    }

    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
