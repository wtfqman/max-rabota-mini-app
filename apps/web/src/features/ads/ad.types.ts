import type { PublicAdCard, PublicVacancyDetail, VacancyListMeta } from '../vacancies/vacancy.types.js';

export type PublicAdType = 'vacancy' | 'resume' | 'equipment';
export type PublicAdStatus =
  | 'draft'
  | 'pending_moderation'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'hidden'
  | 'archived';

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
  photos: PublicVacancyDetail['photos'];
  updatedAt: string;
  resume: {
    name: string;
    profession: string | null;
    experienceText: string | null;
    experienceYears: number | null;
    skills: string[];
  };
}

export interface PublicEquipmentDetail extends PublicAdCard {
  type: 'equipment';
  status: PublicAdStatus;
  description: string | null;
  contacts: PublicResumeDetail['contacts'];
  photos: PublicVacancyDetail['photos'];
  updatedAt: string;
  equipment: {
    name: string;
    category: string | null;
    condition: string | null;
    brand: string | null;
    model: string | null;
    productionYear: number | null;
  };
}

export type PublicAdDetail = PublicVacancyDetail | PublicResumeDetail | PublicEquipmentDetail;

export interface OwnedAdCard extends PublicAdCard {
  description: string | null;
  status: PublicAdStatus;
  updatedAt: string;
  moderationReason: string | null;
}

export interface MyAdsQuery {
  type?: PublicAdType;
  status?: PublicAdStatus;
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
    city: string | null;
    districtText: string | null;
    about: string | null;
    avatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  stats: {
    adsTotal: number;
    favoritesTotal: number;
    reviewsTotal: number;
    adsByStatus: Record<string, number>;
    adsByType: Record<string, number>;
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
  createdAt: string;
}

export interface ModerationActionResponse {
  ad: PublicAdDetail;
  publication?: {
    status: 'published' | 'failed' | 'skipped';
    logId?: string;
    reason?: string;
    error?: string;
  };
}

export type ListMeta = VacancyListMeta;
