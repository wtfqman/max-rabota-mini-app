import type {
  AdTypeCode,
  PublicAdBaseDetailDto,
  PublicAdCardDto,
  PublicAdChipDto,
  PublicAdContactDto,
  PublicAdDetailDto,
  PublicAdListMetaDto,
  PublicAdPhotoDto
} from '@rabst24/shared';
import type { PublicAdListResult, PublicAdRecord } from './ad.repository.js';

export function serializeAdListMeta(result: PublicAdListResult): PublicAdListMetaDto {
  return {
    page: result.page,
    perPage: result.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / result.perPage),
    sort: 'newest'
  };
}

export function serializeAdCard(ad: PublicAdRecord): PublicAdCardDto {
  const type = serializeAdType(ad.type);

  return {
    id: ad.id,
    type,
    title: ad.title,
    description: ad.description,
    subtitle: getSubtitle(ad),
    coverPhoto: serializePhoto(getCoverPhoto(ad.photos)),
    shortSalary: getShortSalary(ad),
    locationShort: getLocationShort(ad),
    city: ad.city,
    district: ad.districtText,
    address: getAddress(ad),
    category: getCategory(ad),
    chips: getCardChips(ad),
    publishedAt: ad.publishedAt?.toISOString() ?? null,
    createdAt: ad.createdAt.toISOString()
  };
}

export function serializeAdDetail(ad: PublicAdRecord): PublicAdDetailDto {
  const type = serializeAdType(ad.type);
  const base = serializeBaseDetail(ad);

  if (type === 'vacancy') {
    return {
      ...base,
      type: 'vacancy',
      vacancy: {
        companyName: getVacancyCompanyName(ad),
        position: ad.vacancyDetails?.position ?? null,
        employmentType: serializeNullableEnum(ad.vacancyDetails?.employmentType),
        workFormat: serializeNullableEnum(ad.vacancyDetails?.workFormat),
        schedule: ad.vacancyDetails?.schedule ?? null,
        experience: ad.vacancyDetails?.experience ?? null,
        education: ad.vacancyDetails?.education ?? null,
        salaryFrom: ad.vacancyDetails?.salaryFrom?.toString() ?? null,
        salaryTo: ad.vacancyDetails?.salaryTo?.toString() ?? null,
        salaryCurrency: ad.vacancyDetails?.salaryCurrency ?? ad.currency,
        salaryPeriod: serializeNullableEnum(ad.vacancyDetails?.salaryPeriod),
        isSalaryNegotiable: ad.vacancyDetails?.isSalaryNegotiable ?? false,
        metroStations: [
          ...(ad.vacancyDetails?.metroStations.map((metro) => ({
            id: metro.metroStation.id,
            city: metro.metroStation.city,
            name: metro.metroStation.name,
            lineName: metro.metroStation.lineName,
            lineColor: metro.metroStation.lineColor,
            walkingMinutes: metro.walkingMinutes
          })) ?? []),
          ...getMetadataMetroStations(ad)
        ]
      },
      requirements: ad.requirements.map((item) => item.text),
      responsibilities: ad.responsibilities.map((item) => item.text),
      benefits: ad.benefits.map((item) => item.text)
    };
  }

  if (type === 'resume') {
    return {
      ...base,
      type: 'resume',
      resume: {
        name: ad.title,
        profession: ad.resumeDetails?.desiredPosition ?? null,
        desiredPosition: ad.resumeDetails?.desiredPosition ?? null,
        experienceText: getMetadataString(parseJsonRecord(ad.metadataJson), ['experienceText', 'experience']),
        experienceYears: ad.resumeDetails?.experienceYears ?? null,
        employmentType: serializeNullableEnum(ad.resumeDetails?.employmentType),
        workFormat: serializeNullableEnum(ad.resumeDetails?.workFormat),
        expectedSalary: ad.resumeDetails?.expectedSalary?.toString() ?? null,
        salaryCurrency: ad.resumeDetails?.salaryCurrency ?? ad.currency,
        skills: parseJsonStringArray(ad.resumeDetails?.skillsJson),
        education: ad.resumeDetails?.education ?? null,
        availability: ad.resumeDetails?.availability ?? null,
        portfolioUrl: ad.resumeDetails?.portfolioUrl ?? null
      }
    };
  }

  if (type === 'equipment') {
    return {
      ...base,
      type: 'equipment',
      equipment: {
        name: ad.title,
        category: getCategory(ad),
        condition: serializeNullableEnum(ad.equipmentDetails?.condition),
        brand: ad.equipmentDetails?.brand ?? null,
        model: ad.equipmentDetails?.model ?? null,
        productionYear: ad.equipmentDetails?.productionYear ?? null,
        rentalPrice: ad.equipmentDetails?.rentalPrice?.toString() ?? null,
        salePrice: ad.equipmentDetails?.salePrice?.toString() ?? null,
        depositAmount: ad.equipmentDetails?.depositAmount?.toString() ?? null,
        currency: ad.equipmentDetails?.currency ?? ad.currency,
        availability: ad.equipmentDetails?.availability ?? null
      }
    };
  }

  return {
    ...base,
    type,
    product: {
      name: ad.title,
      category: getCategory(ad),
      price: ad.priceAmount?.toString() ?? null,
      currency: ad.currency,
      address: getAddress(ad)
    }
  };
}

