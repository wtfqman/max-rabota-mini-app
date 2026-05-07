import { canonicalizeDistrict } from '@rabst24/shared';
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
    city?: string | null;
    districtText?: string | null;
    about?: string | null;
    avatarUrl?: string | null;
  }) {
    return this.profilesRepository.updateMe(userId, {
      ...dto,
      districtText: canonicalizeDistrict(dto.districtText) ?? null
    });
  }
}
