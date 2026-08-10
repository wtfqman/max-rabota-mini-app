import { apiRequest, apiTextRequest } from './http.js';
import type { PublicFeatureFlags } from '@rabst24/shared';
import type {
  VerifyMaxLaunchRequest,
  VerifyMaxLaunchResponse
} from '../../features/auth/auth.types.js';
import type {
  CreateVacancyPayload,
  CreateVacancyResponse,
  UploadedPhoto
} from '../../features/vacancies/create-vacancy.types.js';
import type { UploadMediaMimeType } from '../../features/uploads/upload-flow.js';
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
  AdFormContactPayload,
  AdFormPhotoPayload,
  AdRevisionUpdatePayload
} from '../../features/ads/form/ad-form.model.js';
import type {
  PublicVacancyDetail,
  PublicAdCard,
  VacancyListMeta,
  VacancyListQuery
} from '../../features/vacancies/vacancy.types.js';
import type {
  FavoriteItem,
  AdRevisionSummary,
  AdLifecycleActionResponse,
  AdAnalyticsSummary,
  AdminFinanceDashboard,
  EditableProfile,
  ListMeta,
  ModerationActionResponse,
  ModerationAdDetail,
  ModerationQueueQuery,
  MyAdsQuery,
  OwnedAdCard,
  OwnedAdPayment,
  PublicAdDetail,
  PublicAdType,
  PublicUserProfile,
  ReviewItem,
  TeamUser,
  TrustBadge,
  TrustBadgeAdminState,
  UpdateOwnedAdResponse,
  UserPaymentOperation,
  UserProfilePayload
} from '../../features/ads/ad.types.js';
import type { PublicationSettings } from '../../features/ads/publication-settings.js';
import type {
  NotificationListMeta,
  NotificationPreferences,
  UserNotification
} from '../../features/notifications/notification.types.js';
import type {
  SavedSearch,
  SavedSearchAdType,
  SavedSearchFrequency
} from '../../features/saved-searches/saved-search.types.js';
import type {
  PromotionProduct,
  PromotionProductType,
  PromotionPurchase
} from '../../features/promotions/promotion.types.js';
import type {
  CreateJobApplicationPayload,
  JobApplication,
  JobApplicationStatus
} from '../../features/applications/application.types.js';
import type {
  AdReportAction,
  AdReportStatus,
  CreateAdReportPayload,
  CreateAdReportResponse,
  ModerationAdReport
} from '../../features/reports/report.types.js';

type AdAnalyticsEventType =
  | 'card_open'
  | 'favorite_add'
  | 'favorite_remove'
  | 'contact_open'
  | 'phone_click'
  | 'email_click'
  | 'max_click'
  | 'website_click'
  | 'application_sent'
  | 'resume_contact_unlock_purchased'
  | 'promotion_purchased';

export interface AdminAdAnalyticsDashboard {
  days: number;
  activeUsers: number;
  publishedAds: number;
  totals: AdAnalyticsSummary['totals'];
  conversion: AdAnalyticsSummary['conversion'];
  popularCategories: Array<{ type: PublicAdType; category: string; ads: number }>;
  popularProfessions: Array<{ type: PublicAdType; profession: string; ads: number }>;
  topAds: Array<{
    id: string;
    title: string;
    type: PublicAdType;
    category: string | null;
    totals: AdAnalyticsSummary['totals'];
  }>;
}

export interface TelegramTargetSettings {
  id: string;
  username: string;
  chatId: string | null;
  messageThreadId: string | null;
  title: string | null;
  type: 'CHANNEL' | 'GROUP' | 'SUPERGROUP';
  status: 'READY' | 'NOT_ADDED' | 'NO_PERMISSION' | 'UNAVAILABLE' | 'DISABLED' | 'TESTING' | 'ERROR';
  enabled: boolean;
  testTarget: boolean;
  publishEnabled: boolean;
  editEnabled: boolean;
  deleteEnabled: boolean;
  botIsMember: boolean;
  botIsAdmin: boolean;
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canSendMediaMessages: boolean;
  canManageTopics: boolean;
  lastPermissionCheckAt: string | null;
  lastSuccessfulPublishAt: string | null;
  lastError: string | null;
}

export interface ApiEnvelope<T, TMeta = Record<string, unknown>> {
  data: T;
  meta?: TMeta;
}

