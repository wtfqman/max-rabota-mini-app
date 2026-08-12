import { AdStatus, AdType, ContactAccessMode, PaymentStatus, UserRole, type Ad, type PrismaClient } from '@rabst24/db';
import { AppError, isValidPaymentConfirmationUrl } from '@rabst24/shared';
import type { AdPaymentPayload } from '../payments/ad-payment.service.js';
import type { YooKassaClient } from '../payments/yookassa-client.js';
import type { VerifiedContactsService } from '../verified-contacts/verified-contacts.service.js';

export const RESUME_CONTACT_PRICE_RUB = '20.00';
export const RESUME_CONNECTION_PURPOSE = 'RESUME_CONNECTION_ACCESS';

type ResumeContactPurchaseSource = {
  source: 'verified' | 'legacy';
  verifiedContactId: string | null;
  consentId: string | null;
  accessMode: ContactAccessMode;
};

export class ResumeContactPurchasesService {
  constructor(
    private readonly db: PrismaClient,
    private readonly yooKassaClient: YooKassaClient,
    private readonly verifiedContactsService: VerifiedContactsService | undefined,
    private readonly settings: {
      enabled: boolean;
      currency: string;
      returnUrl: string;
      testMode: boolean;
    }
  ) {}

  async getAccess(resumeAdId: string, viewer?: { userId: string; role: string } | null): Promise<{
    canViewContacts: boolean;
    alreadyPurchased: boolean;
    unlockStatus: string | null;
    contactStatus: string;
    verified: boolean;
    maskedContact: string | null;
    canPurchaseContact: boolean;
    purchasePrice: string;
    accessMode: string;
  }> {
    const resume = await this.getPublishedResume(resumeAdId);
    const canViewByRole = this.canViewByOwnershipOrRole(resume, viewer);
    const availability = await this.getAvailability(resumeAdId);

    if (canViewByRole) {
      return {
        canViewContacts: true,
        alreadyPurchased: false,
        unlockStatus: null,
        contactStatus: availability.contactStatus,
        verified: availability.verified,
        maskedContact: availability.maskedContact,
        canPurchaseContact: availability.canPurchaseContact,
        purchasePrice: availability.price,
        accessMode: availability.accessMode
      };
    }

    if (!viewer?.userId) {
      return {
        canViewContacts: false,
        alreadyPurchased: false,
        unlockStatus: null,
        contactStatus: availability.contactStatus,
        verified: availability.verified,
        maskedContact: availability.maskedContact,
        canPurchaseContact: availability.canPurchaseContact,
        purchasePrice: availability.price,
        accessMode: availability.accessMode
      };
    }

    const unlock = await this.db.resumeContactUnlock.findUnique({
      where: {
        buyerUserId_resumeAdId: {
          buyerUserId: viewer.userId,
          resumeAdId
        }
      }
    });

    const succeeded = unlock?.status === PaymentStatus.SUCCEEDED && unlock.unlockedAt !== null && unlock.refundedAt === null;

    return {
      canViewContacts: succeeded,
      alreadyPurchased: succeeded,
      unlockStatus: unlock?.status.toLowerCase() ?? null,
      contactStatus: availability.contactStatus,
      verified: availability.verified,
      maskedContact: availability.maskedContact,
      canPurchaseContact: availability.canPurchaseContact && !succeeded,
      purchasePrice: availability.price,
      accessMode: availability.accessMode
    };
  }

