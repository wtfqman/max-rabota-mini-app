import type { User } from '@rabst24/db';
import type { MaxUser } from '@rabst24/max-api';
import { AppError, toStringId } from '@rabst24/shared';
import type { UserRepository } from './user.repository.js';

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async registerFromMaxUser(
    maxUser: MaxUser,
    locale?: string | null,
    options: { startParam?: string | null } = {}
  ): Promise<User> {
    const firstName = maxUser.first_name ?? null;
    const lastName = maxUser.last_name ?? null;
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || maxUser.name || null;

    return this.userRepository.upsertFromMaxUser({
      maxUserId: toStringId(maxUser.user_id, 'max user id'),
      maxUsername: maxUser.username ?? null,
      firstName,
      lastName,
      displayName,
      locale: locale ?? null,
      referrerId: parseReferralStartParam(options.startParam)
    });
  }

  async getById(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }
}

function parseReferralStartParam(startParam: string | null | undefined): string | null {
  const normalized = startParam?.trim();

  if (!normalized) {
    return null;
  }

  const match = /^ref_([a-z0-9_-]{8,64})$/i.exec(normalized);
  return match?.[1] ?? null;
}