export const apiClient = {
  health: () => apiRequest<ApiEnvelope<{ status: string }>>('/health'),
  getFeatures: () => apiRequest<ApiEnvelope<{ flags: PublicFeatureFlags }>>('/features'),
  getMe: () => apiRequest<ApiEnvelope<UserProfilePayload>>('/users/me'),
  getMyProfile: () => apiRequest<ApiEnvelope<EditableProfile>>('/profiles/me'),
  updateMyProfile: (payload: Partial<Omit<EditableProfile, 'id' | 'createdAt' | 'updatedAt'>>) =>
    apiRequest<ApiEnvelope<EditableProfile>>('/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  getPublicProfile: (userId: string) =>
    apiRequest<ApiEnvelope<PublicUserProfile>>(`/users/${encodeURIComponent(userId)}`),
  listTrustBadgesAdmin: (userId: string) =>
    apiRequest<ApiEnvelope<TrustBadgeAdminState>>(`/profiles/admin/users/${encodeURIComponent(userId)}/badges`),
  updateTrustBadgeAdmin: (userId: string, badge: TrustBadge, payload: { enabled: boolean; reason?: string | null }) =>
    apiRequest<ApiEnvelope<TrustBadgeAdminState>>(
      `/profiles/admin/users/${encodeURIComponent(userId)}/badges/${encodeURIComponent(badge)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    ),
  updateMe: (payload: { displayName?: string }) =>
    apiRequest<ApiEnvelope<{ id: string; displayName: string | null; updatedAt: string }>>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  listPaymentHistory: (query: { page?: number; perPage?: number } = {}) =>
    apiRequest<ApiEnvelope<UserPaymentOperation[], ListMeta>>(`/payments/history${toQueryString(query)}`),
  getAdminFinance: (query: { from?: string; to?: string } = {}) =>
    apiRequest<ApiEnvelope<AdminFinanceDashboard>>(`/payments/admin/finance${toQueryString(query)}`),
  exportAdminFinanceCsv: (query: { from?: string; to?: string } = {}) =>
    apiTextRequest(`/payments/admin/finance.csv${toQueryString(query)}`),
  listTeamUsers: (query: { q?: string; role?: 'user' | 'moderator' | 'admin' }) =>
    apiRequest<ApiEnvelope<TeamUser[]>>(`/users/team${toQueryString(query)}`),
  updateTeamUserRole: (userId: string, role: 'user' | 'moderator' | 'admin') =>
    apiRequest<ApiEnvelope<{ id: string; role: 'user' | 'moderator' | 'admin'; updatedAt: string }>>(
      `/users/${encodeURIComponent(userId)}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role })
      }
    ),
  updateTeamUserStatus: (userId: string, status: 'active' | 'blocked') =>
    apiRequest<
      ApiEnvelope<{
        id: string;
        status: 'active' | 'blocked' | 'deleted';
        updatedAt: string;
        hiddenAdsTotal?: number;
        channelRemoval?: {
          attempted: number;
          removed: number;
          failed: number;
          skipped: number;
        } | null;
      }>
    >(`/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
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
  listAds: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/ads${toQueryString(query)}`),
  getVacancyDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicVacancyDetail>>(`/vacancies/${encodeURIComponent(adId)}`),
  listResumes: (query: VacancyListQuery) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(`/resumes${toQueryString(query)}`),
  getResumeDetails: (adId: string) =>
    apiRequest<ApiEnvelope<PublicAdDetail>>(`/resumes/${encodeURIComponent(adId)}`),
  getResumeContactPurchaseStatus: (adId: string) =>
    apiRequest<ApiEnvelope<{ canViewContacts: boolean; alreadyPurchased: boolean; unlockStatus: string | null }>>(
      `/resume-contact-purchases/${encodeURIComponent(adId)}`
    ),
  createResumeContactPurchase: (adId: string) =>
    apiRequest<
      ApiEnvelope<{
        alreadyPurchased: boolean;
        payment: {
          id: string;
          paymentId: string;
          status: string;
          amount: string;
          currency: string;
          confirmationUrl: string | null;
          test: boolean;
        } | null;
      }>
    >(`/resume-contact-purchases/${encodeURIComponent(adId)}`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  verifyMaxMiniAppContact: (payload: { phone: string; authDate: string | number; hash: string; userId: string | number }) =>
    apiRequest<
      ApiEnvelope<{
        contact: {
          id: string;
          maskedValue: string;
          status: string;
          verifiedAt: string | null;
          expiresAt: string | null;
          activeConsent: { id: string } | null;
        };
        consent: { id: string; consentType: string; documentVersion: string; acceptedAt: string };
      }>
    >('/verified-contacts/max-mini-app', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  requestMaxBotContactVerification: () =>
    apiRequest<ApiEnvelope<{ sent: boolean }>>('/verified-contacts/max-bot/request', {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listVerifiedContacts: () =>
    apiRequest<
      ApiEnvelope<
        Array<{
          id: string;
          maskedValue: string;
          source: string;
          status: string;
          verifiedAt: string | null;
          expiresAt: string | null;
          activeConsent: { id: string } | null;
        }>
      >
    >('/verified-contacts/mine'),
  getResumeProtectedContact: (resumeAdId: string) =>
    apiRequest<ApiEnvelope<{ accessMode: string; phone: string | null; maskedContact: string | null; message?: string }>>(
      `/verified-contacts/resumes/${encodeURIComponent(resumeAdId)}/contact`
    ),
  sendResumeConnectionRequest: (resumeAdId: string) =>
    apiRequest<ApiEnvelope<{ sent: boolean }>>(`/verified-contacts/resumes/${encodeURIComponent(resumeAdId)}/connection-request`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
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
  updateMyAd: (
    adId: string,
    payload: AdRevisionUpdatePayload & {
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
    }
  ) =>
    apiRequest<ApiEnvelope<UpdateOwnedAdResponse>>(`/ads/${encodeURIComponent(adId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  listAdRevisions: (adId: string) =>
    apiRequest<ApiEnvelope<AdRevisionSummary[]>>(`/ads/${encodeURIComponent(adId)}/revisions`),
  cancelAdRevision: (adId: string) =>
    apiRequest<ApiEnvelope<{ revision: AdRevisionSummary | null }>>(`/ads/${encodeURIComponent(adId)}/revisions/active`, {
      method: 'DELETE'
    }),
  updatePublicationSettings: (
    adId: string,
    payload: Pick<PublicationSettings, 'autoRepeat' | 'repeatPeriod' | 'activePeriod' | 'remindBeforeEnd'>
  ) =>
    apiRequest<ApiEnvelope<{ ad: PublicAdDetail; publicationSettings: PublicationSettings | null }>>(
      `/ads/${encodeURIComponent(adId)}/publication-settings`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    ),
  hideMyAd: (adId: string) =>
    apiRequest<ApiEnvelope<AdLifecycleActionResponse>>(`/ads/${encodeURIComponent(adId)}/hide`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  archiveMyAd: (adId: string) =>
    apiRequest<ApiEnvelope<AdLifecycleActionResponse>>(`/ads/${encodeURIComponent(adId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  deleteMyAd: (adId: string) =>
    apiRequest<ApiEnvelope<AdLifecycleActionResponse>>(`/ads/${encodeURIComponent(adId)}`, {
      method: 'DELETE',
      body: JSON.stringify({})
    }),
  resubmitMyAd: (adId: string, payload: { publicationPlan?: string; publicationFunding?: string } = {}) =>
    apiRequest<ApiEnvelope<AdLifecycleActionResponse>>(`/ads/${encodeURIComponent(adId)}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createJobApplication: (vacancyAdId: string, payload: CreateJobApplicationPayload) =>
    apiRequest<ApiEnvelope<JobApplication>>(`/applications/vacancies/${encodeURIComponent(vacancyAdId)}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listMyJobApplications: (query: { status?: JobApplicationStatus } = {}) =>
    apiRequest<ApiEnvelope<JobApplication[]>>(`/applications/mine${toQueryString(query)}`),
  getJobApplication: (applicationId: string) =>
    apiRequest<ApiEnvelope<JobApplication>>(`/applications/${encodeURIComponent(applicationId)}`),
  withdrawJobApplication: (applicationId: string) =>
    apiRequest<ApiEnvelope<JobApplication>>(`/applications/${encodeURIComponent(applicationId)}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listVacancyApplications: (vacancyAdId: string, query: { status?: JobApplicationStatus } = {}) =>
    apiRequest<ApiEnvelope<JobApplication[]>>(
      `/applications/vacancies/${encodeURIComponent(vacancyAdId)}${toQueryString(query)}`
    ),
  updateJobApplicationStatus: (
    applicationId: string,
    status: Extract<JobApplicationStatus, 'viewed' | 'contacted' | 'suitable' | 'rejected'>
  ) =>
    apiRequest<ApiEnvelope<JobApplication>>(`/applications/${encodeURIComponent(applicationId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  recordAdAnalyticsEvent: (payload: { adId: string; eventType: AdAnalyticsEventType; internal?: boolean }) =>
    apiRequest<ApiEnvelope<{ recorded: boolean; uniqueView: boolean }>>('/ad-analytics/events', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        sessionId: getAnalyticsSessionId()
      })
    }),
  getOwnerAdAnalytics: (adId: string, days = 30) =>
    apiRequest<ApiEnvelope<AdAnalyticsSummary>>(
      `/ad-analytics/ads/${encodeURIComponent(adId)}/owner${toQueryString({ days })}`
    ),
  getAdminAdAnalytics: (days = 30) =>
    apiRequest<ApiEnvelope<AdminAdAnalyticsDashboard>>(`/ad-analytics/admin${toQueryString({ days })}`),
  createAdReport: (payload: CreateAdReportPayload) =>
    apiRequest<ApiEnvelope<CreateAdReportResponse>>('/ad-reports', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listModerationReports: (query: { status?: AdReportStatus; page?: number; perPage?: number } = {}) =>
    apiRequest<ApiEnvelope<ModerationAdReport[], ListMeta>>(`/ad-reports/moderation${toQueryString(query)}`),
  resolveAdReport: (
    reportId: string,
    payload: { action: AdReportAction; resolution: string; tempBlockDays?: number }
  ) =>
    apiRequest<ApiEnvelope<ModerationAdReport>>(`/ad-reports/${encodeURIComponent(reportId)}/actions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listNotifications: (query: { unread?: boolean; limit?: number; cursor?: string } = {}) =>
    apiRequest<ApiEnvelope<UserNotification[], NotificationListMeta>>(`/notifications${toQueryString(query)}`),
  markNotificationRead: (notificationId: string) =>
    apiRequest<ApiEnvelope<UserNotification>>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  markAllNotificationsRead: () =>
    apiRequest<ApiEnvelope<{ updated: number }>>('/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({})
    }),
  getNotificationPreferences: () => apiRequest<ApiEnvelope<NotificationPreferences>>('/notifications/preferences'),
  updateNotificationPreferences: (payload: Partial<NotificationPreferences>) =>
    apiRequest<ApiEnvelope<NotificationPreferences>>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  listSavedSearches: (query: { adType?: SavedSearchAdType } = {}) =>
    apiRequest<ApiEnvelope<SavedSearch[]>>(`/saved-searches${toQueryString(query)}`),
  createSavedSearch: (payload: {
    name: string;
    adType: SavedSearchAdType;
    query: Partial<VacancyListQuery>;
    notificationFrequency?: SavedSearchFrequency;
    enabled?: boolean;
  }) =>
    apiRequest<ApiEnvelope<SavedSearch>>('/saved-searches', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSavedSearch: (
    savedSearchId: string,
    payload: Partial<Pick<SavedSearch, 'name' | 'enabled' | 'notificationFrequency'>> & { query?: Partial<VacancyListQuery> }
  ) =>
    apiRequest<ApiEnvelope<SavedSearch>>(`/saved-searches/${encodeURIComponent(savedSearchId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteSavedSearch: (savedSearchId: string) =>
    apiRequest<null>(`/saved-searches/${encodeURIComponent(savedSearchId)}`, {
      method: 'DELETE'
    }),
  getSavedSearchResults: (savedSearchId: string, query: { page?: number; perPage?: number } = {}) =>
    apiRequest<ApiEnvelope<PublicAdCard[], VacancyListMeta>>(
      `/saved-searches/${encodeURIComponent(savedSearchId)}/results${toQueryString(query)}`
    ),
  listPromotionProductsForAd: (adId: string) =>
    apiRequest<ApiEnvelope<PromotionProduct[]>>(`/promotions/ads/${encodeURIComponent(adId)}/products`),
  listPromotionPurchasesForAd: (adId: string) =>
    apiRequest<ApiEnvelope<PromotionPurchase[]>>(`/promotions/ads/${encodeURIComponent(adId)}/purchases`),
  createPromotionPurchase: (adId: string, productType: PromotionProductType) =>
    apiRequest<ApiEnvelope<{ purchase: PromotionPurchase; payment: OwnedAdPayment | null }>>(
      `/promotions/ads/${encodeURIComponent(adId)}/purchases`,
      {
        method: 'POST',
        body: JSON.stringify({ productType })
      }
    ),
  listPromotionAdminProducts: () =>
    apiRequest<ApiEnvelope<PromotionProduct[]>>('/promotions/admin/products'),
  updatePromotionAdminProduct: (
    productType: PromotionProductType,
    payload: Partial<Pick<PromotionProduct, 'enabled' | 'durationHours' | 'applicableAdTypes' | 'configuration' | 'channelBehavior'>> & {
      price?: string | null;
    }
  ) =>
    apiRequest<ApiEnvelope<PromotionProduct>>(`/promotions/admin/products/${encodeURIComponent(productType)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  listTelegramTargets: () =>
    apiRequest<ApiEnvelope<TelegramTargetSettings[]>>('/telegram-sync/targets'),
  checkTelegramTargets: () =>
    apiRequest<ApiEnvelope<TelegramTargetSettings[]>>('/telegram-sync/targets/check-all', {
      method: 'POST',
      body: JSON.stringify({})
    }),
  checkTelegramTarget: (targetId: string) =>
    apiRequest<ApiEnvelope<TelegramTargetSettings>>(`/telegram-sync/targets/${encodeURIComponent(targetId)}/check`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  setTelegramTargetEnabled: (targetId: string, enabled: boolean) =>
    apiRequest<ApiEnvelope<TelegramTargetSettings>>(
      `/telegram-sync/targets/${encodeURIComponent(targetId)}/${enabled ? 'enable' : 'disable'}`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    ),
  testTelegramTarget: (targetId: string, kind: 'text' | 'photo' | 'video' | 'album' = 'text') =>
    apiRequest<ApiEnvelope<unknown>>(`/telegram-sync/targets/${encodeURIComponent(targetId)}/test-publish`, {
      method: 'POST',
      body: JSON.stringify({ kind })
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
  createReview: (userId: string, payload: { rating?: number; text?: string; adId: string }) =>
    apiRequest<ApiEnvelope<{ id: string; subjectId: string; rating: number; text: string | null; createdAt: string }>>(
      `/reviews/users/${encodeURIComponent(userId)}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    ),
  listModerationQueue: (query: ModerationQueueQuery) =>
    apiRequest<ApiEnvelope<ModerationAdDetail[], ListMeta>>(`/moderation/queue${toQueryString(query)}`),
  getModerationPreview: (adId: string) =>
    apiRequest<ApiEnvelope<ModerationAdDetail>>(`/moderation/ads/${encodeURIComponent(adId)}`),
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
  unpublishModerationAd: (adId: string, reason?: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/unpublish`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  archiveModerationAd: (adId: string, reason?: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  deleteModerationAd: (adId: string, reason?: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    }),
  removeModerationAdFromChannel: (adId: string) =>
    apiRequest<ApiEnvelope<ModerationActionResponse>>(`/moderation/ads/${encodeURIComponent(adId)}/remove-channel`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listCategorySuggestions: (q?: string) =>
    apiRequest<ApiEnvelope<Array<{ value: string; aliases: string[] }>>>(`/references/categories${toQueryString({ q })}`),
  listDistrictSuggestions: (q?: string) =>
    apiRequest<ApiEnvelope<Array<{ value: string; aliases: string[] }>>>(`/references/districts${toQueryString({ q })}`),
  uploadPhoto: (payload: { fileName: string; mimeType: UploadMediaMimeType; dataUrl: string; altText?: string }) =>
    apiRequest<ApiEnvelope<UploadedPhoto>>('/uploads/photos', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  uploadMedia: (payload: { fileName: string; mimeType: UploadMediaMimeType; dataUrl: string; altText?: string }) =>
    apiRequest<ApiEnvelope<UploadedPhoto>>('/uploads/media', {
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

function getAnalyticsSessionId(): string {
  const key = 'rabst24:analytics-session';
  try {
    const existing = window.localStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return 'anonymous-session';
  }
}

function toQueryString(query: object): string {
  const params = new URLSearchParams();

  Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}