  async createPurchase(buyerUserId: string, resumeAdId: string): Promise<{
    alreadyPurchased: boolean;
    payment: AdPaymentPayload | null;
  }> {
    const resume = await this.getPublishedResume(resumeAdId);

    if (resume.ownerId === buyerUserId) {
      throw new AppError('Owner cannot buy access to own resume contact', 409, {
        code: 'BUYER_IS_AUTHOR'
      });
    }

    const contactSource = await this.resolvePurchaseContactSource(resumeAdId, buyerUserId);

    const existing = await this.db.resumeContactUnlock.findUnique({
      where: {
        buyerUserId_resumeAdId: {
          buyerUserId,
          resumeAdId
        }
      },
      include: {
        payment: true
      }
    });

    if (existing?.status === PaymentStatus.SUCCEEDED && existing.unlockedAt && !existing.refundedAt) {
      return {
        alreadyPurchased: true,
        payment: null
      };
    }

    if (existing?.payment && existing.payment.status !== PaymentStatus.CANCELED && existing.payment.confirmationUrl) {
      return {
        alreadyPurchased: false,
        payment: this.toPaymentPayload(existing.payment)
      };
    }

    if (!this.settings.enabled) {
      throw new AppError('YooKassa payment is required for resume contact unlock but is not configured', 503, {
        code: 'YOOKASSA_NOT_CONFIGURED',
        resumeAdId
      });
    }

    const idempotenceKey = `resume-contact:${buyerUserId}:${resumeAdId}:${contactSource.verifiedContactId ?? 'legacy'}:${contactSource.accessMode}`;
    const payment = await this.yooKassaClient.createPayment(
      {
        amount: {
          value: RESUME_CONTACT_PRICE_RUB,
          currency: this.settings.currency
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: this.settings.returnUrl
        },
        description: `Открытие контакта резюме ${resume.title}`,
        metadata: {
          purpose: RESUME_CONNECTION_PURPOSE,
          purposeCode: RESUME_CONNECTION_PURPOSE,
          adId: resumeAdId,
          buyerUserId,
          authorUserId: resume.ownerId,
          resumeAdId,
          verifiedContactId: contactSource.verifiedContactId ?? '',
          consentId: contactSource.consentId ?? '',
          accessMode: contactSource.accessMode,
          contactSource: contactSource.source,
          paymentPurpose: RESUME_CONNECTION_PURPOSE,
          paymentPurposeComponents: RESUME_CONNECTION_PURPOSE
        },
        receipt: {
          customer: {
            email: 'payments@rabst24.ru'
          },
          items: [
            {
              description: 'Открытие контакта резюме',
              quantity: '1.00',
              amount: {
                value: RESUME_CONTACT_PRICE_RUB,
                currency: this.settings.currency
              },
              vat_code: 1,
              payment_mode: 'full_prepayment',
              payment_subject: 'service'
            }
          ]
        }
      },
      idempotenceKey
    );

    if (payment.status === 'pending' && !isValidPaymentConfirmationUrl(payment.confirmation?.confirmation_url?.trim() ?? null)) {
      throw new AppError('YooKassa did not return a valid payment confirmation URL', 502, {
        paymentId: payment.id
      });
    }

    const dbPayment = await this.db.adPayment.upsert({
      where: {
        idempotenceKey
      },
      update: {
        yooKassaPaymentId: payment.id,
        status: this.mapPaymentStatus(payment.status),
        amountValue: RESUME_CONTACT_PRICE_RUB,
        currency: this.settings.currency,
        confirmationUrl: payment.confirmation?.confirmation_url?.trim() ?? null,
        rawPayloadJson: JSON.stringify(payment),
        purpose: RESUME_CONNECTION_PURPOSE,
        purposeCode: RESUME_CONNECTION_PURPOSE,
        purposeComponentsJson: JSON.stringify([RESUME_CONNECTION_PURPOSE]),
        packagePublications: 0,
        includesMediaHighlight: false
      },
      create: {
        adId: resumeAdId,
        yooKassaPaymentId: payment.id,
        idempotenceKey,
        status: this.mapPaymentStatus(payment.status),
        amountValue: RESUME_CONTACT_PRICE_RUB,
        currency: this.settings.currency,
        confirmationUrl: payment.confirmation?.confirmation_url?.trim() ?? null,
        rawPayloadJson: JSON.stringify(payment),
        purpose: RESUME_CONNECTION_PURPOSE,
        purposeCode: RESUME_CONNECTION_PURPOSE,
        purposeComponentsJson: JSON.stringify([RESUME_CONNECTION_PURPOSE]),
        packagePublications: 0,
        includesMediaHighlight: false
      }
    });

    await this.db.resumeContactUnlock.upsert({
      where: {
        buyerUserId_resumeAdId: {
          buyerUserId,
          resumeAdId
        }
      },
      update: {
        paymentId: dbPayment.id,
        amount: RESUME_CONTACT_PRICE_RUB,
        currency: this.settings.currency,
        status: dbPayment.status,
        verifiedContactId: contactSource.verifiedContactId,
        consentId: contactSource.consentId,
        accessMode: contactSource.accessMode
      },
      create: {
        buyerUserId,
        resumeAdId,
        paymentId: dbPayment.id,
        amount: RESUME_CONTACT_PRICE_RUB,
        currency: this.settings.currency,
        status: dbPayment.status,
        verifiedContactId: contactSource.verifiedContactId,
        consentId: contactSource.consentId,
        accessMode: contactSource.accessMode
      }
    });

    return {
      alreadyPurchased: dbPayment.status === PaymentStatus.SUCCEEDED,
      payment: this.toPaymentPayload(dbPayment)
    };
  }

