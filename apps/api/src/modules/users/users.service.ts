import { logger } from '@rabst24/config';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import { mapRole, type TeamUserQuery, type UsersRepository } from './users.repository.js';

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

  async listTeamUsers(query: TeamUserQuery) {
    return this.usersRepository.listTeamUsers(query);
  }

  async updateUserRole(actorId: string, targetUserId: string, dto: { role: 'user' | 'moderator' | 'admin' }) {
    const role = mapRole(dto.role);
    const result = await this.usersRepository.updateUserRole(actorId, targetUserId, role);

    logger.info(
      {
        actorId,
        targetUserId,
        previousRole: result.previousRole.toLowerCase(),
        nextRole: result.user.role.toLowerCase()
      },
      'User role changed'
    );

    return result.user;
  }
}
