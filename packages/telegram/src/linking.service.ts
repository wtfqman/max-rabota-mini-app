import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '@rabst24/shared';
import type { TelegramAccountRepository, TelegramLinkTokenRepository } from './repositories.js';

export class TelegramLinkingService {
  constructor(
    private readonly accountRepository: TelegramAccountRepository,
    private readonly linkTokenRepository: TelegramLinkTokenRepository,
    private readonly options: {
      ttlMinutes: number;
      hashPepper: string;
    }
  ) {}

  async createLinkCode(telegramUser: {
    id: number | bigint;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    language_code?: string | null;
  }): Promise<{ code: string; expiresAt: Date }> {
    const account = await this.accountRepository.upsertFromTelegramUser(telegramUser);
    const code = randomBytes(12).toString('base64url');
    const expiresAt = new Date(Date.now() + this.options.ttlMinutes * 60 * 1000);

    await this.linkTokenRepository.create({
      telegramAccountId: account.id,
      codeHash: this.hashCode(code),
      expiresAt
    });

    return {
      code,
      expiresAt
    };
  }

  async consumeLinkCode(userId: string, code: string) {
    const normalized = code.trim();

    if (normalized.length < 8) {
      throw new AppError('Invalid Telegram link code', 400, {
        code: 'TELEGRAM_LINK_CODE_INVALID'
      });
    }

    const token = await this.linkTokenRepository.findPendingByCodeHash(this.hashCode(normalized));

    if (!token) {
      throw new AppError('Telegram link code is expired or invalid', 404, {
        code: 'TELEGRAM_LINK_CODE_NOT_FOUND'
      });
    }

    if (token.telegramAccount.userId && token.telegramAccount.userId !== userId) {
      throw new AppError('Telegram account is already linked to another user', 409, {
        code: 'TELEGRAM_ACCOUNT_ALREADY_LINKED'
      });
    }

    await this.accountRepository.linkToUser(token.telegramAccountId, userId);
    await this.linkTokenRepository.consume(token.id);

    return {
      telegramAccountId: token.telegramAccountId,
      linked: true
    };
  }

  private hashCode(code: string): string {
    return createHash('sha256')
      .update(`${this.options.hashPepper}:${code}`)
      .digest('hex');
  }
}
