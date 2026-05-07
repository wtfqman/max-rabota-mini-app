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
    coverPhoto: serializePhoto(ad.photos[0]),
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
        companyName: ad.vacancyDetails?.companyName ?? null,
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
  if (ad.vacancyDetails?.companyName) {
    return ad.vacancyDetails.companyName;
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

  return ad.owner.displayName ?? ([ad.owner.firstName, ad.owner.lastName].filter(Boolean).join(' ') || null);
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
    return `${ad.resumeDetails.expectedSalary.toString()} ${ad.resumeDetails.salaryCurrency}`;
  }

  if (ad.equipmentDetails?.rentalPrice) {
    return `${ad.equipmentDetails.rentalPrice.toString()} ${ad.equipmentDetails.currency}`;
  }

  if (ad.equipmentDetails?.salePrice) {
    return `${ad.equipmentDetails.salePrice.toString()} ${ad.equipmentDetails.currency}`;
  }

  return ad.priceAmount ? `${ad.priceAmount.toString()} ${ad.currency}` : null;
}

function formatMoneyRange(input: {
  from: string | null;
  to: string | null;
  currency: string;
  period: string | null;
  isNegotiable: boolean;
}): string | null {
  if (input.isNegotiable && !input.from && !input.to) {
    return 'negotiable';
  }

  const suffix = `${input.currency}${input.period ? ` / ${input.period}` : ''}`;

  if (input.from && input.to) {
    return `${input.from}-${input.to} ${suffix}`;
  }

  if (input.from) {
    return `from ${input.from} ${suffix}`;
  }

  if (input.to) {
    return `up to ${input.to} ${suffix}`;
  }

  return input.isNegotiable ? 'negotiable' : null;
}

function getCardChips(ad: PublicAdRecord): PublicAdChipDto[] {
  const chips: PublicAdChipDto[] = [];

  if (ad.vacancyDetails?.schedule) {
    chips.push({
      key: 'schedule',
      label: 'Schedule',
      value: ad.vacancyDetails.schedule
    });
  }

  if (ad.vacancyDetails?.experience) {
    chips.push({
      key: 'experience',
      label: 'Experience',
      value: ad.vacancyDetails.experience
    });
  }

  if (ad.resumeDetails?.experienceYears !== null && ad.resumeDetails?.experienceYears !== undefined) {
    chips.push({
      key: 'experience_years',
      label: 'Experience',
      value: String(ad.resumeDetails.experienceYears)
    });
  }

  if (ad.equipmentDetails?.condition) {
    chips.push({
      key: 'condition',
      label: 'Состояние',
      value: serializeNullableEnum(ad.equipmentDetails.condition) ?? ad.equipmentDetails.condition
    });
  }

  if ((ad.type === 'MATERIAL' || ad.type === 'TOOL') && ad.priceAmount) {
    chips.push({
      key: 'price',
      label: 'Цена',
      value: `${ad.priceAmount.toString()} ${ad.currency}`
    });
  }

  return chips;
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