function serializeBaseDetail(ad: PublicAdRecord): PublicAdBaseDetailDto {
  return {
    ...serializeAdCard(ad),
    status: ad.status.toLowerCase(),
    description: ad.description,
    photos: ad.photos.map(serializePhoto).filter((photo): photo is PublicAdPhotoDto => Boolean(photo)),
    contacts: ad.contacts.map(serializeContact),
    owner: {
      id: ad.owner.id,
      displayName: ad.owner.displayName,
      maxUsername: ad.owner.maxUsername
    },
    updatedAt: ad.updatedAt.toISOString()
  };
}

function serializePhoto(photo: PublicAdRecord['photos'][number] | undefined): PublicAdPhotoDto | null {
  if (!photo) {
    return null;
  }

  return {
    id: photo.id,
    url: photo.url,
    previewUrl: photo.previewUrl,
    mimeType: photo.mimeType,
    altText: photo.altText,
    width: photo.width,
    height: photo.height
  };
}

function serializeContact(contact: PublicAdRecord['contacts'][number]): PublicAdContactDto {
  return {
    id: contact.id,
    type: contact.type.toLowerCase(),
    label: contact.label,
    value: contact.value,
    isPreferred: contact.isPreferred
  };
}

function getSubtitle(ad: PublicAdRecord): string | null {
  if (ad.type === 'VACANCY') {
    return getVacancyCompanyName(ad);
  }

  if (ad.resumeDetails?.desiredPosition) {
    return ad.resumeDetails.desiredPosition;
  }

  const equipmentName = [ad.equipmentDetails?.brand, ad.equipmentDetails?.model]
    .filter(Boolean)
    .join(' ');

  if (equipmentName) {
    return equipmentName;
  }

  if (ad.type === 'MATERIAL' || ad.type === 'TOOL') {
    return getCategory(ad);
  }

  return getOwnerName(ad);
}

function getVacancyCompanyName(ad: PublicAdRecord): string | null {
  const companyName = ad.vacancyDetails?.companyName?.trim();

  if (companyName && companyName !== 'Работодатель' && companyName !== 'Работодатель Rabst24') {
    return companyName;
  }

  return getOwnerName(ad);
}

function getOwnerName(ad: PublicAdRecord): string | null {
  const fullName = [ad.owner.firstName, ad.owner.lastName].filter(Boolean).join(' ').trim();

  return ad.owner.displayName || fullName || ad.owner.maxUsername || null;
}

function getCategory(ad: PublicAdRecord): string | null {
  return ad.categoryText ?? ad.equipmentDetails?.categoryText ?? null;
}

function getLocationShort(ad: PublicAdRecord): string | null {
  return getAddress(ad) ?? ad.districtText ?? ad.city ?? null;
}

function getAddress(ad: PublicAdRecord): string | null {
  return getMetadataString(parseJsonRecord(ad.metadataJson), ['address', 'addressText', 'fullAddress', 'locationAddress']);
}

function getMetadataMetroStations(ad: PublicAdRecord) {
  const metadata = parseJsonRecord(ad.metadataJson);
  const stations = metadata?.metroStations;

  if (!Array.isArray(stations)) {
    return [];
  }

  return stations
    .map((station, index) => {
      if (!station || typeof station !== 'object' || Array.isArray(station)) {
        return null;
      }

      const record = station as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';

      if (!name) {
        return null;
      }

      return {
        id: `manual-${index}-${name}`,
        city: ad.city ?? '',
        name,
        lineName: typeof record.lineName === 'string' ? record.lineName : null,
        lineColor: typeof record.lineColor === 'string' ? record.lineColor : null,
        walkingMinutes: typeof record.walkingMinutes === 'number' ? record.walkingMinutes : null
      };
    })
    .filter((station): station is NonNullable<typeof station> => Boolean(station));
}

function getShortSalary(ad: PublicAdRecord): string | null {
  if (ad.vacancyDetails) {
    return formatMoneyRange({
      from: ad.vacancyDetails.salaryFrom?.toString() ?? null,
      to: ad.vacancyDetails.salaryTo?.toString() ?? null,
      currency: ad.vacancyDetails.salaryCurrency,
      period: serializeNullableEnum(ad.vacancyDetails.salaryPeriod),
      isNegotiable: ad.vacancyDetails.isSalaryNegotiable
    });
  }

  if (ad.resumeDetails?.expectedSalary) {
    return formatMoneyValue(ad.resumeDetails.expectedSalary.toString(), ad.resumeDetails.salaryCurrency);
  }

  if (ad.equipmentDetails?.rentalPrice) {
    return formatMoneyValue(ad.equipmentDetails.rentalPrice.toString(), ad.equipmentDetails.currency);
  }

  if (ad.equipmentDetails?.salePrice) {
    return formatMoneyValue(ad.equipmentDetails.salePrice.toString(), ad.equipmentDetails.currency);
  }

  return ad.priceAmount ? formatMoneyValue(ad.priceAmount.toString(), ad.currency) : null;
}

