import type { AdTypeCode } from '../domain/ad.js';

export interface PublicAdPhotoDto {
  id: string;
  url: string;
  previewUrl: string | null;
  mimeType: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PublicAdContactDto {
  id: string;
  type: string;
  label: string | null;
  value: string;
  isPreferred: boolean;
}

export interface PublicMetroStationDto {
  id: string;
  city: string;
  name: string;
  lineName: string | null;
  lineColor: string | null;
  walkingMinutes: number | null;
}

export interface PublicAdChipDto {
  key: string;
  label: string;
  value: string;
}

export interface PublicAdCardDto {
  id: string;
  type: AdTypeCode;
  title: string;
  description: string | null;
  subtitle: string | null;
  coverPhoto: PublicAdPhotoDto | null;
  shortSalary: string | null;
  locationShort: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  category: string | null;
  chips: PublicAdChipDto[];
  publishedAt: string | null;
  createdAt: string;
}

export interface PublicAdBaseDetailDto extends PublicAdCardDto {
  status: string;
  description: string | null;
  photos: PublicAdPhotoDto[];
  contacts: PublicAdContactDto[];
  owner: {
    id: string;
    displayName: string | null;
    maxUsername: string | null;
  };
  updatedAt: string;
}

export interface PublicVacancyDetailDto extends PublicAdBaseDetailDto {
  type: 'vacancy';
  vacancy: {
    companyName: string | null;
    position: string | null;
    employmentType: string | null;
    workFormat: string | null;
    schedule: string | null;
    experience: string | null;
    education: string | null;
    salaryFrom: string | null;
    salaryTo: string | null;
    salaryCurrency: string;
    salaryPeriod: string | null;
    isSalaryNegotiable: boolean;
    metroStations: PublicMetroStationDto[];
  };
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
}

export interface PublicResumeDetailDto extends PublicAdBaseDetailDto {
  type: 'resume';
  resume: {
    name: string;
    profession: string | null;
    desiredPosition: string | null;
    experienceText: string | null;
    experienceYears: number | null;
    employmentType: string | null;
    workFormat: string | null;
    expectedSalary: string | null;
    salaryCurrency: string;
    skills: string[];
    education: string | null;
    availability: string | null;
    portfolioUrl: string | null;
  };
}

export interface PublicEquipmentDetailDto extends PublicAdBaseDetailDto {
  type: 'equipment';
  equipment: {
    name: string;
    category: string | null;
    condition: string | null;
    brand: string | null;
    model: string | null;
    productionYear: number | null;
    rentalPrice: string | null;
    salePrice: string | null;
    depositAmount: string | null;
    currency: string;
    availability: string | null;
  };
}

export interface PublicProductDetailDto extends PublicAdBaseDetailDto {
  type: 'material' | 'tool';
  product: {
    name: string;
    category: string | null;
    price: string | null;
    currency: string;
    address: string | null;
  };
}

export type PublicAdDetailDto =
  | PublicVacancyDetailDto
  | PublicResumeDetailDto
  | PublicEquipmentDetailDto
  | PublicProductDetailDto;

export interface PublicAdListMetaDto extends Record<string, unknown> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  sort: 'newest';
}
