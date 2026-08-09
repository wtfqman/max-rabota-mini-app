import type { VacancyPublicationFundingMode, VacancyPublicationPlanCode } from '@rabst24/shared';
import {
  createEquipmentPayloadSchema,
  type CreateEquipmentPayload,
  type CreateEquipmentResponse
} from '../../equipment/create-equipment.types.js';
import {
  createProductPayloadSchema,
  type CreateProductPayload,
  type CreateProductResponse,
  type ProductType
} from '../../products/create-product.types.js';
import {
  createResumePayloadSchema,
  type CreateResumePayload,
  type CreateResumeResponse
} from '../../resumes/create-resume.types.js';
import {
  createVacancyPayloadSchema,
  type CreateVacancyPayload,
  type CreateVacancyResponse,
  type UploadedPhoto
} from '../../vacancies/create-vacancy.types.js';
import { normalizeAdMedia } from '../../uploads/upload-flow.js';
import type { OwnedAdCard, PublicAdType } from '../ad.types.js';
import { apiClient } from '../../../shared/api/client.js';

export type CreateAdKind = 'vacancy' | 'resume' | 'equipment' | ProductType;

export interface AdCategoryFormState {
  name: string;
  specialty: string;
  description: string;
  money: string;
  contact: string;
  address: string;
  categoryText: string;
}

export type AdCategoryFormErrors = Partial<Record<keyof AdCategoryFormState | 'form', string>>;
export type SimpleCreateResponse =
  | CreateVacancyResponse
  | CreateResumeResponse
  | CreateEquipmentResponse
  | CreateProductResponse;

export type AdFormPhotoPayload = {
  storageKey: string;
  url: string;
  previewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  altText?: string;
};

export type AdFormContactPayload = {
  type: 'MAX' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'OTHER';
  value: string;
  label?: string;
  isPreferred?: boolean;
};

export type AdRevisionUpdatePayload = {
  title?: string;
  description?: string | null;
  city?: string | null;
  districtText?: string | null;
  categoryText?: string | null;
  priceAmount?: number | null;
  desiredPosition?: string | null;
  metadata?: Record<string, unknown>;
  photos?: AdFormPhotoPayload[];
  contacts?: AdFormContactPayload[];
  requirements?: string[];
  responsibilities?: string[];
  benefits?: string[];
  vacancy?: Record<string, unknown>;
  resume?: Record<string, unknown>;
  equipment?: Record<string, unknown>;
  product?: Record<string, unknown>;
};

export const categoryPayloadSchemas = {
  vacancy: createVacancyPayloadSchema,
  resume: createResumePayloadSchema,
  equipment: createEquipmentPayloadSchema,
  material: createProductPayloadSchema,
  tool: createProductPayloadSchema
} as const;

export const initialAdForm: AdCategoryFormState = {
  name: '',
  specialty: '',
  description: '',
  money: '',
  contact: '',
  address: '',
  categoryText: ''
};

export async function submitByKind(
  kind: CreateAdKind,
  form: AdCategoryFormState,
  uploadedPhotos: UploadedPhoto[],
  selectedPlan: VacancyPublicationPlanCode,
  vacancyFunding: VacancyPublicationFundingMode,
  verifiedContact?: { verifiedContactId: string; contactConsentId: string } | null
): Promise<SimpleCreateResponse> {
  if (kind === 'vacancy') {
    const response = await apiClient.createVacancy(buildVacancyPayload(form, uploadedPhotos, selectedPlan, vacancyFunding));
    return response.data;
  }

  if (kind === 'resume') {
    const response = await apiClient.createResume(buildResumePayload(form, uploadedPhotos, verifiedContact));
    return response.data;
  }

  if (kind === 'equipment') {
    const response = await apiClient.createEquipment(buildEquipmentPayload(form, uploadedPhotos));
    return response.data;
  }

  const payload = buildProductPayload(form, uploadedPhotos);
  if (kind === 'material') {
    const response = await apiClient.createMaterial(payload);
    return response.data;
  }

  const response = await apiClient.createTool(payload);
  return response.data;
}