  maskContacts<TDetail extends { contacts: Array<{ id: string; type: string; label: string | null; value: string; isPreferred: boolean }> }>(
    detail: TDetail,
    canViewContacts: boolean
  ): TDetail & { contactAccess: { canViewContacts: boolean; maskedContact: string | null; contactStatus: string; verified: boolean; canPurchaseContact: boolean; purchasePrice: string; accessMode: string; alreadyPurchased: boolean; unlockStatus: string | null } } {
    if (canViewContacts) {
      return {
        ...detail,
        contactAccess: {
          canViewContacts: true,
          maskedContact: null,
          contactStatus: 'available',
          verified: true,
          canPurchaseContact: false,
          purchasePrice: RESUME_CONTACT_PRICE_RUB,
          accessMode: 'MAX_VERIFIED_CONNECTION',
          alreadyPurchased: false,
          unlockStatus: null
        }
      };
    }

    return {
      ...detail,
      contacts: [],
      contactAccess: {
        canViewContacts: false,
        maskedContact: detail.contacts.length ? '+7 *** ***-**-**' : null,
        contactStatus: 'hidden',
        verified: false,
        canPurchaseContact: false,
        purchasePrice: RESUME_CONTACT_PRICE_RUB,
        accessMode: 'MAX_VERIFIED_CONNECTION',
        alreadyPurchased: false,
        unlockStatus: null
      }
    };
  }

  enrichMaskedContacts<TDetail extends { contacts: Array<{ id: string; type: string; label: string | null; value: string; isPreferred: boolean }> }>(
    detail: TDetail,
    access: Awaited<ReturnType<ResumeContactPurchasesService['getAccess']>>
  ): TDetail & { contactAccess: ReturnType<ResumeContactPurchasesService['maskContacts']>['contactAccess'] } {
    const masked = this.maskContacts(detail, access.canViewContacts);

    return {
      ...masked,
      contactAccess: {
        ...masked.contactAccess,
        contactStatus: access.contactStatus,
        verified: access.verified,
        maskedContact: access.canViewContacts ? null : access.maskedContact ?? masked.contactAccess.maskedContact,
        canPurchaseContact: access.canPurchaseContact,
        purchasePrice: access.purchasePrice,
        accessMode: access.accessMode,
        alreadyPurchased: access.alreadyPurchased,
        unlockStatus: access.unlockStatus
      }
    };
  }

  private async getPublishedResume(resumeAdId: string): Promise<Pick<Ad, 'id' | 'ownerId' | 'type' | 'status' | 'title'>> {
    const resume = await this.db.ad.findFirst({
      where: {
        id: resumeAdId,
        type: AdType.RESUME,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        deletedAt: null
      },
      select: {
        id: true,
        ownerId: true,
        type: true,
        status: true,
        title: true
      }
    });

    if (!resume) {
      throw new AppError('Resume not found', 404, {
        resumeAdId
      });
    }

    return resume;
  }

  private canViewByOwnershipOrRole(resume: Pick<Ad, 'ownerId'>, viewer?: { userId: string; role: string } | null): boolean {
    if (!viewer?.userId) {
      return false;
    }

    return (
      resume.ownerId === viewer.userId ||
      viewer.role === UserRole.ADMIN.toLowerCase() ||
      viewer.role === UserRole.MODERATOR.toLowerCase()
    );
  }

