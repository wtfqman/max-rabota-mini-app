import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { UsersRepository } from './users.repository.js';

export class UsersService extends FoundationService {
  constructor(private readonly usersRepository: UsersRepository) {
    super(usersRepository);
  }

  async getMe(userId: string) {
    const user = await this.usersRepository.findMe(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const stats = await this.usersRepository.getAdStats(userId);

    return {
      user,
      stats
    };
  }

  async updateMe(userId: string, dto: { displayName?: string }) {
    return this.usersRepository.updateMe(userId, dto);
  }
}
