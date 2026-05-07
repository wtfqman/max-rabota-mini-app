import type { UserProfile } from '@rabst24/db';
import type { UserService } from '@rabst24/core';
import { serializeUser } from '@rabst24/core';
import { config } from '@rabst24/config';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { AuthRepository } from './auth.repository.js';
import type {
  AuthProfilePayload,
  VerifyMaxLaunchDto,
  VerifyMaxLaunchPayload
} from './auth.types.js';
import type { MaxInitDataValidator } from './max-init-data.validator.js';
import type { SessionTokenService } from './session-token.service.js';

export class AuthService extends FoundationService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly userService: UserService,
    private readonly maxInitDataValidator: MaxInitDataValidator,
    private readonly sessionTokenService: SessionTokenService
  ) {
    super(authRepository);
  }

  async verifyMaxLaunch(dto: VerifyMaxLaunchDto): Promise<VerifyMaxLaunchPayload> {
    const initData = this.maxInitDataValidator.validate(dto.initData);
    const user = await this.userService.registerFromMaxUser(
      {
        user_id: initData.user.id,
        first_name: initData.user.first_name,
        last_name: initData.user.last_name,
        username: initData.user.username,
        name: [initData.user.first_name, initData.user.last_name].filter(Boolean).join(' ') || null
      },
      initData.user.language_code
    );
    const profile = await this.authRepository.findProfileByUserId(user.id);

    return {
      session: this.sessionTokenService.createAccessSession(user),
      user: serializeUser(user),
      profile: serializeProfile(profile),
      launch: {
        provider: 'max',
        queryId: initData.queryId,
        startParam: initData.startParam,
        platform: dto.platform,
        authDate: initData.authDate.toISOString()
      }
    };
  }

  async createDevSession(): Promise<VerifyMaxLaunchPayload> {
    const user = await this.userService.registerFromMaxUser(
      {
        user_id: config.devAuth.maxUserId,
        first_name: config.devAuth.firstName,
        last_name: config.devAuth.lastName,
        username: config.devAuth.username,
        name: [config.devAuth.firstName, config.devAuth.lastName].filter(Boolean).join(' ')
      },
      'ru'
    );
    const profile = await this.authRepository.findProfileByUserId(user.id);

    return {
      session: this.sessionTokenService.createAccessSession(user),
      user: serializeUser(user),
      profile: serializeProfile(profile),
      launch: {
        provider: 'max',
        queryId: 'dev-local',
        startParam: 'dev',
        platform: 'web',
        authDate: new Date().toISOString()
      }
    };
  }
}

function serializeProfile(profile: UserProfile | null): AuthProfilePayload | null {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    city: profile.city,
    districtText: profile.districtText,
    about: profile.about,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}
