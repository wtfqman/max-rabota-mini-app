import type { Request, Response } from 'express';
import { serializeAdDetail, serializeAdListMeta } from '@rabst24/core';
import { AppError, requiresAdPayment, type RejectAdDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import { serializeRevisionSummary } from '../ads/ad-revision.serializer.js';
import type { ModerationQueueQuery } from './moderation.schemas.js';
import type { ModerationModuleService } from './moderation.service.js';

type ModerationSerializableAd = Parameters<typeof serializeAdDetail>[0] & {
  owner?: {
    maxUserId?: string | null;
    maxUsername?: string | null;
  } | null;
  resumeDetails?: {
    verifiedContact?: {
      maskedValue: string;
    } | null;
  } | null;
};

export class ModerationController extends FoundationController {
  constructor(private readonly moderationService: ModerationModuleService) {
    super(moderationService);
  }

  queue = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.moderationService.listQueue(request.query as unknown as ModerationQueueQuery);
    const items = await Promise.all(result.items.map((ad) => this.serializeModerationAdDetail(ad)));
    sendOk(response, items, serializeAdListMeta(result));
  });

  preview = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.moderationService.getPreview(request.params.adId);
    sendOk(response, await this.serializeModerationAdDetail(ad));
  });

  approve = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.approve(request.params.adId, moderatorId);

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      publication: result.publication
    });
  });

  reject = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.reject(
      request.params.adId,
      moderatorId,
      (request.body as RejectAdDto).reason
    );

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval,
      creditReturn: result.creditReturn,
      refund: result.refund
    });
  });

  hide = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.hide(
      request.params.adId,
      moderatorId,
      (request.body as { reason?: string }).reason
    );

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  unpublish = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.unpublish(
      request.params.adId,
      moderatorId,
      (request.body as { reason?: string }).reason
    );

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  archive = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.archive(
      request.params.adId,
      moderatorId,
      (request.body as { reason?: string }).reason
    );

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  delete = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.delete(
      request.params.adId,
      moderatorId,
      (request.body as { reason?: string }).reason
    );

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  removeFromChannel = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.removeFromChannel(request.params.adId, moderatorId);

    sendOk(response, {
      ad: await this.serializeModerationAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  logs = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const query = request.query as unknown as { page: number; perPage: number; adId?: string };
    const result = await this.moderationService.listLogs(query);

    sendOk(response, result.items, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / result.perPage)
    });
  });

  private requireModeratorId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }

  private async serializeModerationAdDetail(ad: ModerationSerializableAd) {
    const revision = await this.moderationService.getPendingRevision(ad.id);

    return {
      ...serializeModerationAdDetail(ad),
      revision: serializeRevisionSummary(revision)
    };
  }
}

function serializeModerationAdDetail(ad: ModerationSerializableAd) {
  const detail = serializeAdDetail(ad);

  return {
    ...detail,
    contacts: getModerationContacts(detail.contacts, ad),
    payment: getLatestPaymentPayload(ad)
  };
}

function getModerationContacts(
  contacts: ReturnType<typeof serializeAdDetail>['contacts'],
  ad: ModerationSerializableAd
): ReturnType<typeof serializeAdDetail>['contacts'] {
  if (contacts.length > 0 || ad.type !== 'RESUME') {
    return contacts;
  }

  const verifiedContact = ad.resumeDetails?.verifiedContact?.maskedValue?.trim();

  if (!verifiedContact) {
    const maxUsername = ad.owner?.maxUsername?.trim();
    const maxContact = maxUsername ? (maxUsername.startsWith('@') ? maxUsername : `@${maxUsername}`) : null;

    if (!maxContact) {
      return contacts;
    }

    return [
      {
        id: `owner-max-${ad.id}`,
        type: 'max',
        label: 'MAX',
        value: maxContact,
        isPreferred: true
      }
    ];
  }

  return [
    {
      id: `verified-contact-${ad.id}`,
      type: 'phone',
      label: 'Телефон',
      value: verifiedContact,
      isPreferred: true
    }
  ];
}

function getLatestPaymentPayload(ad: Parameters<typeof serializeAdDetail>[0]) {
  if (!requiresAdPayment(ad.type)) {
    return null;
  }

  const payment = ad.payments[0];

  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    paymentId: payment.yooKassaPaymentId,
    status: payment.status.toLowerCase(),
    amount: payment.amountValue,
    currency: payment.currency,
    confirmationUrl: payment.confirmationUrl,
    paidAt: payment.paidAt?.toISOString() ?? null,
    refundedAt: payment.refundedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString()
  };
}
