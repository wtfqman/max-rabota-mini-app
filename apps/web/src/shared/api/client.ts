import { apiRequest } from './http.js';
import type {
  VerifyMaxLaunchRequest,
  VerifyMaxLaunchResponse
} from '../../features/auth/auth.types.js';
import type {
  CreateVacancyPayload,
  CreateVacancyResponse,
  UploadedPhoto
} from '../../features/vacancies/create-vacancy.types.js';
import type {
  CreateResumePayload,
  CreateResumeResponse
} from '../../features/resumes/create-resume.types.js';
import type {
  CreateEquipmentPayload,
  CreateEquipmentResponse
} from '../../features/equipment/create-equipment.types.js';
import type {
  CreateProductPayload,
  CreateProductResponse
} from '../../features/products/create-product.types.js';
import type {
  PublicVacancyDetail,
  PublicAdCard,
  VacancyListMeta,
  VacancyListQuery
} from '../../features/vacancies/vacancy.types.js';
import type {
  FavoriteItem,
  ListMeta,
  ModerationActionResponse,
  MyAdsQuery,
  OwnedAdCard,
  PublicAdDetail,
  ReviewItem,
  UserProfilePayload
} from '../../features/ads/ad.types.js';

export interface ApiEnvelope<T, TMeta = Record<string, unknown>> {
  data: T;
  meta?: TMeta;
}

export const apiClient = {
  health: () => apiRequest<ApiEnvelope<{ status: string }>>('/health'),
  getMe: () => apiRequest<ApiEnvelope<UserProfilePayload>>('/users/me'),
  updateMe: (payload: { displayName?: string }) =>
    apiRequest<ApiEnvelope<{ id: string; displayName: string | null; updatedAt: string }>>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  verifyMaxLaunch: (payload: VerifyMaxLaunchRequest) =>
    apiRequest<ApiEnvelope<VerifyMaxLaunchResponse>>('/auth/max/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createDevSession: () =>
    apiRequest<ApiEnvelope<VerifyMaxLaunchResponse>>('/auth/dev/session', {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listVacancies: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/vacancies${toQueryString(query)}`),
  getVacancyDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicVacancyDetail>>(`/vacancies/${encodeURIComponent(adId)}`),
  listResumes: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/resumes${toQueryString(query)}`),
  getResumeDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/resumes/${encodeURIComponent(adId)}`),
  listEquipment: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/equipment${toQueryString(query)}`),
  getEquipmentDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/equipment/${encodeURIComponent(adId)}`),
  listMaterials: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/materials${toQueryString(query)}`),
  getMaterialDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/materials/${encodeURIComponent(adId)}`),
  listTools: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/tools${toQueryString(query)}`),
  getToolDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/tools/${encodeURIComponent(adId)}`),
  getAdDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/ads/${encodeURIComponent(adId)}`),
  listMyAds: (query: MyAdsQuery) =>
    apiRequest<ApiEnvelope<OwnedAdCard[], ListMeta>>(`/ads/my${toQueryString(query)}`),
  updateMyAd: (adId: string, payload: { title?: string; description?: string | null; city?: string | null; districtText?: string | null; categoryText?: string | null }) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/ads/${encodeURIComponent(adId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  hideMyAd: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/ads/${encodeURIComponent(adId)}/hide`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  resubmitMyAd: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/ads/${encodeURIComponent(adId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listFavorites: () => apiRequest<ApiEnvelope<FavoriteItem[]>>('/favorites'),
  addFavorite: (adId: string) =>
    apiRequest<ApiEnvelope<{ id: string; adId: string; createdAt: string }>>(`/favorites/${encodeURIComponent(adId)}`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  removeFavorite: (adId: string) =>
    apiRequest<null>(`/favorites/${encodeURIComponent(adId)}`, {
      method: 'DELETE'
    }),
  listMyReviews: () => apiRequest<ApiEnvelope<ReviewItem[]>>('/reviews/me'),
  listUserReviews: (userId: string) =>
    apiRequest<ApiEnvelope<ReviewItem[]>>(`/reviews/users/${encodeURIComponent(userId)}`),
  createReview: (userId: string, payload: { rating?: number; text?: string; adId?: string }) =>
    apiRequest<ApiEnvelope<{ id: string; subjectId: string; rating: number; text: string | null; createdAt: string }>>(
      `/reviews/users/${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),
  listModerationQueue: (query: MyAdsQuery) =>
    apiRequest<ApiEnvelope<PublicAdDetail[], ListMeta>>(`/moderation/queue${toQueryString(query)}`),
  getModerationPreview: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/moderation/ads/${encodeURIComponent(adId)}`),
  approveModerationAd: (adId: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  rejectModerationAd: (adId: string, reason: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  hideModerationAd: (adId: string, reason?: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/hide`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  listCategorySuggestions: (q?: string) =>
    apiRequest<ApiEnvelope<Array<{ value: string; aliases: string[] }>>>(`/references/categories${toQueryString({ q })}`),
  listDistrictSuggestions: (q?: string) =>
    apiRequest<ApiEnvelope<Array<{ value: string; aliases: string[] }>>>(`/references/districts${toQueryString({ q })}`),
  uploadPhoto: (payload: { fileName: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; dataUrl: string; altText?: string }) =>
    apiRequest<ApiEnvelope<UploadedPhoto>>('/uploads/photos', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createVacancy: (payload: CreateVacancyPayload) =>
    apiRequest<ApiEnvelope<CreateVacancyResponse>>('/vacancies', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createResume: (payload: CreateResumePayload) =>
    apiRequest<ApiEnvelope<CreateResumeResponse>>('/resumes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createEquipment: (payload: CreateEquipmentPayload) =>
    apiRequest<ApiEnvelope<CreateEquipmentResponse>>('/equipment', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createMaterial: (payload: CreateProductPayload) =>
    apiRequest<ApiEnvelope<CreateProductResponse>>('/materials', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createTool: (payload: CreateProductPayload) =>
    apiRequest<ApiEnvelope<CreateProductResponse>>('/tools', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};

function toQueryString(query: VacancyListQuery | Record<string, unknown>): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}