export function buildAdRevisionUpdatePayload(
  kind: PublicAdType,
  form: AdCategoryFormState,
  uploadedPhotos: UploadedPhoto[]
): AdRevisionUpdatePayload {
  if (kind === 'vacancy') {
    const payload = buildVacancyPayload(form, uploadedPhotos, 'single', 'auto');
    return {
      title: payload.title,
      description: payload.description,
      categoryText: payload.categoryText ?? null,
      metadata: {
        address: payload.address,
        salaryText: payload.salaryText
      },
      photos: payload.photos,
      contacts: payload.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      vacancy: {
        position: payload.title,
        salaryCurrency: 'RUB',
        isSalaryNegotiable: payload.isSalaryNegotiable
      }
    };
  }

  if (kind === 'resume') {
    const payload = buildResumePayload(form, uploadedPhotos);
    return {
      title: payload.name,
      description: payload.description,
      desiredPosition: payload.profession,
      metadata: {
        address: payload.address
      },
      photos: payload.photos,
      contacts: payload.contacts,
      resume: {
        desiredPosition: payload.profession,
        profession: payload.profession,
        expectedSalary: payload.expectedSalary,
        salaryCurrency: 'RUB'
      }
    };
  }

  if (kind === 'equipment') {
    const payload = buildEquipmentPayload(form, uploadedPhotos);
    return {
      title: payload.title,
      description: payload.description,
      priceAmount: payload.priceAmount ?? null,
      metadata: {
        address: payload.address
      },
      photos: payload.photos,
      contacts: payload.contacts,
      equipment: {
        currency: 'RUB'
      }
    };
  }

  const payload = buildProductPayload(form, uploadedPhotos);
  return {
    title: payload.title,
    description: payload.description,
    categoryText: payload.categoryText ?? null,
    priceAmount: payload.priceAmount ?? null,
    metadata: {
      address: payload.address
    },
    photos: payload.photos,
    contacts: payload.contacts,
    product: {}
  };
}

export function buildVacancyPayload(
  form: AdCategoryFormState,
  uploadedPhotos: UploadedPhoto[],
  selectedPlan: VacancyPublicationPlanCode,
  vacancyFunding: VacancyPublicationFundingMode
): CreateVacancyPayload {
  return {
    title: form.name.trim(),
    address: form.address.trim(),
    categoryText: form.name.trim(),
    salaryText: form.money.trim(),
    isSalaryNegotiable: false,
    publicationPlan: selectedPlan,
    publicationFunding: vacancyFunding,
    description: form.description.trim(),
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

export function buildResumePayload(
  form: AdCategoryFormState,
  uploadedPhotos: UploadedPhoto[],
  verifiedContact?: { verifiedContactId: string; contactConsentId: string } | null
): CreateResumePayload {
  return {
    name: form.name.trim(),
    profession: form.specialty.trim(),
    description: form.description.trim(),
    expectedSalary: parseMoney(form.money),
    address: form.address.trim() || undefined,
    contacts: verifiedContact ? [] : [buildContact(form.contact)],
    verifiedContactId: verifiedContact?.verifiedContactId,
    contactConsentId: verifiedContact?.contactConsentId,
    photos: mapPhotos(uploadedPhotos)
  };
}

export function buildEquipmentPayload(form: AdCategoryFormState, uploadedPhotos: UploadedPhoto[]): CreateEquipmentPayload {
  return {
    title: form.name.trim(),
    priceAmount: parseMoney(form.money),
    description: form.description.trim(),
    address: form.address.trim(),
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

export function buildProductPayload(form: AdCategoryFormState, uploadedPhotos: UploadedPhoto[]): CreateProductPayload {
  return {
    title: form.name.trim(),
    categoryText: form.categoryText.trim() || undefined,
    description: form.description.trim(),
    priceAmount: parseMoney(form.money),
    address: form.address.trim(),
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

export function createAdFormFromOwnedAd(ad: OwnedAdCard): { form: AdCategoryFormState; photos: UploadedPhoto[] } {
  const form: AdCategoryFormState = {
    ...initialAdForm,
    name: ad.title ?? '',
    specialty: ad.type === 'resume' ? ad.resume?.profession ?? ad.subtitle ?? '' : '',
    description: ad.description ?? '',
    money: getPrimaryMoney(ad),
    contact: ad.contacts?.find((contact) => contact.isPreferred)?.value ?? ad.contacts?.[0]?.value ?? '',
    address: ad.address ?? ad.product?.address ?? '',
    categoryText: ad.type === 'material' || ad.type === 'tool' ? ad.product?.category ?? ad.category ?? '' : ''
  };

  return {
    form,
    photos: (ad.photos ?? []).map((photo) => ({
      storageKey: photo.storageKey ?? photo.id,
      url: photo.url,
      previewUrl: photo.previewUrl,
      mimeType: photo.mimeType ?? 'image/jpeg',
      sizeBytes: 1,
      altText: photo.altText
    }))
  };
}

export function parseMoney(value: string): number | undefined {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function buildContact(value: string) {
  return {
    type: 'PHONE' as const,
    label: 'Контакты',
    value: value.trim(),
    isPreferred: true
  };
}

function mapPhotos(photos: UploadedPhoto[]) {
  return normalizeAdMedia(photos, 8, 1).map((photo) => ({
    storageKey: photo.storageKey,
    url: photo.url,
    previewUrl: photo.previewUrl ?? undefined,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    altText: photo.altText ?? undefined
  }));
}

function getPrimaryMoney(ad: OwnedAdCard): string {
  if (ad.type === 'vacancy') {
    return ad.shortSalary ?? ad.vacancy?.salaryFrom ?? '';
  }

  if (ad.type === 'resume') {
    return ad.resume?.expectedSalary ?? ad.shortSalary ?? '';
  }

  if (ad.type === 'equipment') {
    return ad.shortSalary ?? ad.equipment?.salePrice ?? '';
  }

  return ad.product?.price ?? ad.shortSalary ?? '';
}
