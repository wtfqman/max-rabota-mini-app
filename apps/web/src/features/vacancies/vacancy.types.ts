export interface PublicAdPhoto {
  id: string;
  url: string;
  previewUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PublicAdContact {
  id: string;
  type: string;
  label: string | null;
  value: string;
  isPreferred: boolean;
}

export interface PublicAdChip {
  key: string;
  label: string;
  value: string;
}

export interface PublicAdCard {
  id: string;
  type: 'vacancy' | 'resume' | 'equipment';
  title: string;
  subtitle: string | null;
  coverPhoto: PublicAdPhoto | null;
  shortSalary: string | null;
  locationShort: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  category: string | null;
  chips: PublicAdChip[];
  publishedAt: string | null;
  createdAt: string;
}

export interface VacancyListMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  sort: 'newest';
}

export interface VacancyListQuery {
  q?: string;
  category?: string;
  district?: string;
  schedule?: string;
  experience?: string;
  page?: number;
  perPage?: number;
}

export interface PublicMetroStation {
  id: string;
  city: string;
  name: string;
  lineName: string | null;
  lineColor: string | null;
  walkingMinutes: number | null;
}

export interface PublicVacancyDetail extends PublicAdCard {
  type: 'vacancy';
  status: string;
  description: string | null;
  photos: PublicAdPhoto[];
  contacts: PublicAdContact[];
  updatedAt: string;
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
    metroStations: PublicMetroStation[];
  };
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
}
