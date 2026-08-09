import { randomUUID } from 'node:crypto';
import { config, logger } from '@rabst24/config';
import type { AdRepository } from '@rabst24/core';
import { AdStatus, ExternalPublicationSourcePlatform, type PrismaClient } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import {
  TelegramLinkingService,
  TelegramPublicationService,
  TelegramTargetRepository,
  type TelegramPublicationJobPayload
} from '@rabst24/telegram';
import { FoundationRepository, FoundationService } from '../../shared/modules/module-status.js';
import type { OutboxService } from '../outbox/outbox.service.js';

export class TelegramSyncService extends FoundationService {
  private readonly targetRepository: TelegramTargetRepository;

  constructor(
    db: PrismaClient,
    private readonly adRepository: AdRepository,
    private readonly outboxService: OutboxService,
    private readonly publicationService: TelegramPublicationService,
    private readonly linkingService: TelegramLinkingService
  ) {
    super(new FoundationRepository('telegram-sync'));
    this.targetRepository = new TelegramTargetRepository(db);
  }

  async ensureTargets(): Promise<{ created: number; total: number }> {
    return this.targetRepository.ensureExpectedTargets();
  }

  async listTargets() {
    await this.ensureTargets();
    return this.targetRepository.list();
  }

  async checkTarget(targetId: string) {
    const target = await this.getTarget(targetId);
    return this.publicationService.checkTargetPermissions(target);
  }

  async checkAllTargets() {
    const targets = await this.listTargets();
    const checked = [];

    for (const target of targets) {
      checked.push(await this.publicationService.checkTargetPermissions(target));
    }

    return checked;
  }

  async setEnabled(targetId: string, enabled: boolean) {
    const target = await this.getTarget(targetId);

    if (config.features.TELEGRAM_TEST_MODE && !target.testTarget && enabled) {
      throw new AppError('Telegram test mode allows enabling only test targets', 409, {
        code: 'TELEGRAM_TEST_MODE_TARGET_ONLY',
        targetId
      });
    }

    return this.targetRepository.setEnabled(targetId, enabled);
  }

  async testPublish(targetId: string, kind: 'text' | 'photo' | 'video' | 'album') {
    const target = await this.getTarget(targetId);

    if (!target.testTarget) {
      throw new AppError('Test publication is allowed only for test targets', 409, {
        code: 'TELEGRAM_TEST_TARGET_REQUIRED',
        targetId
      });
    }

    return this.publicationService.sendTestPost(target, kind);
  }

  async enqueuePublicationForAd(adId: string, source: 'max' | 'telegram' | 'rabst24' = 'rabst24') {
    if (!config.features.TELEGRAM_OUTBOUND_PUBLICATION_ENABLED) {
      return {
        enqueued: 0,
        skippedReason: 'TELEGRAM_OUTBOUND_PUBLICATION_ENABLED is disabled'
      };
    }

    await this.ensureTargets();
    const targets = await this.targetRepository.listPublishable(config.features.TELEGRAM_TEST_MODE);
    const correlationId = randomUUID();
    let enqueued = 0;

    for (const target of targets) {
      await this.outboxService.enqueue({
        type: 'TELEGRAM_PUBLICATION',
        payload: {
          adId,
          targetId: target.id,
          source,
          publicationVersion: 1,
          correlationId
        },
        idempotencyKey: `telegram-publication:${adId}:${target.id}:1`,
        maxAttempts: 6
      });
      enqueued += 1;
    }

    return {
      enqueued,
      targetCount: targets.length,
      correlationId
    };
  }

  async handlePublicationJob(payload: TelegramPublicationJobPayload) {
    const ad = await this.adRepository.findWithDetailsById(payload.adId);

    if (!ad || ad.deletedAt || ad.status !== AdStatus.PUBLISHED) {
      return {
        status: 'skipped',
        reason: 'Ad is not published'
      };
    }

    const target = await this.getTarget(payload.targetId);
    return this.publicationService.publishAdToTarget({
      ad,
      target,
      sourcePlatform: this.mapSource(payload.source),
      publicationVersion: payload.publicationVersion ?? 1,
      correlationId: payload.correlationId
    });
  }

  async removePublicationsForAd(adId: string) {
    const publications = await this.publicationService.listActivePublicationsForAd(adId);
    let deleted = 0;
    let failed = 0;
    let skipped = 0;

    for (const publication of publications) {
      if (!publication.externalChatId || !publication.externalMessageId) {
        skipped += 1;
        continue;
      }

      try {
        const result = await this.publicationService.deletePublication(
          publication.id,
          publication.externalChatId,
          publication.externalMessageId
        );

        if (result.status === 'deleted') {
          deleted += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        logger.warn({ err: error, adId, publicationId: publication.id }, 'Failed to delete Telegram publication');
      }
    }

    return {
      attempted: publications.length,
      deleted,
      failed,
      skipped
    };
  }

  async consumeLinkCode(userId: string, code: string) {
    if (!config.features.TELEGRAM_ACCOUNT_LINKING_ENABLED) {
      throw new AppError('Telegram account linking is disabled', 404, {
        code: 'FEATURE_DISABLED',
        feature: 'TELEGRAM_ACCOUNT_LINKING_ENABLED'
      });
    }

    return this.linkingService.consumeLinkCode(userId, code);
  }

  private async getTarget(targetId: string) {
    const target = await this.targetRepository.findById(targetId);

    if (!target) {
      throw new AppError('Telegram target not found', 404, {
        targetId
      });
    }

    return target;
  }

  private mapSource(source: TelegramPublicationJobPayload['source']): ExternalPublicationSourcePlatform {
    if (source === 'telegram') {
      return ExternalPublicationSourcePlatform.TELEGRAM;
    }

    if (source === 'max') {
      return ExternalPublicationSourcePlatform.MAX;
    }

    return ExternalPublicationSourcePlatform.RABST24;
  }
}

export function logTelegramBootstrapResult(result: { created: number; total: number }): void {
  logger.info(result, 'Telegram targets registry ensured');
}
