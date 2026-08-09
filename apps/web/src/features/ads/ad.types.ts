import type { PublicAdCard, PublicVacancyDetail, VacancyListMeta } from '../vacancies/vacancy.types.js';
import type { PublicationSettings } from './publication-settings.js';

export type PublicAdType = 'vacancy' | 'resume' | 'equipment' | 'material' | 'tool';
export type PublicAdStatus =
  | 'draft'
  | 'payment_pending'
  | 'pending_moderation'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'hidden'
  | 'archived'
  | 'deleted';

export interface PublicResumeDetail extends PublicAdCard {
  type: 'resume';
  status: PublicAdStatus;
  description: string | null;
  contacts: Array<{
    id: string;
    type: string;
    label: string | null;
    value: string;
    isPreferred: boolean;
  }>;
  contactAccess?: {
    canViewContacts: boolean;
    maskedContact: string | null;
    contactStatus?: string;
    verified?: boolean;
    canPurchaseContact?: boolean;
    purchasePrice?: string;
    accessMode?: string;
    alreadyPurchased?: boolean;
    unlockStatus?: string | null;
  };
  owner: PublicVacancyDetail['owner'];
  photos: PublicVacancyDetail['photos'];
  updatedAt: string;
  resume: {
    name: string;
    profession: string | null;
    desiredPosition: string | null;
    specialization: string | null;
    experienceText: string | null;
    experienceYears: number | null;
    expectedSalary: string | null;
    salaryCurrency: string;
    skills: string[];
    education?: string | null;
    availability?: string | null;
    employmentType?: string | null;
    workFormat?: string | null;
    desiredSchedule?: string | null;
    travelReady?: boolean;
    siteAccommodationReady?: boolean;
    portfolioUrl?: string | null;
  };
}

export interface PublicEquipmentDetail extends PublicAdCard {
  type: 'equipment';
  status: PublicAdStatus;
  description: string | null;
  contacts: PublicResumeDetail['contacts'];
  owner: PublicVacancyDetail['owner'];
  photos: PublicVacancyDetail['photos'];
  updatedAt: string;
  equipment: {
    name: string;
    category: string | null;
    condition: string | null;
    brand: string | null;
    model: string | null;
    productionYear: number | null;
    dealType: string | null;
    hourlyPrice: string | null;
    shiftPrice: string | null;
    dailyPrice: string | null;
    rentalPrice?: string | null;
    salePrice?: string | null;
    depositAmount?: string | null;
    currency?: string;
    operatorIncluded: boolean;
    deliveryAvailable: boolean;
    availability?: string | null;
  };
}

export interface PublicProductDetail extends PublicAdCard {
  type: 'material' | 'tool';
  status: PublicAdStatus;
  description: string | null;
  contacts: PublicResumeDetail['contacts'];
  owner: PublicVacancyDetail['owner'];
  photos: PublicVacancyDetail['photos'];
  updatedAt: string;
  product: {
    name: string;
    category: string | null;
    price: string | null;
    currency: string;
    address: string | null;
    manufacturer: string | null;
    model: string | null;
    condition: string | null;
    quantity: string | null;
    unit: string | null;
    saleType: string | null;
    deliveryAvailable: boolean;
  };
}

export type PublicAdDetail = PublicVacancyDetail | PublicResumeDetail | PublicEquipmentDetail | PublicProductDetail;

export interface OwnedAdPayment {
  id: string;
  paymentId: string;
  status: string;
  amount: string;
  currency: string;
  confirmationUrl: string | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  createdAt?: string;
}

export type AdRevisionStatus = 'draft' | 'awaiting_payment' | 'pending_moderation' | 'approved' | 'rejected' | 'cancelled';

export interface AdRevisionSnapshot {
  title: string;
  description: string | null;
  city: string | null;
  districtText: string | null;
  categoryText: string | null;
  desiredPosition: string | null;
  mediaChanged: boolean;
  coverPhoto: {
    url: string;
    previewUrl: string | null;
    mimeType: string | null;
    altText: string | null;
  } | null;
}

export interface AdRevisionSummary {
  id: string;
  version: number;
  status: AdRevisionStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: AdRevisionSnapshot | null;
}

export interface RevisionPublicationEstimate {
  usesBalance: boolean;
  mediaFeeRequired: boolean;
  requiresPayment: boolean;
  amount: string;
  remainingBefore: number;
  remainingAfter: number;
}

