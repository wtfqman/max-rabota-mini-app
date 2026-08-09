import { canonicalizeDistrict } from '@rabst24/shared';
import { ProfileType, UserTrustBadge } from '@rabst24/db';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ProfilesRepository } from './profiles.repository.js';

export class ProfilesService extends FoundationService {
  constructor(private readonly profilesRepository: ProfilesRepository) {
    super(profilesRepository);
  }

  async getMe(userId: string) {
    return this.profilesRepository.findMe(userId);
  }

  async updateMe(userId: string, dto: {
    profileType?: 'person' | 'company';
    companyName?: string | null;
    city?: string | null;
    districtText?: string | null;
    about?: string | null;
    avatarUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    maxContact?: string | null;
    specialization?: string | null;
    experience?: string | null;
    companyInfo?: string | null;
    registrationDetails?: string | null;
    privacy?: {
      showPhone?: boolean;
      showEmail?: boolean;
      showWebsite?: boolean;
      showMaxContact?: boolean;
      allowResumePublicProfile?: boolean;
    };
  }) {
    return this.profilesRepository.updateMe(userId, {
      profileType: dto.profileType ? mapProfileType(dto.profileType) : undefined,
      companyName: normalizeNullableText(dto.companyName),
      city: normalizeNullableText(dto.city),
      districtText: canonicalizeDistrict(dto.districtText) ?? null,
      about: normalizeNullableText(dto.about),
      avatarUrl: normalizeNullableText(dto.avatarUrl),
      phone: normalizeNullableText(dto.phone),
      email: normalizeNullableText(dto.email),
      website: normalizeNullableText(dto.website),
      maxContact: normalizeNullableText(dto.maxContact),
      specialization: normalizeNullableText(dto.specialization),
      experience: normalizeNullableText(dto.experience),
      companyInfo: normalizeNullableText(dto.companyInfo),
      registrationDetails: normalizeNullableText(dto.registrationDetails),
      showPhone: dto.privacy?.showPhone,
      showEmail: dto.privacy?.showEmail,
      showWebsite: dto.privacy?.showWebsite,
      showMaxContact: dto.privacy?.showMaxContact,
      allowResumePublicProfile: dto.privacy?.allowResumePublicProfile
    });
  }

  async listTrustBadges(userId: string) {
    return this.profilesRepository.listTrustBadges(userId);
  }

  async updateTrustBadge(
    targetUserId: string,
    moderatorId: string,
    badge: 'phone_confirmed' | 'company_verified' | 'reliable_employer' | 'long_time_member',
    dto: { enabled: boolean; reason?: string | null }
  ) {
    return this.profilesRepository.updateTrustBadge(targetUserId, moderatorId, mapTrustBadge(badge), dto.enabled, dto.reason);
  }
}

function mapProfileType(value: 'person' | 'company'): ProfileType {
  return value === 'company' ? ProfileType.COMPANY : ProfileType.PERSON;
}

function mapTrustBadge(value: 'phone_confirmed' | 'company_verified' | 'reliable_employer' | 'long_time_member'): UserTrustBadge {
  if (value === 'company_verified') {
    return UserTrustBadge.COMPANY_VERIFIED;
  }

  if (value === 'reliable_employer') {
    return UserTrustBadge.RELIABLE_EMPLOYER;
  }

  if (value === 'long_time_member') {
    return UserTrustBadge.LONG_TIME_MEMBER;
  }

  return UserTrustBadge.PHONE_CONFIRMED;
}

function normalizeNullableText(value?: string | null): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value?.trim();
  return normalized ? normalized : null;
}
