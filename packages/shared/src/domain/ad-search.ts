import { adListQuerySchema, type AdListQueryDto } from '../dto/ads.dto.js';
import type { AdTypeCode } from './ad.js';
import { canonicalizeCategory, canonicalizeDistrict } from '../normalization.js';

export function canonicalizeAdListQuery(
  query: Partial<AdListQueryDto> = {},
  forcedType?: AdTypeCode
): AdListQueryDto {
  const parsed = adListQuerySchema.parse({
    ...query,
    type: forcedType ?? query.type,
    page: query.page ?? 1,
    perPage: query.perPage ?? 20
  });
  const canonical: AdListQueryDto = {
    type: forcedType ?? parsed.type,
    q: normalizeText(parsed.q),
    city: normalizeText(parsed.city),
    district: canonicalizeDistrict(parsed.district) ?? normalizeText(parsed.district),
    category: canonicalizeCategory(parsed.category) ?? normalizeText(parsed.category),
    priceFrom: parsed.priceFrom,
    priceTo: parsed.priceTo,
    page: parsed.page,
    perPage: parsed.perPage
  };

  return Object.fromEntries(
    Object.entries(canonical).filter(([, value]) => value !== undefined && value !== '')
  ) as AdListQueryDto;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