export interface AdAnalyticsSummary {
  days: number;
  totals: {
    views: number;
    uniqueViews: number;
    favoriteAdds: number;
    favoriteRemoves: number;
    contactOpens: number;
    phoneClicks: number;
    emailClicks: number;
    maxClicks: number;
    websiteClicks: number;
    applications: number;
    contactUnlocks: number;
    promotionPurchases: number;
  };
  conversion: {
    viewToContact: number;
    viewToApplication: number;
  };
  series: Array<{
    date: string;
    views: number;
    uniqueViews: number;
    contactOpens: number;
    applications: number;
  }>;
  recommendations: Array<{
    code: string;
    title: string;
    body: string;
  }>;
}

export type ModerationAdDetail = PublicAdDetail & {
  payment: OwnedAdPayment | null;
  revision?: AdRevisionSummary | null;
};

export interface OwnedAdCard extends PublicAdCard {
  description: string | null;
  status: PublicAdStatus;
  photos: PublicVacancyDetail['photos'];
  contacts: PublicResumeDetail['contacts'];
  owner: PublicVacancyDetail['owner'];
  vacancy?: PublicVacancyDetail['vacancy'];
  resume?: PublicResumeDetail['resume'];
  equipment?: PublicEquipmentDetail['equipment'];
  product?: PublicProductDetail['product'];
  requirements?: string[];
  responsibilities?: string[];
  benefits?: string[];
  updatedAt: string;
  moderationReason: string | null;
  publicationSettings: PublicationSettings | null;
  payment: OwnedAdPayment | null;
  revision: AdRevisionSummary | null;
  estimate?: RevisionPublicationEstimate | null;
  applicationsCount?: number;
  analytics?: AdAnalyticsSummary;
}

export interface MyAdsQuery {
  type?: PublicAdType;
  status?: PublicAdStatus;
  q?: string;
  page?: number;
  perPage?: number;
}

export type ModerationQueueStatus = PublicAdStatus | 'test';

export interface ModerationQueueQuery {
  type?: PublicAdType;
  status?: ModerationQueueStatus;
  q?: string;
  page?: number;
  perPage?: number;
}

export interface FavoriteItem {
  favoriteId: string;
  addedAt: string;
  ad: PublicAdCard;
}

export interface UserProfilePayload {
  id: string;
  maxUserId: string;
  maxUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'blocked' | 'deleted';
  createdAt: string;
  profile: {
    id: string;
    profileType?: 'person' | 'company';
    companyName?: string | null;
    city: string | null;
    districtText: string | null;
    about: string | null;
    avatarUrl: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    maxContact?: string | null;
    specialization?: string | null;
    experience?: string | null;
    companyInfo?: string | null;
    registrationDetails?: string | null;
    privacy?: {
      showPhone: boolean;
      showEmail: boolean;
      showWebsite: boolean;
      showMaxContact: boolean;
      allowResumePublicProfile: boolean;
    };
    createdAt: string;
    updatedAt: string;
  } | null;
  trustBadges?: string[];
  stats: {
    adsTotal: number;
    favoritesTotal: number;
    reviewsTotal: number;
    adsByStatus: Record<string, number>;
    adsByType: Record<string, number>;
    vacancyPublicationBalance: {
      purchased: number;
      bonus: number;
      used: number;
      remaining: number;
    };
  };
  referral: {
    code: string;
    inviteUrl: string;
    referredTotal: number;
    rewardedTotal: number;
    bonusPublications: number;
  };
}

export interface TeamUser {
  id: string;
  maxUserId: string;
  maxUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'blocked' | 'deleted';
  createdAt: string;
  lastSeenAt: string | null;
  adsTotal: number;
}

export type ProfileType = 'person' | 'company';
export type TrustBadge = 'phone_confirmed' | 'company_verified' | 'reliable_employer' | 'long_time_member';