  private async getAvailability(resumeAdId: string) {
    const legacyContact = await this.findLegacyResumeContact(resumeAdId);

    if (!this.verifiedContactsService) {
      return legacyContact
        ? this.legacyAvailability()
        : {
            contactStatus: 'UNVERIFIED_LEGACY',
            verified: false,
            canPurchaseContact: false,
            maskedContact: null,
            verifiedAt: null,
            expiresAt: null,
            accessMode: 'MAX_VERIFIED_CONNECTION',
            price: RESUME_CONTACT_PRICE_RUB
          };
    }

    const availability = await this.verifiedContactsService.getResumeContactAvailability(resumeAdId);

    if (!availability.canPurchaseContact && availability.contactStatus === 'UNVERIFIED_LEGACY' && legacyContact) {
      return this.legacyAvailability();
    }

    return availability;
  }

  private requireVerifiedContactsService(): VerifiedContactsService {
    if (!this.verifiedContactsService) {
      throw new AppError('Verified contact service is not configured', 503);
    }

    return this.verifiedContactsService;
  }

  private async resolvePurchaseContactSource(resumeAdId: string, buyerUserId: string): Promise<ResumeContactPurchaseSource> {
    if (this.verifiedContactsService) {
      try {
        const verified = await this.verifiedContactsService.ensureContactForResumePurchase(resumeAdId, buyerUserId);

        return {
          source: 'verified',
          verifiedContactId: verified.contact.id,
          consentId: verified.consent.id,
          accessMode: ContactAccessMode.MAX_VERIFIED_CONNECTION
        };
      } catch (error) {
        if (!this.canFallbackToLegacyContact(error)) {
          throw error;
        }
      }
    }

    if (await this.findLegacyResumeContact(resumeAdId)) {
      return {
        source: 'legacy',
        verifiedContactId: null,
        consentId: null,
        accessMode: ContactAccessMode.MAX_VERIFIED_CONNECTION
      };
    }

    throw new AppError('Resume contact requires verification', 409, {
      code: 'CONTACT_NOT_VERIFIED'
    });
  }

  private async findLegacyResumeContact(resumeAdId: string): Promise<{ id: string } | null> {
    const resume = await this.db.ad.findFirst({
      where: {
        id: resumeAdId,
        type: AdType.RESUME,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        contacts: {
          some: {
            value: {
              not: ''
            }
          }
        }
      },
      select: {
        contacts: {
          where: {
            value: {
              not: ''
            }
          },
          select: {
            id: true
          },
          take: 1
        }
      }
    });

    return resume?.contacts?.[0] ?? null;
  }

  private legacyAvailability() {
    return {
      contactStatus: 'LEGACY_AVAILABLE',
      verified: false,
      canPurchaseContact: true,
      reason: null,
      maskedContact: '+7 *** ***-**-**',
      verifiedAt: null,
      expiresAt: null,
      accessMode: 'MAX_VERIFIED_CONNECTION',
      price: RESUME_CONTACT_PRICE_RUB
    };
  }

  private canFallbackToLegacyContact(error: unknown): boolean {
    if (!(error instanceof AppError)) {
      return false;
    }

    const code = (error.details as { code?: string } | undefined)?.code;

    return code === 'CONTACT_NOT_VERIFIED' || code === 'CONTACT_CONSENT_REQUIRED';
  }

  private toPaymentPayload(payment: {
    id: string;
    yooKassaPaymentId: string;
    status: PaymentStatus;
    amountValue: string;
    currency: string;
    confirmationUrl: string | null;
    rawPayloadJson: string | null;
  }): AdPaymentPayload {
    return {
      id: payment.id,
      paymentId: payment.yooKassaPaymentId,
      status: payment.status.toLowerCase(),
      amount: payment.amountValue,
      currency: payment.currency,
      confirmationUrl: payment.confirmationUrl,
      test: this.settings.testMode
    };
  }

  private mapPaymentStatus(status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'): PaymentStatus {
    if (status === 'succeeded') {
      return PaymentStatus.SUCCEEDED;
    }

    if (status === 'waiting_for_capture') {
      return PaymentStatus.WAITING_FOR_CAPTURE;
    }

    if (status === 'canceled') {
      return PaymentStatus.CANCELED;
    }

    return PaymentStatus.PENDING;
  }
}
