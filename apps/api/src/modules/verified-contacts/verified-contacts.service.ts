import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AdStatus,
  AdType,
  ContactAccessMode,
  ContactAccessStatus,
  ContactDisputeReason,
  ContactDisputeStatus,
  ContactSource,
  ContactStatus,
  UserStatus,
  VerifiedContactType,
  type Prisma,
  type PrismaClient
} from '@rabst24/db';
import { config } from '@rabst24/config';
import { AppError } from '@rabst24/shared';
import type { MaxApiClient, MaxMessageCreatedUpdate } from '@rabst24/max-api';
import type { AdPaymentRefundResult } from '../payments/ad-payment.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';

export const CONTACT_DISCLOSURE_CONSENT_TEXT =
  'Я разрешаю сервису использовать подтверждённый контакт для организации связи со мной по объявлениям и резюме.';

interface MiniAppContactPayload {
  phone: string;
  authDate: string | number;
  hash: string;
  userId: string | number;
}

export interface VerifiedContactDto {
  id: string;
  type: 'phone' | 'max_account';
  maskedValue: string;
  source: string;
  status: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  lastConfirmedAt: string | null;
  activeConsent: {
    id: string;
    consentType: string;
    documentVersion: string;
    acceptedAt: string;
  } | null;
}

export class VerifiedContactsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly maxApiClient: MaxApiClient,
    private readonly notificationService: NotificationService | undefined,
    private readonly settings: {
      botToken: string;
      verificationTtlDays: number;
      authDataMaxAgeSeconds: number;
      reverifyDeadlineHours: number;
      consentDocumentVersion: string;
      miniAppUrl: string;
      miniAppWebApp?: string;
      verifiedPhoneUnlockEnabled: boolean;
    }
  ) {}

  async verifyMiniAppContact(userId: string, payload: MiniAppContactPayload, requestMeta: { ip?: string | null } = {}) {
    this.assertEnabled(config.features.CONTACT_VERIFICATION_ENABLED && config.features.MAX_CONTACT_VERIFICATION_ENABLED);
    const user = await this.getActiveUser(userId);
    const maxUserId = String(payload.userId);

    if (maxUserId !== user.maxUserId) {
      throw new AppError('Contact payload belongs to another MAX user', 403, {
        code: 'MAX_CONTACT_FOREIGN_USER'
      });
    }

    const authDate = this.parseAuthDate(payload.authDate);
    this.assertFreshAuthDate(authDate);
    const normalizedPhone = normalizePhone(payload.phone);
    this.assertMiniAppHash({
      authDate: payload.authDate,
      phone: normalizedPhone,
      userId: maxUserId,
      hash: payload.hash
    });

    return this.storeVerifiedContact({
      userId,
      maxUserId,
      phone: normalizedPhone,
      source: ContactSource.MAX_MINI_APP,
      authDate,
      hash: payload.hash,
      requestMeta
    });
  }

  async handleBotContactMessage(update: MaxMessageCreatedUpdate): Promise<boolean> {
    if (!config.features.CONTACT_VERIFICATION_ENABLED || !config.features.BOT_CONTACT_FALLBACK_ENABLED) {
      return false;
    }

    const sender = update.message.sender;
    if (!sender || sender.is_bot) {
      return false;
    }

    const contact = extractContactAttachment(update);
    if (!contact) {
      return false;
    }

    if (!contact.hash || !contact.vcfInfo) {
      await this.maxApiClient.sendMessage({
        userId: sender.user_id,
        body: {
          text: 'Контакт не подтверждён MAX. Нажмите кнопку «Поделиться контактом», ручной текстовый номер не подходит.'
        }
      });
      return true;
    }

    const user = await this.db.user.findUnique({
      where: {
        maxUserId: String(sender.user_id)
      },
      select: {
        id: true,
        maxUserId: true,
        status: true
      }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return true;
    }

    this.assertBotContactHash(contact.vcfInfo, contact.hash);
    const phone = normalizePhone(contact.phone ?? extractPhoneFromVcf(contact.vcfInfo));

    await this.storeVerifiedContact({
      userId: user.id,
      maxUserId: user.maxUserId,
      phone,
      source: ContactSource.MAX_BOT,
      authDate: new Date((update.message.timestamp ?? update.timestamp) * 1000),
      hash: contact.hash,
      requestMeta: {}
    });

    await this.maxApiClient.sendMessage({
      userId: sender.user_id,
      body: {
        text: 'Контакт подтверждён через MAX. Вернитесь в мини-приложение и обновите статус.'
      }
    });

    return true;
  }

  async sendBotContactRequest(userId: string): Promise<{ sent: boolean }> {
    this.assertEnabled(config.features.CONTACT_VERIFICATION_ENABLED && config.features.BOT_CONTACT_FALLBACK_ENABLED);
    const user = await this.getActiveUser(userId);

    await this.maxApiClient.sendMessage({
      userId: user.maxUserId,
      body: {
        text: 'Подтвердите контакт для связи по резюме. Нажмите кнопку ниже, ручной текстовый номер не будет засчитан.',
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  {
                    type: 'request_contact',
                    text: 'Поделиться контактом'
                  }
                ]
              ]
            }
          }
        ]
      }
    });

    return { sent: true };
  }

  async listMine(userId: string): Promise<VerifiedContactDto[]> {
    const contacts = await this.db.verifiedContact.findMany({
      where: {
        userId
      },
      include: {
        consents: {
          where: {
            revokedAt: null
          },
          orderBy: {
            acceptedAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return contacts.map((contact) => this.toDto(contact));
  }

  async attachToResume(ownerId: string, input: { resumeAdId: string; verifiedContactId: string; consentId: string }) {
    const availability = await this.getResumeContactAvailability(input.resumeAdId, ownerId, {
      verifiedContactId: input.verifiedContactId,
      consentId: input.consentId
    });

    if (!availability.canPurchaseContact) {
      throw new AppError('Verified contact is not available for this resume', 409, {
        code: availability.reason ?? 'CONTACT_UNAVAILABLE'
      });
    }

    const updated = await this.db.resumeDetails.update({
      where: {
        adId: input.resumeAdId
      },
      data: {
        verifiedContactId: input.verifiedContactId,
        contactConsentId: input.consentId,
        contactAvailabilityStatus: availability.contactStatus
      }
    });

    return {
      resumeAdId: updated.adId,
      verifiedContactId: updated.verifiedContactId,
      consentId: updated.contactConsentId,
      contactAvailabilityStatus: updated.contactAvailabilityStatus
    };
  }

  async ensureContactForResumePurchase(resumeAdId: string, buyerUserId: string) {
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
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      },
      include: {
        resumeDetails: {
          include: {
            verifiedContact: true,
            contactConsent: true
          }
        }
      }
    });

    if (!resume || !resume.resumeDetails) {
      throw new AppError('Resume not found', 404, { resumeAdId });
    }

    if (resume.ownerId === buyerUserId) {
      throw new AppError('Owner cannot buy access to own resume contact', 409, {
        code: 'BUYER_IS_AUTHOR'
      });
    }

    const contact = resume.resumeDetails.verifiedContact;
    const consent = resume.resumeDetails.contactConsent;
    const now = new Date();

    if (!contact || !consent) {
      throw new AppError('Resume contact requires verification', 409, {
        code: 'CONTACT_NOT_VERIFIED'
      });
    }

    if (contact.userId !== resume.ownerId || consent.userId !== resume.ownerId || consent.verifiedContactId !== contact.id) {
      throw new AppError('Resume contact ownership mismatch', 409, {
        code: 'CONTACT_OWNERSHIP_MISMATCH'
      });
    }

    if (contact.status !== ContactStatus.VERIFIED || contact.revokedAt || (contact.expiresAt && contact.expiresAt <= now)) {
      throw new AppError('Verified contact is not active', 409, {
        code: contact.status === ContactStatus.DISPUTED ? 'CONTACT_DISPUTED' : 'CONTACT_EXPIRED_OR_REVOKED'
      });
    }

    if (consent.revokedAt || consent.consentType !== ContactAccessMode.MAX_VERIFIED_CONNECTION) {
      throw new AppError('Contact disclosure consent is not active', 409, {
        code: 'CONTACT_CONSENT_REQUIRED'
      });
    }

    return {
      resume,
      contact,
      consent,
      accessMode: ContactAccessMode.MAX_VERIFIED_CONNECTION
    };
  }

  async getResumeContactAvailability(
    resumeAdId: string,
    ownerId?: string | null,
    override?: { verifiedContactId?: string | null; consentId?: string | null }
  ) {
    const details = await this.db.resumeDetails.findUnique({
      where: {
        adId: resumeAdId
      },
      include: {
        ad: {
          select: {
            id: true,
            ownerId: true
          }
        },
        verifiedContact: true,
        contactConsent: true
      }
    });

    if (!details) {
      throw new AppError('Resume not found', 404, { resumeAdId });
    }

    if (ownerId && details.ad.ownerId !== ownerId) {
      throw new AppError('Resume belongs to another user', 403);
    }

    const contact = override?.verifiedContactId
      ? await this.db.verifiedContact.findUnique({ where: { id: override.verifiedContactId } })
      : details.verifiedContact;
    const consent = override?.consentId
      ? await this.db.contactDisclosureConsent.findUnique({ where: { id: override.consentId } })
      : details.contactConsent;
    const now = new Date();

    if (!contact) {
      return this.availability('UNVERIFIED_LEGACY', false, 'CONTACT_NOT_VERIFIED', null);
    }

    if (contact.userId !== details.ad.ownerId) {
      return this.availability('UNVERIFIED_LEGACY', false, 'CONTACT_OWNERSHIP_MISMATCH', contact);
    }

    if (contact.status === ContactStatus.DISPUTED) {
      return this.availability('DISPUTED', false, 'CONTACT_DISPUTED', contact);
    }

    if (contact.status !== ContactStatus.VERIFIED || contact.revokedAt) {
      return this.availability(contact.status, false, 'CONTACT_NOT_VERIFIED', contact);
    }

    if (contact.expiresAt && contact.expiresAt <= now) {
      return this.availability('EXPIRED', false, 'CONTACT_EXPIRED', contact);
    }

    if (!consent || consent.revokedAt || consent.userId !== details.ad.ownerId || consent.verifiedContactId !== contact.id) {
      return this.availability('CONSENT_REQUIRED', false, 'CONTACT_CONSENT_REQUIRED', contact);
    }

    return this.availability('AVAILABLE', true, null, contact);
  }

  async createActiveEntitlement(input: {
    buyerUserId: string;
    resumeAdId: string;
    paymentId: string;
    legacyUnlockId: string;
    verifiedContactId: string;
    consentId: string;
    authorUserId: string;
    accessMode: ContactAccessMode;
  }) {
    const entitlement = await this.db.contactAccessEntitlement.upsert({
      where: {
        paymentId: input.paymentId
      },
      update: {
        status: ContactAccessStatus.ACTIVE,
        grantedAt: new Date()
      },
      create: {
        buyerUserId: input.buyerUserId,
        resumeAdId: input.resumeAdId,
        authorUserId: input.authorUserId,
        verifiedContactId: input.verifiedContactId,
        consentId: input.consentId,
        paymentId: input.paymentId,
        legacyUnlockId: input.legacyUnlockId,
        accessMode: input.accessMode,
        status: ContactAccessStatus.ACTIVE,
        grantedAt: new Date()
      }
    });

    await this.notifyConnectionPurchased(entitlement.id, input);
    return entitlement;
  }

  async getEntitlementForBuyer(resumeAdId: string, buyerUserId: string) {
    return this.db.contactAccessEntitlement.findFirst({
      where: {
        buyerUserId,
        resumeAdId,
        status: ContactAccessStatus.ACTIVE,
        revokedAt: null
      },
      include: {
        verifiedContact: true,
        consent: true
      },
      orderBy: {
        grantedAt: 'desc'
      }
    });
  }

  async getProtectedContact(resumeAdId: string, buyerUserId: string) {
    const entitlement = await this.getEntitlementForBuyer(resumeAdId, buyerUserId);
    if (!entitlement) {
      throw new AppError('Contact access entitlement is required', 403, {
        code: 'CONTACT_ENTITLEMENT_REQUIRED'
      });
    }

    if (entitlement.accessMode === ContactAccessMode.VERIFIED_PHONE_UNLOCK) {
      if (!this.settings.verifiedPhoneUnlockEnabled) {
        throw new AppError('Direct verified phone unlock is disabled', 403, {
          code: 'VERIFIED_PHONE_UNLOCK_DISABLED'
        });
      }

      return {
        accessMode: 'VERIFIED_PHONE_UNLOCK',
        phone: this.decrypt(entitlement.verifiedContact.normalizedValueEncrypted),
        maskedContact: entitlement.verifiedContact.maskedValue
      };
    }

    return {
      accessMode: 'MAX_VERIFIED_CONNECTION',
      phone: null,
      maskedContact: entitlement.verifiedContact.maskedValue,
      message: 'Доступ активирован. Отправьте запрос автору через MAX, номер телефона не раскрывается автоматически.'
    };
  }

  async sendConnectionRequest(resumeAdId: string, buyerUserId: string): Promise<{ sent: boolean }> {
    const entitlement = await this.getEntitlementForBuyer(resumeAdId, buyerUserId);
    if (!entitlement) {
      throw new AppError('Contact access entitlement is required', 403);
    }

    const [buyer, resume] = await Promise.all([
      this.db.user.findUnique({ where: { id: buyerUserId }, select: { displayName: true, maxUsername: true, firstName: true, lastName: true } }),
      this.db.ad.findUnique({ where: { id: resumeAdId }, select: { title: true, owner: { select: { maxUserId: true } } } })
    ]);

    if (!resume) {
      throw new AppError('Resume not found', 404);
    }

    const buyerName = buyer?.displayName ?? ([buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ') || buyer?.maxUsername || 'RABST24 user');

    await this.maxApiClient.sendMessage({
      userId: resume.owner.maxUserId,
      body: {
        text: `${buyerName} оплатил возможность связаться по резюме «${resume.title}». Номер телефона не раскрыт автоматически.`,
        attachments: [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [
                  { type: 'callback', text: 'Связаться', payload: `resume_connection_contact:${entitlement.id}` },
                  { type: 'callback', text: 'Отклонить', payload: `resume_connection_decline:${entitlement.id}` }
                ]
              ]
            }
          }
        ]
      }
    });

    return { sent: true };
  }

  async openDispute(input: {
    entitlementId: string;
    buyerUserId: string;
    reason: ContactDisputeReason;
    comment?: string;
  }) {
    this.assertEnabled(config.features.CONTACT_DISPUTES_ENABLED);
    const entitlement = await this.db.contactAccessEntitlement.findFirst({
      where: {
        id: input.entitlementId,
        buyerUserId: input.buyerUserId,
        status: ContactAccessStatus.ACTIVE
      }
    });

    if (!entitlement) {
      throw new AppError('Active contact access entitlement not found', 404);
    }

    const deadline = new Date(Date.now() + this.settings.reverifyDeadlineHours * 60 * 60 * 1000);
    const dispute = await this.db.contactDispute.upsert({
      where: {
        entitlementId: entitlement.id
      },
      update: {},
      create: {
        entitlementId: entitlement.id,
        buyerUserId: entitlement.buyerUserId,
        authorUserId: entitlement.authorUserId,
        resumeAdId: entitlement.resumeAdId,
        reason: input.reason,
        comment: input.comment ?? null,
        status: ContactDisputeStatus.AWAITING_REVERIFICATION,
        authorReverifyDeadline: deadline,
        evidenceJson: JSON.stringify({ openedBy: 'buyer', note: input.reason })
      }
    });

    await this.db.$transaction([
      this.db.verifiedContact.update({
        where: {
          id: entitlement.verifiedContactId
        },
        data: {
          status: ContactStatus.DISPUTED
        }
      }),
      this.db.contactAccessEntitlement.update({
        where: {
          id: entitlement.id
        },
        data: {
          status: ContactAccessStatus.DISPUTED,
          disputeId: dispute.id
        }
      })
    ]);

    await this.notifyDisputeOpened(dispute.id, entitlement.authorUserId, entitlement.buyerUserId, entitlement.resumeAdId);
    return dispute;
  }

  async resolveDispute(input: {
    disputeId: string;
    moderatorId: string;
    resolution: ContactDisputeStatus;
    comment: string;
    refund?: () => Promise<AdPaymentRefundResult>;
  }) {
    const dispute = await this.db.contactDispute.findUnique({
      where: {
        id: input.disputeId
      },
      include: {
        entitlement: true
      }
    });

    if (!dispute) {
      throw new AppError('Contact dispute not found', 404);
    }

    const allowedResolutionStatuses = new Set<ContactDisputeStatus>([
      ContactDisputeStatus.RESOLVED_VALID_CONTACT,
      ContactDisputeStatus.RESOLVED_REFUND,
      ContactDisputeStatus.REJECTED_ABUSE
    ]);

    if (!allowedResolutionStatuses.has(input.resolution)) {
      throw new AppError('Unsupported dispute resolution', 400);
    }

    let refundPaymentId: string | null = null;
    if (input.resolution === ContactDisputeStatus.RESOLVED_REFUND) {
      const refund = await input.refund?.();
      refundPaymentId = refund?.refundId ?? null;
    }

    return this.db.contactDispute.update({
      where: {
        id: dispute.id
      },
      data: {
        status: input.resolution,
        resolvedBy: input.moderatorId,
        resolution: input.comment,
        refundPaymentId,
        resolvedAt: new Date()
      }
    });
  }

  private async storeVerifiedContact(input: {
    userId: string;
    maxUserId: string;
    phone: string;
    source: ContactSource;
    authDate: Date;
    hash: string;
    requestMeta: { ip?: string | null };
  }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.settings.verificationTtlDays * 24 * 60 * 60 * 1000);
    const encrypted = this.encrypt(input.phone);
    const fingerprint = createHash('sha256').update(input.hash).digest('hex');

    const contact = await this.db.verifiedContact.create({
      data: {
        userId: input.userId,
        type: VerifiedContactType.PHONE,
        normalizedValueEncrypted: encrypted,
        maskedValue: maskPhone(input.phone),
        source: input.source,
        maxUserId: input.maxUserId,
        verifiedAt: now,
        verificationAuthDate: input.authDate,
        verificationHashFingerprint: fingerprint,
        expiresAt,
        lastConfirmedAt: now,
        status: ContactStatus.VERIFIED
      }
    });

    const consent = await this.db.contactDisclosureConsent.create({
      data: {
        userId: input.userId,
        verifiedContactId: contact.id,
        consentType: ContactAccessMode.MAX_VERIFIED_CONNECTION,
        documentVersion: this.settings.consentDocumentVersion,
        acceptedAt: now,
        ipHash: input.requestMeta.ip ? createHash('sha256').update(input.requestMeta.ip).digest('hex') : null,
        sessionMetadataJson: JSON.stringify({
          consentText: CONTACT_DISCLOSURE_CONSENT_TEXT,
          source: input.source
        })
      }
    });

    await this.notificationService?.notify({
      userId: input.userId,
      type: 'CONTACT_VERIFIED',
      title: 'Контакт подтверждён',
      body: `Контакт ${contact.maskedValue} подтверждён через MAX.`,
      category: 'ad_status',
      idempotencyKey: `contact:${contact.id}:verified`,
      payload: {
        contactId: contact.id,
        expiresAt: expiresAt.toISOString()
      }
    });

    return {
      contact: this.toDto({ ...contact, consents: [consent] }),
      consent: {
        id: consent.id,
        consentType: consent.consentType,
        documentVersion: consent.documentVersion,
        acceptedAt: consent.acceptedAt.toISOString()
      }
    };
  }

  private async getActiveUser(userId: string) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        maxUserId: true,
        status: true,
        deletedAt: true
      }
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      throw new AppError('Active user is required', 403);
    }

    return user;
  }

  private assertMiniAppHash(input: { authDate: string | number; phone: string; userId: string; hash: string }): void {
    const phoneWithoutPlus = input.phone.replace(/^\+/, '');
    const dataCheckString = [
      ['authDate', String(input.authDate)],
      ['phone', phoneWithoutPlus],
      ['userId', input.userId]
    ]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const expected = createHmac('sha256', this.settings.botToken).update(dataCheckString).digest('hex');

    if (!safeCompareHex(input.hash, expected)) {
      throw new AppError('Invalid MAX contact hash', 401, {
        code: 'MAX_CONTACT_HASH_INVALID'
      });
    }
  }

  private assertBotContactHash(vcfInfo: string, hash: string): void {
    const normalizedVcf = vcfInfo.replace(/\\r\\n/g, '\r\n');
    const expected = createHmac('sha256', this.settings.botToken).update(normalizedVcf).digest('hex');

    if (!safeCompareHex(hash, expected)) {
      throw new AppError('Invalid MAX bot contact hash', 401, {
        code: 'MAX_BOT_CONTACT_HASH_INVALID'
      });
    }
  }

  private parseAuthDate(value: string | number): Date {
    const timestamp = Number(value);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new AppError('Invalid contact authDate', 400);
    }

    return new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000);
  }

  private assertFreshAuthDate(authDate: Date): void {
    const now = Date.now();
    const value = authDate.getTime();
    const futureSkewMs = 5 * 60 * 1000;

    if (value > now + futureSkewMs) {
      throw new AppError('Contact authDate is in the future', 400);
    }

    if ((now - value) / 1000 > this.settings.authDataMaxAgeSeconds) {
      throw new AppError('Contact authDate is expired', 400, {
        code: 'MAX_CONTACT_AUTH_DATE_EXPIRED'
      });
    }
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const key = this.encryptionKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [, rawIv, rawTag, rawEncrypted] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(rawIv, 'base64'));
    decipher.setAuthTag(Buffer.from(rawTag, 'base64'));

    return Buffer.concat([decipher.update(Buffer.from(rawEncrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    return createHash('sha256').update(config.session.secret).digest();
  }

  private availability(contactStatus: string, canPurchaseContact: boolean, reason: string | null, contact: { maskedValue: string; verifiedAt: Date | null; expiresAt: Date | null } | null) {
    return {
      contactStatus,
      verified: contactStatus === 'AVAILABLE',
      canPurchaseContact,
      reason,
      maskedContact: contact?.maskedValue ?? null,
      verifiedAt: contact?.verifiedAt?.toISOString() ?? null,
      expiresAt: contact?.expiresAt?.toISOString() ?? null,
      accessMode: 'MAX_VERIFIED_CONNECTION',
      price: config.contacts.resumeConnectionPriceRub
    };
  }

  private async notifyConnectionPurchased(entitlementId: string, input: { buyerUserId: string; authorUserId: string; resumeAdId: string }) {
    await Promise.all([
      this.notificationService?.notify({
        userId: input.buyerUserId,
        type: 'RESUME_CONNECTION_ACCESS_ACTIVE',
        title: 'Доступ к связи активирован',
        body: 'Оплата подтверждена. Можно отправить автору запрос на связь через MAX.',
        category: 'payments',
        critical: true,
        idempotencyKey: `contact-entitlement:${entitlementId}:buyer-active`,
        payload: {
          entitlementId,
          resumeAdId: input.resumeAdId
        }
      }),
      this.notificationService?.notify({
        userId: input.authorUserId,
        type: 'RESUME_CONNECTION_PURCHASED',
        title: 'Поступил запрос на связь',
        body: 'Пользователь оплатил возможность связаться по вашему резюме.',
        category: 'applications',
        critical: true,
        idempotencyKey: `contact-entitlement:${entitlementId}:author-purchased`,
        payload: {
          entitlementId,
          resumeAdId: input.resumeAdId
        }
      })
    ]);
  }

  private async notifyDisputeOpened(disputeId: string, authorUserId: string, buyerUserId: string, resumeAdId: string) {
    await Promise.all([
      this.notificationService?.notify({
        userId: authorUserId,
        type: 'CONTACT_DISPUTE_OPENED',
        title: 'Открыт спор по контакту',
        body: 'Пожалуйста, подтвердите контакт повторно. Новые продажи этого контакта временно остановлены.',
        category: 'applications',
        critical: true,
        idempotencyKey: `contact-dispute:${disputeId}:author-opened`,
        payload: { disputeId, resumeAdId }
      }),
      this.notificationService?.notify({
        userId: buyerUserId,
        type: 'CONTACT_DISPUTE_OPENED',
        title: 'Спор открыт',
        body: 'Мы запросили повторное подтверждение контакта у автора.',
        category: 'payments',
        critical: true,
        idempotencyKey: `contact-dispute:${disputeId}:buyer-opened`,
        payload: { disputeId, resumeAdId }
      })
    ]);
  }

  private toDto(contact: Prisma.VerifiedContactGetPayload<{ include: { consents: true } }>): VerifiedContactDto {
    const activeConsent = contact.consents.find((consent) => !consent.revokedAt) ?? null;

    return {
      id: contact.id,
      type: contact.type.toLowerCase() as 'phone' | 'max_account',
      maskedValue: contact.maskedValue,
      source: contact.source.toLowerCase(),
      status: contact.status.toLowerCase(),
      verifiedAt: contact.verifiedAt?.toISOString() ?? null,
      expiresAt: contact.expiresAt?.toISOString() ?? null,
      lastConfirmedAt: contact.lastConfirmedAt?.toISOString() ?? null,
      activeConsent: activeConsent
        ? {
            id: activeConsent.id,
            consentType: activeConsent.consentType,
            documentVersion: activeConsent.documentVersion,
            acceptedAt: activeConsent.acceptedAt.toISOString()
          }
        : null
    };
  }

  private assertEnabled(enabled: boolean): void {
    if (!enabled) {
      throw new AppError('Contact verification is disabled', 503, {
        code: 'CONTACT_VERIFICATION_DISABLED'
      });
    }
  }
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length < 7 || digits.length > 15) {
    throw new AppError('Invalid phone number', 400, {
      code: 'PHONE_INVALID'
    });
  }

  return `+${digits}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const lastTwo = digits.slice(-2).padStart(2, '*');

  if (digits.startsWith('7') && digits.length >= 11) {
    return `+7 *** ***-**-${lastTwo}`;
  }

  return `+*** *** **-${lastTwo}`;
}

function safeCompareHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function extractContactAttachment(update: MaxMessageCreatedUpdate): { vcfInfo?: string; hash?: string; phone?: string } | null {
  const attachment = update.message.body?.attachments?.find((item) => item?.type === 'contact') as
    | { payload?: Record<string, unknown> }
    | undefined;
  const payload = attachment?.payload;

  if (!payload) {
    return null;
  }

  const vcfInfo = typeof payload.vcf_info === 'string' ? payload.vcf_info : undefined;
  const hash = typeof payload.hash === 'string' ? payload.hash : undefined;
  const maxInfo = payload.max_info && typeof payload.max_info === 'object' && !Array.isArray(payload.max_info)
    ? (payload.max_info as Record<string, unknown>)
    : {};
  const phone = typeof maxInfo.phone === 'string' ? maxInfo.phone : undefined;

  return { vcfInfo, hash, phone };
}

function extractPhoneFromVcf(vcfInfo: string): string {
  const normalized = vcfInfo.replace(/\\r\\n/g, '\r\n');
  const line = normalized.split(/\r?\n/).find((item) => /^TEL/i.test(item));
  const phone = line?.split(':').pop()?.trim();

  if (!phone) {
    throw new AppError('Contact message has no phone', 400);
  }

  return phone;
}