export interface EditableProfile {
  id: string;
  profileType: ProfileType;
  companyName: string | null;
  city: string | null;
  districtText: string | null;
  about: string | null;
  avatarUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  maxContact: string | null;
  specialization: string | null;
  experience: string | null;
  companyInfo: string | null;
  registrationDetails: string | null;
  privacy: {
    showPhone: boolean;
    showEmail: boolean;
    showWebsite: boolean;
    showMaxContact: boolean;
    allowResumePublicProfile: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserProfile {
  id: string;
  displayName: string;
  profileType: ProfileType;
  companyName: string | null;
  avatarUrl: string | null;
  about: string | null;
  city: string | null;
  districtText: string | null;
  specialization: string | null;
  experience: string | null;
  companyInfo: string | null;
  registeredAt: string;
  stats: {
    publishedAdsTotal: number;
    reviewsTotal: number;
    ratingAverage: number | null;
  };
  contacts: Array<{ type: string; value: string }>;
  privacy: {
    allowResumePublicProfile: boolean;
  };
  trustBadges: TrustBadge[];
  activeVacancies: PublicAdCard[];
  otherActiveAds: PublicAdCard[];
  reviews: ReviewItem[];
}

export interface TrustBadgeAdminState {
  userId: string;
  badges: Array<{
    badge: TrustBadge;
    reason: string | null;
    assignedBy: {
      id: string;
      displayName: string | null;
      maxUsername: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
  }>;
  history: Array<{
    id: string;
    badge: TrustBadge;
    action: string;
    reason: string | null;
    moderator: {
      id: string;
      displayName: string | null;
      maxUsername: string | null;
    } | null;
    createdAt: string;
  }>;
}

export type UserPaymentStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'CANCELED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED';

export interface UserPaymentOperation {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amount: string;
  currency: string;
  refundAmount: string;
  netAmount: string;
  purpose: {
    primary: string;
    components: string[];
  };
  purposeLabel: string;
  packagePublications: number;
  includesMediaFee: boolean;
  isResumeContactUnlock: boolean;
  isPromotion: boolean;
  status: UserPaymentStatus;
  yooKassaPaymentIdMasked: string;
  test: boolean;
  ad: {
    id: string;
    title: string;
    type: PublicAdType;
  };
  resumeContactUnlock: {
    id: string;
    resumeAdId: string;
    status: string;
  } | null;
  promotion: {
    id: string;
    productType: string;
  } | null;
}

export interface AdminFinanceMetric {
  revenue: string;
  succeededPayments: number;
  averageCheck: string;
  refunds: string;
  netRevenue: string;
  revenueByPurpose: Array<{
    purpose: string;
    revenue: string;
    refunds: string;
    netRevenue: string;
    count: number;
  }>;
  popularTariffs: Array<{
    label: string;
    count: number;
    revenue: string;
  }>;
  revenuePromotions: string;
  revenueContactUnlocks: string;
  paymentErrors: number;
  pendingPayments: number;
}

export interface AdminFinanceDashboard {
  today: AdminFinanceMetric;
  sevenDays: AdminFinanceMetric;
  thirtyDays: AdminFinanceMetric;
  selectedPeriod: AdminFinanceMetric & {
    from: string;
    to: string;
  };
}

export interface ReviewItem {
  id: string;
  author: {
    id: string;
    displayName: string | null;
    maxUsername: string | null;
  };
  rating: number;
  text: string | null;
  adId: string | null;
  ad: {
    id: string;
    title: string;
    type: string;
  } | null;
  createdAt: string;
}

export interface ModerationActionResponse {
  ad: ModerationAdDetail;
  publication?: {
    status: 'published' | 'failed' | 'skipped';
    logId?: string;
    reason?: string;
    error?: string;
    mediaStrategy?: string;
  };
  channelRemoval?: ChannelRemovalResult;
  creditReturn?: {
    returned: boolean;
    reason?: string;
  };
  refund?: {
    status: 'skipped' | 'pending' | 'refunded' | 'failed';
    refundId?: string;
    reason?: string;
    error?: string;
  };
}

export interface ChannelRemovalResult {
  attempted: number;
  removed: number;
  failed: number;
  skipped: number;
}

export interface AdLifecycleActionResponse {
  ad: PublicAdDetail;
  payment?: OwnedAdPayment | null;
  revision?: AdRevisionSummary | null;
  estimate?: RevisionPublicationEstimate | null;
  channelRemoval?: ChannelRemovalResult;
  publication?: {
    status: 'published' | 'failed' | 'skipped';
    logId?: string;
    reason?: string;
    error?: string;
    mediaStrategy?: string;
  };
}

export interface UpdateOwnedAdResponse {
  ad: PublicAdDetail;
  payment: OwnedAdPayment | null;
  revision: AdRevisionSummary | null;
  estimate?: RevisionPublicationEstimate | null;
}

export type ListMeta = VacancyListMeta;