function formatMoneyRange(input: {
  from: string | null;
  to: string | null;
  currency: string;
  period: string | null;
  isNegotiable: boolean;
}): string | null {
  if (input.isNegotiable && !input.from && !input.to) {
    return '\u043f\u043e \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u0438';
  }

  const suffix = formatMoneySuffix(input.currency, input.period);

  if (input.from && input.to) {
    return `${input.from}-${input.to} ${suffix}`;
  }

  if (input.from) {
    return `\u043e\u0442 ${input.from} ${suffix}`;
  }

  if (input.to) {
    return `\u0434\u043e ${input.to} ${suffix}`;
  }

  return input.isNegotiable ? '\u043f\u043e \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u0438' : null;
}

function formatMoneyValue(amount: string, currency: string): string {
  return `${amount} ${formatCurrency(currency)}`;
}

function formatMoneySuffix(currency: string, period: string | null): string {
  const currencyLabel = formatCurrency(currency);
  const periodLabel = formatSalaryPeriod(period);

  return periodLabel ? `${currencyLabel} / ${periodLabel}` : currencyLabel;
}

function formatCurrency(currency: string): string {
  return currency.toUpperCase() === 'RUB' ? '\u20bd' : currency;
}

function formatSalaryPeriod(period: string | null): string | null {
  if (!period) {
    return null;
  }

  const labels: Record<string, string> = {
    hour: '\u0447\u0430\u0441',
    day: '\u0434\u0435\u043d\u044c',
    week: '\u043d\u0435\u0434\u0435\u043b\u044f',
    month: '\u043c\u0435\u0441\u044f\u0446',
    project: '\u043f\u0440\u043e\u0435\u043a\u0442'
  };

  return labels[period.toLowerCase()] ?? period;
}

function getCoverPhoto(photos: PublicAdRecord['photos']): PublicAdRecord['photos'][number] | undefined {
  return photos.find((photo) => !photo.mimeType || photo.mimeType.startsWith('image/')) ?? photos[0];
}

function getCardChips(ad: PublicAdRecord): PublicAdChipDto[] {
  const chips: PublicAdChipDto[] = [];
  const hasSalary = Boolean(getShortSalary(ad));

  if (
    ad.vacancyDetails?.schedule &&
    !(hasSalary && isDefaultVacancyChip(ad.vacancyDetails.schedule, ['\u043f\u043e \u0434\u043e\u0433\u043e\u0432\u043e\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u0438']))
  ) {
    chips.push({
      key: 'schedule',
      label: '\u0413\u0440\u0430\u0444\u0438\u043a',
      value: ad.vacancyDetails.schedule
    });
  }

  if (
    ad.vacancyDetails?.experience &&
    !(hasSalary && isDefaultVacancyChip(ad.vacancyDetails.experience, ['\u043e\u0431\u0441\u0443\u0436\u0434\u0430\u0435\u0442\u0441\u044f']))
  ) {
    chips.push({
      key: 'experience',
      label: '\u041e\u043f\u044b\u0442',
      value: ad.vacancyDetails.experience
    });
  }

  if (ad.resumeDetails?.experienceYears !== null && ad.resumeDetails?.experienceYears !== undefined) {
    chips.push({
      key: 'experience_years',
      label: '\u041e\u043f\u044b\u0442',
      value: String(ad.resumeDetails.experienceYears)
    });
  }

  if (ad.equipmentDetails?.condition) {
    chips.push({
      key: 'condition',
      label: '\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435',
      value: serializeNullableEnum(ad.equipmentDetails.condition) ?? ad.equipmentDetails.condition
    });
  }

  if ((ad.type === 'MATERIAL' || ad.type === 'TOOL') && ad.priceAmount) {
    chips.push({
      key: 'price',
      label: '\u0426\u0435\u043d\u0430',
      value: formatMoneyValue(ad.priceAmount.toString(), ad.currency)
    });
  }

  return chips;
}

function isDefaultVacancyChip(value: string, defaults: string[]): boolean {
  const normalized = normalizeVacancyChip(value);
  return defaults.some((defaultValue) => normalized === normalizeVacancyChip(defaultValue));
}

function normalizeVacancyChip(value: string): string {
  return value.trim().toLowerCase().replace(/\u0451/g, '\u0435').replace(/\s+/g, ' ');
}

function serializeAdType(type: string): AdTypeCode {
  return type.toLowerCase() as AdTypeCode;
}

function serializeNullableEnum(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function getMetadataString(metadata: unknown, keys: string[]): string | null {
  const record = getMetadataRecord(metadata);

  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    return getMetadataRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
