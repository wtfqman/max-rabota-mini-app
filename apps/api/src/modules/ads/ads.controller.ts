import type { Request, Response } from 'express';
import { getAdPublicationSettings, serializeAdCard, serializeAdDetail, serializeAdListMeta } from '@rabst24/core';
import { AppError, isValidPaymentConfirmationUrl, requiresAdPayment, type AdListQueryDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import { serializeRevisionSummary } from './ad-revision.serializer.js';
import type { AdsService } from './ads.service.js';
import type { OwnedAdsQuery, PublicationSettingsDto, SaveAdRevisionDto } from './ads.schemas.js';
import type { ResumeContactPurchasesService } from '../resume-contact-purchases/resume-contact-purchases.service.js';
import type { JobApplicationsService } from '../applications/applications.service.js';
import type { AdAnalyticsService } from '../ad-analytics/ad-analytics.service.js';

export class AdsController extends FoundationController {
  constructor(
    private readonly adsService: AdsService,
    private readonly contactPurchasesService: ResumeContactPurchasesService,
    private readonly jobApplicationsService?: JobApplicationsService,
    private readonly adAnalyticsService?: AdAnalyticsService
  ) {
    super(adsService);
  }

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.listPublic(request.query as unknown as AdListQueryDto);
    sendOk(response, result.items.map(serializeAdCard), serializeAdListMeta(result));
  });

  details = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.getPublicDetails(request.params.adId);
    const detail = serializeAdDetail(ad);

    if (detail.type !== 'resume') {
      sendOk(response, detail);
      return;
    }

    const access = await this.contactPurchasesService.getAccess(request.params.adId, request.auth ?? null);
    sendOk(response, this.contactPurchasesService.enrichMaskedContacts(detail, access));
  });

  my = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ownerId = this.requireUserId(request);
    const result = await this.adsService.listMy(ownerId, request.query as unknown as OwnedAdsQuery);
    const applicationCounts = await this.jobApplicationsService?.countForVacancies(
      ownerId,
      result.items.filter((ad) => ad.type === 'VACANCY').map((ad) => ad.id)
    );
    const analytics = await this.adAnalyticsService?.summarizeOwnedAds(
      ownerId,
      result.items.map((ad) => ad.id),
      30
    );

    response.set('Cache-Control', 'no-store');
    const items = await Promise.all(
      result.items.map(async (ad) => {
        const payment = getLatestPaymentPayload(ad);
        const revision = await this.adsService.getActiveRevision(ad.id);
        const detail = serializeAdDetail(ad);

        return {
          ...serializeAdCard(ad),
          ...getOwnedDetailPayload(ad, detail),
          description: ad.description,
          status: getEffectiveOwnedStatus(ad, payment),
          updatedAt: ad.updatedAt.toISOString(),
          moderationReason: getLatestModerationReason(ad),
          publicationSettings: getPublicationSettingsPayload(ad),
          revision: serializeRevisionSummary(revision),
          estimate: await this.adsService.getActiveRevisionEstimate(ad, revision),
          applicationsCount: ad.type === 'VACANCY' ? applicationCounts?.get(ad.id) ?? 0 : undefined,
          analytics: analytics?.get(ad.id),
          payment
        };
      })
    );

    sendOk(response, items, serializeAdListMeta(result));
  });

  updateMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.updateMine(
      this.requireUserId(request),
      request.params.adId,
      request.body as SaveAdRevisionDto
    );

    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      payment: result.payment ?? getLatestPaymentPayload(result.ad),
      revision: serializeRevisionSummary(result.revision),
      estimate: result.estimate
    });
  });

  updatePublicationSettings = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.updatePublicationSettings(
      this.requireUserId(request),
      request.params.adId,
      request.body as PublicationSettingsDto
    );

    sendOk(response, {
      ad: serializeAdDetail(ad),
      publicationSettings: getPublicationSettingsPayload(ad)
    });
  });

  hideMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.hideMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  archiveMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.archiveMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  deleteMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.deleteMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  resubmitMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.resubmitMine(this.requireUserId(request), request.params.adId, request.body);

    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      payment: result.payment ?? getLatestPaymentPayload(result.ad),
      revision: serializeRevisionSummary(result.revision),
      estimate: result.estimate,
      publication: result.publication
    });
  });

  revisionsMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const revisions = await this.adsService.listRevisions(this.requireUserId(request), request.params.adId);
    sendOk(response, revisions.map(serializeRevisionSummary));
  });

  cancelRevisionMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const revision = await this.adsService.cancelActiveRevision(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      revision: serializeRevisionSummary(revision)
    });
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}

function getOwnedDetailPayload(ad: Parameters<typeof serializeAdDetail>[0], detail: ReturnType<typeof serializeAdDetail>) {
  const base = {
    photos: detail.photos.map((photo) => {
      const source = ad.photos.find((item) => item.id === photo.id);

      return {
        ...photo,
        storageKey: source?.storageKey
      };
    }),
    contacts: detail.contacts,
    owner: detail.owner
  };

  if (detail.type === 'vacancy') {
    return {
      ...base,
      vacancy: detail.vacancy,
      requirements: detail.requirements,
      responsibilities: detail.responsibilities,
      benefits: detail.benefits
    };
  }

  if (detail.type === 'resume') {
    return {
      ...base,
      resume: detail.resume
    };
  }

  if (detail.type === 'equipment') {
    return {
      ...base,
      equipment: detail.equipment
    };
  }

  return {
    ...base,
    product: detail.product
  };
}

function getLatestModerationReason(ad: Parameters<typeof serializeAdDetail>[0]): string | null {
  const latest = [...ad.moderationLogs]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .find((log) => log.reason);

  return latest?.reason ?? null;
}

function getPublicationSettingsPayload(ad: Parameters<typeof serializeAdDetail>[0]) {
  const settings = getAdPublicationSettings(ad.metadataJson);

  return settings ? { adId: ad.id, ...settings } : null;
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
    confirmationUrl: payment.confirmationUrl
  };
}

function getEffectiveOwnedStatus(
  ad: Parameters<typeof serializeAdDetail>[0],
  payment: ReturnType<typeof getLatestPaymentPayload>
) {
  if (!requiresAdPayment(ad.type) && ad.status.toLowerCase() === 'payment_pending') {
    return 'pending_moderation';
  }

  if (isValidPaymentConfirmationUrl(payment?.confirmationUrl) && (payment.status === 'pending' || payment.status === 'waiting_for_capture')) {
    return 'payment_pending';
  }

  return ad.status.toLowerCase();
}
