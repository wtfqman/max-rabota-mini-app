import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  AdStatus,
  AdType,
  AdReportStatus,
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  PaymentStatus,
  PromotionProductType,
  SavedSearchFrequency,
  ProfileType,
  UserRole,
  UserStatus,
  UserTrustBadge
} from '@rabst24/db';
import {
  AD_TYPES,
  VACANCY_MEDIA_FEE_AMOUNT_RUB,
  VACANCY_MEDIA_HIGHLIGHT_AMOUNT_RUB,
  VACANCY_PUBLICATION_PLANS,
  addMoneyValues,
  getVacancyPublicationPaymentAmount,
  getRejectedVacancyRefundPolicy,
  hasPaidVacancyMedia,
  requiresVacancyMediaFee,
  isValidExternalUrl,
  isValidPaymentConfirmationUrl,
  isVacancyPublicationFundingMode,
  buildDisabledFeatureFlags,
  pickPublicFeatureFlags,
  classifyVacancyPaymentPurpose,
  getPaymentPurposeEffects,
  normalizePaymentPurpose,
  requiresAdPayment,
  ExternalApiError,
  type CreateAdDto
} from '@rabst24/shared';
import { AdPaymentService } from '../apps/api/src/modules/payments/ad-payment.service.js';
import { PaymentHistoryService } from '../apps/api/src/modules/payments/payment-history.service.js';
import { AdsService } from '../apps/api/src/modules/ads/ads.service.js';
import { AdRevisionRepository, parseRevisionData, type AdRevisionRecord } from '../apps/api/src/modules/ads/ad-revision.repository.js';
import { saveAdRevisionSchema } from '../apps/api/src/modules/ads/ads.schemas.js';
import { AdRepository } from '../packages/core/src/ads/ad.repository.js';
import { requireFeature } from '../apps/api/src/shared/feature-flags/feature-guard.js';
import {
  OUTBOX_JOB_STATUS,
  type OutboxJobCreateInput,
  type OutboxJobRecord,
  type OutboxJobRepositoryLike
} from '../apps/api/src/modules/outbox/outbox.repository.js';
import { OutboxService } from '../apps/api/src/modules/outbox/outbox.service.js';
import { ModerationModuleService } from '../apps/api/src/modules/moderation/moderation.service.js';
import { ModerationNotificationService } from '../apps/api/src/modules/moderation/moderation-notification.service.js';
import { VacanciesService } from '../apps/api/src/modules/vacancies/vacancies.service.js';
import { createVacancySchema } from '../apps/api/src/modules/vacancies/vacancies.schemas.js';
import { createVacancyPayloadSchema } from '../apps/web/src/features/vacancies/create-vacancy.types.js';
import { openExternalUrlWithResult } from '../apps/web/src/shared/max/max-bridge.js';
import { createResumeSchema, resumeListQuerySchema } from '../apps/api/src/modules/resumes/resumes.schemas.js';
import { createResumePayloadSchema } from '../apps/web/src/features/resumes/create-resume.types.js';
import { createEquipmentSchema } from '../apps/api/src/modules/equipment/equipment.schemas.js';
import { createEquipmentPayloadSchema } from '../apps/web/src/features/equipment/create-equipment.types.js';
import { createTradeAdSchema } from '../apps/api/src/modules/trade/trade.schemas.js';
import { createProductPayloadSchema } from '../apps/web/src/features/products/create-product.types.js';
import { ResumeContactPurchasesService } from '../apps/api/src/modules/resume-contact-purchases/resume-contact-purchases.service.js';
import { sanitizeApplicationResumeDetail } from '../apps/api/src/modules/applications/applications.service.js';
import { NotificationService } from '../apps/api/src/modules/notifications/notifications.service.js';
import { SavedSearchesService } from '../apps/api/src/modules/saved-searches/saved-searches.service.js';
import { PromotionsService } from '../apps/api/src/modules/promotions/promotions.service.js';
import { AdAnalyticsService } from '../apps/api/src/modules/ad-analytics/ad-analytics.service.js';
import { AdReportsService } from '../apps/api/src/modules/ad-reports/ad-reports.service.js';
import { requireRole } from '../apps/api/src/middlewares/auth.middleware.js';
import { ProfilesService } from '../apps/api/src/modules/profiles/profiles.service.js';
import { updateProfileSchema } from '../apps/api/src/modules/profiles/profiles.schemas.js';
import { UsersService } from '../apps/api/src/modules/users/users.service.js';
import { serializePublicProfile } from '../apps/api/src/modules/users/users.controller.js';

for (const type of AD_TYPES) {
  assert.equal(requiresAdPayment(type), type === 'vacancy', `${type} payment rule`);
}

assert.equal(requiresAdPayment('VACANCY'), true, 'Prisma enum vacancy is paid');
assert.equal(requiresAdPayment('RESUME'), false, 'Prisma enum resume is free');
assert.equal(requiresAdPayment('EQUIPMENT'), false, 'Prisma enum equipment is free');
assert.equal(requiresAdPayment('MATERIAL'), false, 'Prisma enum material is free');
assert.equal(requiresAdPayment('TOOL'), false, 'Prisma enum tool is free');

assertProductionConfigFailure(
  {
    DEV_AUTH_ENABLED: 'true',
    YOOKASSA_ENABLED: 'false',
    YOOKASSA_TEST_MODE: 'false'
  },
  'DEV_AUTH_ENABLED',
  'production rejects dev auth'
);

assertProductionConfigFailure(
  {
    DEV_AUTH_ENABLED: 'false',
    YOOKASSA_ENABLED: 'true',
    YOOKASSA_SHOP_ID: '1396908',
    YOOKASSA_SECRET_KEY: 'live_secret_key_for_test_process_only',
    YOOKASSA_TEST_MODE: 'true'
  },
  'YOOKASSA_TEST_MODE',
  'production rejects YooKassa test mode'
);

const disabledFeatureFlags = buildDisabledFeatureFlags();
const enabledApplicationsFeatureFlags = {
  ...disabledFeatureFlags,
  APPLICATIONS_ENABLED: true
};
const publicFeatureFlags = pickPublicFeatureFlags({
  ...disabledFeatureFlags,
  APPLICATIONS_ENABLED: true,
  RESUME_CONTACT_PURCHASE_ENABLED: true
});
let disabledFeatureError: unknown = null;
let enabledFeatureError: unknown = null;

requireFeature('APPLICATIONS_ENABLED', disabledFeatureFlags)(
  {} as Parameters<ReturnType<typeof requireFeature>>[0],
  {} as Parameters<ReturnType<typeof requireFeature>>[1],
  (error?: unknown) => {
    disabledFeatureError = error ?? null;
  }
);
requireFeature('APPLICATIONS_ENABLED', enabledApplicationsFeatureFlags)(
  {} as Parameters<ReturnType<typeof requireFeature>>[0],
  {} as Parameters<ReturnType<typeof requireFeature>>[1],
  (error?: unknown) => {
    enabledFeatureError = error ?? null;
  }
);

assert.equal(
  (disabledFeatureError as { statusCode?: number; details?: { code?: string } } | null)?.statusCode,
  404,
  'feature disabled route is inaccessible'
);
assert.equal(
  (disabledFeatureError as { details?: { code?: string } } | null)?.details?.code,
  'FEATURE_DISABLED',
  'feature disabled route reports guarded feature'
);
assert.equal(enabledFeatureError, null, 'feature enabled route is accessible');
assert.deepEqual(
  Object.keys(publicFeatureFlags).sort(),
  [
    'AD_ANALYTICS_ENABLED',
    'APPLICATIONS_ENABLED',
    'BOT_CONTACT_FALLBACK_ENABLED',
    'CONTACT_DISPUTES_ENABLED',
    'CONTACT_VERIFICATION_ENABLED',
    'FINANCE_DASHBOARD_ENABLED',
    'MAX_CONTACT_VERIFICATION_ENABLED',
    'PROMOTIONS_ENABLED',
    'PUBLIC_PROFILES_ENABLED',
    'REPORTS_ENABLED',
    'RESUME_CONNECTION_PURCHASE_ENABLED',
    'RESUME_CONTACT_PURCHASE_ENABLED',
    'SAVED_SEARCHES_ENABLED',
    'TELEGRAM_SYNC_ENABLED',
    'USER_NOTIFICATIONS_ENABLED',
    'VERIFIED_PHONE_UNLOCK_ENABLED'
  ].sort(),
  'frontend receives only public feature flags'
);
assert.equal(publicFeatureFlags.APPLICATIONS_ENABLED, true, 'public feature flags preserve enabled values');

const vacancyPackagePurpose = classifyVacancyPaymentPurpose({
  packagePublications: 7,
  includesMediaFee: true
});
assert.deepEqual(
  vacancyPackagePurpose,
  {
    primary: 'VACANCY_PACKAGE',
    components: ['VACANCY_PACKAGE', 'VACANCY_MEDIA_FEE']
  },
  'combined vacancy payment keeps package and media components'
);
assert.deepEqual(
  getPaymentPurposeEffects(vacancyPackagePurpose),
  {
    addsVacancyPublications: true,
    consumesVacancyPublication: true,
    submitsVacancyToModeration: true,
    unlocksResumeContact: false,
    activatesPromotion: false
  },
  'vacancy package payment routes to vacancy publication handler'
);
assert.deepEqual(
  getPaymentPurposeEffects({
    primary: 'RESUME_CONTACT_UNLOCK',
    components: ['RESUME_CONTACT_UNLOCK']
  }),
  {
    addsVacancyPublications: false,
    consumesVacancyPublication: false,
    submitsVacancyToModeration: false,
    unlocksResumeContact: true,
    activatesPromotion: false
  },
  'resume contact payment cannot credit vacancy publications'
);
const contactPrivacyService = new ResumeContactPurchasesService({} as never, {} as never, undefined, {
  enabled: true,
  currency: 'RUB',
  returnUrl: 'https://app.rabst24.ru/resumes/test',
  testMode: true
});
const maskedResumeContact = contactPrivacyService.maskContacts(
  {
    contacts: [{ id: 'contact-1', type: 'phone', label: 'Телефон', value: '+79990000000', isPreferred: true }]
  },
  false
);
assert.equal(maskedResumeContact.contacts.length, 0, 'public resume contact is removed from serialized response when locked');
assert.equal(maskedResumeContact.contactAccess.canViewContacts, false, 'locked resume contact exposes access state only');
const visibleResumeContact = contactPrivacyService.maskContacts(
  {
    contacts: [{ id: 'contact-1', type: 'phone', label: 'Телефон', value: '+79990000000', isPreferred: true }]
  },
  true
);
assert.equal(visibleResumeContact.contacts[0]?.value, '+79990000000', 'owner/admin/buyer receives full resume contact');
const voluntaryApplicationAccessService = new ResumeContactPurchasesService(
  {
    ad: {
      findFirst: async () => ({
        id: 'resume-application-access',
        ownerId: 'applicant-user',
        type: AdType.RESUME,
        status: AdStatus.PUBLISHED,
        title: 'Резюме отделочника'
      })
    },
    resumeContactUnlock: {
      findUnique: async () => null
    }
  } as never,
  {} as never,
  undefined,
  {
    enabled: true,
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/resumes/test',
    testMode: true
  }
);
assert.equal(
  (
    await voluntaryApplicationAccessService.getAccess('resume-application-access', {
      userId: 'employer-user',
      role: 'user'
    })
  ).canViewContacts,
  false,
  'vacancy owner still needs to buy resume contact even after voluntary application'
);
assert.equal(
  (
    await voluntaryApplicationAccessService.getAccess('resume-application-access', {
      userId: 'foreign-user',
      role: 'user'
    })
  ).canViewContacts,
  false,
  'foreign user still needs to buy resume contact'
);
const paidResumeContactAccessService = new ResumeContactPurchasesService(
  {
    ad: {
      findFirst: async () => ({
        id: 'resume-paid-contact-access',
        ownerId: 'resume-owner',
        type: AdType.RESUME,
        status: AdStatus.PUBLISHED,
        title: 'Резюме электрика'
      })
    },
    jobApplication: {
      findFirst: async () => null
    },
    resumeContactUnlock: {
      findUnique: async () => ({
        status: PaymentStatus.SUCCEEDED,
        unlockedAt: new Date('2026-08-11T00:00:00.000Z'),
        refundedAt: null
      })
    }
  } as never,
  {} as never,
  undefined,
  {
    enabled: true,
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/resumes/test',
    testMode: true
  }
);
const paidResumeContactAccess = await paidResumeContactAccessService.getAccess('resume-paid-contact-access', {
  userId: 'employer-buyer',
  role: 'user'
});
assert.equal(paidResumeContactAccess.alreadyPurchased, true, 'successful resume contact unlock is remembered');
assert.equal(paidResumeContactAccess.canViewContacts, true, 'successful resume contact unlock opens the phone number');
const paidResumeContactDetail = paidResumeContactAccessService.enrichMaskedContacts(
  {
    contacts: [{ id: 'paid-contact-1', type: 'phone', label: 'РўРµР»РµС„РѕРЅ', value: '+79990000000', isPreferred: true }]
  },
  paidResumeContactAccess
);
assert.equal(paidResumeContactDetail.contacts[0]?.value, '+79990000000', 'paid resume contact detail keeps the full phone number');
assert.equal(paidResumeContactDetail.contactAccess.maskedContact, null, 'paid resume contact detail does not keep a stale masked phone');
let legacyUnlockWrite: { verifiedContactId?: string | null; consentId?: string | null } | null = null;
const legacyResumeContactService = new ResumeContactPurchasesService(
  {
    ad: {
      findFirst: async () => ({
        id: 'legacy-resume-contact',
        ownerId: 'legacy-owner',
        type: AdType.RESUME,
        status: AdStatus.PUBLISHED,
        title: 'Старое резюме',
        contacts: [{ id: 'legacy-contact-1' }]
      })
    },
    jobApplication: {
      findFirst: async () => null
    },
    resumeContactUnlock: {
      findUnique: async () => null,
      upsert: async (query: { update: { verifiedContactId?: string | null; consentId?: string | null } }) => {
        legacyUnlockWrite = query.update;
        return {};
      }
    },
    adPayment: {
      upsert: async () => ({
        id: 'legacy-payment',
        yooKassaPaymentId: 'yk-legacy',
        status: PaymentStatus.PENDING,
        amountValue: '20.00',
        currency: 'RUB',
        confirmationUrl: 'https://yookassa.ru/payments/legacy',
        rawPayloadJson: '{}'
      })
    }
  } as never,
  {
    createPayment: async () => ({
      id: 'yk-legacy',
      status: 'pending',
      confirmation: {
        confirmation_url: 'https://yookassa.ru/payments/legacy'
      }
    })
  } as never,
  undefined,
  {
    enabled: true,
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/resumes/test',
    testMode: true
  }
);
const legacyResumeAccess = await legacyResumeContactService.getAccess('legacy-resume-contact', {
  userId: 'legacy-buyer',
  role: 'user'
});
assert.equal(legacyResumeAccess.canPurchaseContact, true, 'legacy resume contact is purchasable');
const legacyResumePurchase = await legacyResumeContactService.createPurchase('legacy-buyer', 'legacy-resume-contact');
assert.equal(legacyResumePurchase.payment?.amount, '20.00', 'legacy resume contact purchase costs 20 RUB');
const capturedLegacyUnlockWrite = legacyUnlockWrite as { verifiedContactId?: string | null; consentId?: string | null } | null;
assert.ok(capturedLegacyUnlockWrite, 'legacy resume contact unlock is written');
assert.equal(capturedLegacyUnlockWrite.verifiedContactId, null, 'legacy resume contact unlock does not require verified contact id');
assert.equal(capturedLegacyUnlockWrite.consentId, null, 'legacy resume contact unlock does not require consent id');
const applicationResumeDetail = sanitizeApplicationResumeDetail({
  type: 'resume',
  contacts: [{ id: 'contact-1', type: 'phone', label: 'Телефон', value: '+79990000000', isPreferred: true }]
} as ReturnType<typeof sanitizeApplicationResumeDetail>);
assert.equal(applicationResumeDetail.contacts.length, 0, 'embedded application resume does not expose legacy contact directly');
assert.equal(
  getPaymentPurposeEffects({
    primary: 'AD_PROMOTION',
    components: ['AD_PROMOTION']
  }).submitsVacancyToModeration,
  false,
  'promotion payment does not submit ad to moderation'
);
assert.deepEqual(
  normalizePaymentPurpose({
    purposeCode: null,
    purposeComponents: null,
    packagePublications: 3,
    includesMediaFee: false
  }),
  {
    primary: 'VACANCY_PACKAGE',
    components: ['VACANCY_PACKAGE']
  },
  'old payments keep legacy vacancy package purpose'
);
assert.deepEqual(
  normalizePaymentPurpose({
    purposeCode: 'RESUME_CONTACT_UNLOCK',
    purposeComponents: ['VACANCY_PACKAGE']
  }),
  {
    primary: 'RESUME_CONTACT_UNLOCK',
    components: ['RESUME_CONTACT_UNLOCK']
  },
  'conflicting stored payment components cannot turn resume contact unlock into vacancy package'
);
assert.deepEqual(
  getPaymentPurposeEffects(
    normalizePaymentPurpose({
      purposeCode: 'AD_PROMOTION',
      purposeComponents: ['VACANCY_PACKAGE', 'AD_PROMOTION']
    })
  ),
  {
    addsVacancyPublications: false,
    consumesVacancyPublication: false,
    submitsVacancyToModeration: false,
    unlocksResumeContact: false,
    activatesPromotion: true
  },
  'conflicting stored promotion payment components cannot submit an ad to moderation'
);
assert.deepEqual(
  normalizePaymentPurpose({
    purposeCode: 'VACANCY_PACKAGE',
    purposeComponents: null,
    packagePublications: 1,
    includesMediaFee: true
  }),
  {
    primary: 'VACANCY_PACKAGE',
    components: ['VACANCY_PACKAGE', 'VACANCY_MEDIA_FEE']
  },
  'old vacancy package payment with media flag keeps legacy media component'
);

const financeHarness = createMemoryFinanceHarness();
const paymentHistoryService = new PaymentHistoryService(financeHarness.db as never);
const ownPaymentHistory = await paymentHistoryService.listUserHistory('finance-owner');
assert.equal(ownPaymentHistory.items.length, 5, 'own history returns production user operations');
assert.equal(ownPaymentHistory.items.some((item) => item.test), false, 'own history excludes test payments');
assert.equal(
  JSON.stringify(financeHarness.lastHistoryWhere).includes('finance-owner'),
  true,
  'own history is scoped by current user'
);
assert.equal(
  JSON.stringify(financeHarness.lastHistoryWhere).includes('foreign-user'),
  false,
  'foreign payment history is not requested by user endpoint'
);
assert.equal(ownPaymentHistory.items[0]?.yooKassaPaymentIdMasked.includes('***'), true, 'YooKassa payment id is masked');
assert.equal(ownPaymentHistory.items.some((item) => item.isResumeContactUnlock), true, 'history includes contact unlock purpose');
assert.equal(ownPaymentHistory.items.some((item) => item.isPromotion), true, 'history includes promotion purpose');

const financeMetrics = await paymentHistoryService.calculateMetrics(
  {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-03T00:00:00.000Z')
  },
  false
);
assert.equal(financeMetrics.revenue, '970.00', 'admin metrics exclude test payments from gross revenue');
assert.equal(financeMetrics.refunds, '120.00', 'admin metrics include full and partial refunds');
assert.equal(financeMetrics.netRevenue, '850.00', 'admin metrics subtract refunds from revenue');
assert.equal(financeMetrics.succeededPayments, 5, 'admin metrics count succeeded/refunded records');
assert.equal(
  financeMetrics.revenueByPurpose.find((item) => item.purpose === 'VACANCY_PACKAGE')?.netRevenue,
  '750.00',
  'purpose grouping accounts partial refund net'
);
assert.equal(
  financeMetrics.revenueByPurpose.find((item) => item.purpose === 'AD_PROMOTION')?.netRevenue,
  '80.00',
  'promotion revenue is grouped by purpose'
);
assert.equal(financeMetrics.revenuePromotions, '80.00', 'promotion revenue summary is calculated');
assert.equal(financeMetrics.revenueContactUnlocks, '20.00', 'contact unlock revenue summary is calculated');
assert.equal(financeMetrics.pendingPayments, 1, 'pending payments are counted separately');
const financeMetricsWithTest = await paymentHistoryService.calculateMetrics(
  {
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-03T00:00:00.000Z')
  },
  true
);
assert.equal(financeMetricsWithTest.revenue, '1970.00', 'test payment can be separated from production metrics');

const financeCsv = await paymentHistoryService.exportAdminCsv({
  from: '2026-08-01',
  to: '2026-08-02'
});
assert.equal(financeCsv.includes('paymentId,userId,user,purpose,amount,refund,net,status,createdAt'), true, 'CSV export has finance columns');
assert.equal(financeCsv.includes('yk-test-payment'), false, 'CSV export excludes test payments by default');
let csvRoleError: unknown = null;
requireRole(['admin'])(
  { auth: { userId: 'moderator-user', role: 'moderator' } } as Parameters<ReturnType<typeof requireRole>>[0],
  {} as Parameters<ReturnType<typeof requireRole>>[1],
  (error?: unknown) => {
    csvRoleError = error ?? null;
  }
);
assert.equal((csvRoleError as { statusCode?: number } | null)?.statusCode, 403, 'CSV export is admin-only');

let normalizedBalanceUpdate: unknown = null;
const legacyBalancePaymentService = new AdPaymentService(
  {
    userVacancyPublicationBalance: {
      findUnique: async () => ({
        userId: 'legacy-balance-owner',
        purchased: 5,
        bonus: 1,
        used: 3,
        remaining: 9
      }),
      update: async ({ data }: { data: { remaining: number } }) => {
        normalizedBalanceUpdate = data;
        return {
          userId: 'legacy-balance-owner',
          purchased: 5,
          bonus: 1,
          used: 3,
          remaining: data.remaining
        };
      }
    }
  } as never,
  {} as never,
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {
    notifyNewAd: async () => undefined
  } as never
);
const normalizedLegacyBalance = await legacyBalancePaymentService.getVacancyPublicationBalance('legacy-balance-owner');
assert.equal(normalizedLegacyBalance.remaining, 3, 'legacy publication balance remaining is normalized before use');
assert.deepEqual(normalizedBalanceUpdate, { remaining: 3 }, 'mismatched legacy balance is repaired server-side');

const memoryOutbox = createMemoryOutboxRepository();
const outboxService = new OutboxService(memoryOutbox.repository, {
  lockTimeoutMs: 60_000
});
const duplicateJobFirst = await outboxService.enqueue({
  type: 'NOOP',
  payload: {
    source: 'test'
  },
  idempotencyKey: 'duplicate-outbox-key'
});
const duplicateJobSecond = await outboxService.enqueue({
  type: 'NOOP',
  payload: {
    source: 'test'
  },
  idempotencyKey: 'duplicate-outbox-key'
});

assert.equal(duplicateJobSecond.id, duplicateJobFirst.id, 'duplicate outbox idempotency key returns existing job');
assert.equal(memoryOutbox.jobs.length, 1, 'duplicate outbox idempotency key does not create second job');

memoryOutbox.jobs[0].status = OUTBOX_JOB_STATUS.FAILED;
memoryOutbox.jobs[0].attempts = 5;
memoryOutbox.jobs[0].lastError = 'old failure';
memoryOutbox.jobs[0].completedAt = new Date('2026-07-31T08:00:00.000Z');

const revivedJob = await outboxService.enqueue({
  type: 'NOOP',
  payload: {
    source: 'test'
  },
  idempotencyKey: 'duplicate-outbox-key',
  reviveTerminal: true
});

assert.equal(revivedJob.id, duplicateJobFirst.id, 'terminal outbox job is revived without creating a duplicate');
assert.equal(revivedJob.status, OUTBOX_JOB_STATUS.PENDING, 'revived outbox job returns to pending');
assert.equal(revivedJob.attempts, 0, 'revived outbox job resets attempts');
assert.equal(revivedJob.lastError, null, 'revived outbox job clears last error');

const retryOutbox = createMemoryOutboxRepository();
const retryService = new OutboxService(retryOutbox.repository, {
  lockTimeoutMs: 60_000
});
const retryStart = new Date('2026-07-31T10:00:00.000Z');
const retryJob = await retryService.enqueue({
  type: 'NOOP',
  payload: {},
  idempotencyKey: 'retry-outbox-key',
  maxAttempts: 2,
  nextAttemptAt: retryStart
});
const retryResult = await retryService.runOnce(
  'worker-retry',
  {
    NOOP: async () => {
      throw new Error('temporary_token_like_value_abcdefghijklmnopqrstuvwxyz');
    }
  },
  retryStart
);
const retriedJob = retryOutbox.jobs.find((job) => job.id === retryJob.id);

assert.equal(retryResult, 'failed', 'failed outbox job returns failed tick result');
assert.equal(retriedJob?.status, OUTBOX_JOB_STATUS.PENDING, 'failed outbox job is scheduled for retry');
assert.equal(retriedJob?.attempts, 1, 'failed outbox job attempt is counted');
assert.equal(retriedJob?.lastError?.includes('[redacted]'), true, 'outbox errors are sanitized');
assert.equal(
  (retriedJob?.nextAttemptAt.getTime() ?? 0) > retryStart.getTime(),
  true,
  'failed outbox job receives backoff nextAttemptAt'
);

const stuckOutbox = createMemoryOutboxRepository();
const stuckService = new OutboxService(stuckOutbox.repository, {
  lockTimeoutMs: 60_000
});
await stuckOutbox.repository.create({
  type: 'NOOP',
  payloadJson: '{}',
  idempotencyKey: 'stuck-outbox-key',
  maxAttempts: 3,
  nextAttemptAt: new Date('2026-07-31T09:00:00.000Z')
});
stuckOutbox.jobs[0].status = OUTBOX_JOB_STATUS.PROCESSING;
stuckOutbox.jobs[0].lockedAt = new Date('2026-07-31T09:00:00.000Z');
stuckOutbox.jobs[0].lockedBy = 'dead-worker';

const recovered = await stuckService.recoverStuck(new Date('2026-07-31T10:02:00.000Z'));

assert.equal(recovered, 1, 'stuck outbox job is recovered');
assert.equal(stuckOutbox.jobs[0].status, OUTBOX_JOB_STATUS.PENDING, 'stuck outbox job returns to pending');
assert.equal(stuckOutbox.jobs[0].lockedBy, null, 'stuck outbox lock owner is cleared');

const notificationHarness = createMemoryNotificationHarness();
const notificationOutbox = createMemoryOutboxRepository();
const notificationOutboxService = new OutboxService(notificationOutbox.repository, {
  lockTimeoutMs: 60_000
});
const sentMaxMessages: Array<{ userId: string; text: string; attachments: unknown }> = [];
const notificationService = new NotificationService(
  notificationHarness.db,
  notificationOutboxService,
  {
    sendMessage: async (params: { userId?: string | number | bigint; body: { text?: string | null; attachments?: unknown } }) => {
      sentMaxMessages.push({
        userId: String(params.userId),
        text: params.body.text ?? '',
        attachments: params.body.attachments
      });
      return {
        body: {
          mid: `max-${sentMaxMessages.length}`
        }
      };
    }
  } as never,
  {
    miniAppUrl: 'https://app.example.test',
    miniAppWebApp: 'https://app.example.test/mini'
  }
);
const paymentNotification = await notificationService.notify({
  userId: 'notify-user',
  type: 'PAYMENT_CONFIRMED',
  title: 'Payment ok',
  body: 'Paid',
  category: 'payments',
  critical: true,
  idempotencyKey: 'payment:test:confirmed',
  deepLink: notificationService.buildPaymentLink('payment-test')
});
const duplicatePaymentNotification = await notificationService.notify({
  userId: 'notify-user',
  type: 'PAYMENT_CONFIRMED',
  title: 'Payment ok',
  body: 'Paid',
  category: 'payments',
  critical: true,
  idempotencyKey: 'payment:test:confirmed',
  deepLink: notificationService.buildPaymentLink('payment-test')
});

assert.equal(paymentNotification?.id, duplicatePaymentNotification?.id, 'duplicate business event returns one notification');
assert.equal(notificationHarness.notifications.length, 1, 'duplicate business event does not create duplicate notification');
assert.equal(notificationOutbox.jobs.length, 1, 'notification creates one MAX outbox job');
assert.equal(paymentNotification?.payload?.deepLink?.path, '/profile?payment=payment-test', 'notification carries deep link');

await notificationOutboxService.runOnce(
  'notification-worker',
  {
    MAX_NOTIFICATION: async (job) => notificationService.handleMaxNotificationJob(job.payload)
  },
  new Date()
);
assert.equal(sentMaxMessages.length, 1, 'outbox sends notification once');
assert.equal(
  notificationHarness.deliveries.find((delivery) => delivery.channel === NotificationDeliveryChannel.MAX)?.status,
  NotificationDeliveryStatus.SUCCEEDED,
  'successful outbox delivery stores delivery result'
);
await notificationOutboxService.runOnce(
  'notification-worker',
  {
    MAX_NOTIFICATION: async (job) => notificationService.handleMaxNotificationJob(job.payload)
  },
  new Date()
);
assert.equal(sentMaxMessages.length, 1, 'completed outbox job is not sent twice on retry tick');

notificationHarness.users.get('notify-user')!.notificationPreference = {
  adStatusEnabled: false,
  applicationsEnabled: true,
  savedSearchesEnabled: true,
  paymentsEnabled: true,
  marketingEnabled: false
};
const disabledPreferenceNotification = await notificationService.notify({
  userId: 'notify-user',
  type: 'AD_CREATED',
  title: 'Ad',
  body: 'Created',
  category: 'ad_status',
  idempotencyKey: 'ad:preference-disabled:created'
});
assert.equal(disabledPreferenceNotification, null, 'disabled preference suppresses optional notification');

notificationHarness.users.set('blocked-user', {
  id: 'blocked-user',
  maxUserId: 'max-blocked',
  role: UserRole.USER,
  status: UserStatus.BLOCKED,
  notificationPreference: null
});
await notificationService.notify({
  userId: 'blocked-user',
  type: 'PAYMENT_CONFIRMED',
  title: 'Payment',
  body: 'Critical',
  category: 'payments',
  critical: true,
  idempotencyKey: 'blocked-user:payment'
});
assert.equal(
  notificationHarness.deliveries.some(
    (delivery) => delivery.notificationId === 'notification-2' && delivery.channel === NotificationDeliveryChannel.MAX && delivery.status === NotificationDeliveryStatus.SKIPPED
  ),
  true,
  'blocked user MAX delivery is skipped'
);

notificationHarness.users.set('missing-max-user', {
  id: 'missing-max-user',
  maxUserId: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  notificationPreference: null
});
await notificationService.notify({
  userId: 'missing-max-user',
  type: 'PAYMENT_CONFIRMED',
  title: 'Payment',
  body: 'Critical',
  category: 'payments',
  critical: true,
  idempotencyKey: 'missing-max-user:payment'
});
assert.equal(
  notificationHarness.deliveries.some(
    (delivery) => delivery.notificationId === 'notification-3' && delivery.channel === NotificationDeliveryChannel.MAX && delivery.status === NotificationDeliveryStatus.SKIPPED
  ),
  true,
  'missing MAX ID delivery is skipped without failing event creation'
);

const unavailableMaxDialogHarness = createMemoryNotificationHarness();
const unavailableMaxDialogOutbox = createMemoryOutboxRepository();
const unavailableMaxDialogOutboxService = new OutboxService(unavailableMaxDialogOutbox.repository, {
  lockTimeoutMs: 60_000
});
const unavailableMaxDialogService = new NotificationService(
  unavailableMaxDialogHarness.db,
  unavailableMaxDialogOutboxService,
  {
    sendMessage: async () => {
      throw new ExternalApiError('MAX API request failed', 404, {
        code: 'dialog.not.found',
        message: 'Dialog not found'
      });
    }
  } as never,
  {
    miniAppUrl: 'https://app.example.test',
    miniAppWebApp: 'https://app.example.test/mini'
  }
);

await unavailableMaxDialogService.notify({
  userId: 'notify-user',
  type: 'PAYMENT_CONFIRMED',
  title: 'Payment',
  body: 'Critical',
  category: 'payments',
  critical: true,
  idempotencyKey: 'unavailable-max-dialog:payment'
});
const unavailableDialogResult = await unavailableMaxDialogOutboxService.runOnce(
  'notification-worker',
  {
    MAX_NOTIFICATION: async (job) => unavailableMaxDialogService.handleMaxNotificationJob(job.payload)
  },
  new Date()
);

assert.equal(unavailableDialogResult, 'processed', 'permanent MAX dialog errors complete the outbox job');
assert.equal(
  unavailableMaxDialogHarness.deliveries.find((delivery) => delivery.channel === NotificationDeliveryChannel.MAX)?.status,
  NotificationDeliveryStatus.SKIPPED,
  'permanent MAX dialog errors are skipped instead of retried'
);

let markReadAccessError: unknown = null;
try {
  await notificationService.markRead('other-user', paymentNotification?.id ?? 'notification-1');
} catch (error) {
  markReadAccessError = error;
}
assert.equal(
  (markReadAccessError as { statusCode?: number } | null)?.statusCode,
  404,
  'mark read is authorized by notification owner'
);

notificationHarness.users.set('moderator-user', {
  id: 'moderator-user',
  maxUserId: 'max-moderator',
  role: UserRole.MODERATOR,
  status: UserStatus.ACTIVE,
  notificationPreference: null
});
const moderationNotifier = new ModerationNotificationService(notificationHarness.db as never);
moderationNotifier.setNotificationService(notificationService);
const moderationOutboxCountBefore = notificationOutbox.jobs.length;
await moderationNotifier.notifyNewAd(
  {
    id: 'moderation-ad',
    ownerId: 'owner',
    type: AdType.VACANCY,
    status: AdStatus.PENDING_MODERATION,
    title: 'Плотник',
    description: null,
    city: 'Москва',
    districtText: 'ЦАО',
    categoryText: null,
    locationLat: null,
    locationLon: null,
    priceAmount: null,
    currency: 'RUB',
    metadataJson: null,
    isTest: false,
    moderatedAt: null,
    publishedAt: null,
    hiddenAt: null,
    archivedAt: null,
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  } as never,
  'owner'
);
assert.equal(
  notificationHarness.notifications.some(
    (notification) =>
      notification.userId === 'moderator-user' &&
      notification.type === 'AD_SUBMITTED_MODERATION' &&
      notification.payloadJson?.includes('/moderation?adId=moderation-ad')
  ),
  true,
  'moderation notification is persisted through NotificationService with deep link'
);
assert.equal(
  notificationOutbox.jobs.length,
  moderationOutboxCountBefore + 1,
  'moderation notification creates a normal notification MAX outbox job'
);

const savedSearchHarness = createMemorySavedSearchHarness();
const savedSearchService = new SavedSearchesService(
  savedSearchHarness.db,
  savedSearchHarness.adRepository,
  notificationOutboxService,
  savedSearchHarness.notificationService
);
const savedSearch = await savedSearchService.create('search-user', {
  name: 'Electric jobs',
  adType: 'vacancy',
  query: {
    q: ' electric ',
    district: 'ЦАО'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
assert.equal(savedSearch.name, 'Electric jobs', 'saved search is created');
assert.equal(savedSearch.canonicalFilters.q, 'electric', 'saved search filters are normalized');
const editedSavedSearch = await savedSearchService.update('search-user', savedSearch.id, {
  name: 'Daily electric',
  notificationFrequency: 'DAILY',
  enabled: false
});
assert.equal(editedSavedSearch.notificationFrequency, 'DAILY', 'saved search frequency can be edited');
assert.equal(editedSavedSearch.enabled, false, 'saved search can be disabled');
await savedSearchService.update('search-user', savedSearch.id, {
  enabled: true,
  notificationFrequency: 'IMMEDIATE'
});

let savedSearchAuthError: unknown = null;
try {
  await savedSearchService.update('other-user', savedSearch.id, {
    name: 'Stolen'
  });
} catch (error) {
  savedSearchAuthError = error;
}
assert.equal((savedSearchAuthError as { statusCode?: number } | null)?.statusCode, 404, 'foreign saved search edit is blocked');

const noMatchSearch = await savedSearchService.create('search-user', {
  name: 'Plumber jobs',
  adType: 'vacancy',
  query: {
    q: 'plumber'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
const dailySearch = await savedSearchService.create('search-user', {
  name: 'Daily equipment',
  adType: 'equipment',
  query: {
    q: 'crane'
  },
  notificationFrequency: 'DAILY',
  enabled: true
});
await savedSearchService.create('ad-owner', {
  name: 'Own vacancy',
  adType: 'vacancy',
  query: {
    q: 'electric'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
await savedSearchService.create('search-user', {
  name: 'Disabled electric',
  adType: 'vacancy',
  query: {
    q: 'electric'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: false
});

const matchResult = await savedSearchService.matchPublishedAd('ad-match');
assert.equal(matchResult.matched, 1, 'published matching ad creates one match');
assert.equal(savedSearchHarness.matches.length, 1, 'no match, disabled search, and own ad are skipped');
assert.equal(savedSearchHarness.notifications.length, 1, 'immediate saved search sends notification');
assert.equal(savedSearchHarness.matches[0].savedSearchId, savedSearch.id, 'matching uses matching saved search id');

const duplicateMatchResult = await savedSearchService.matchPublishedAd('ad-match');
assert.equal(duplicateMatchResult.matched, 0, 'duplicate saved search match is guarded');
assert.equal(savedSearchHarness.notifications.length, 1, 'duplicate match does not send notification again');

const unpublishedResult = await savedSearchService.matchPublishedAd('ad-unpublished');
assert.equal(unpublishedResult.skipped, true, 'unpublished ad is skipped');

await savedSearchService.matchPublishedAd('equipment-match');
assert.equal(savedSearchHarness.notifications.length, 1, 'daily saved search does not send immediate notification');
const digestResult = await savedSearchService.sendDailyDigest('2026-08-01');
assert.equal(digestResult.digests, 1, 'daily digest sends one grouped notification');
assert.equal(savedSearchHarness.notifications.length, 2, 'daily digest notification is created');
assert.equal(
  savedSearchHarness.matches.find((match) => match.savedSearchId === dailySearch.id)?.notifiedAt instanceof Date,
  true,
  'daily digest marks matches as notified'
);

const resumeSearch = await savedSearchService.create('search-user', {
  name: 'Resume welders',
  adType: 'resume',
  query: {
    q: 'welder'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
const materialSearch = await savedSearchService.create('search-user', {
  name: 'Material cement',
  adType: 'material',
  query: {
    q: 'cement'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
const toolSearch = await savedSearchService.create('search-user', {
  name: 'Tool drills',
  adType: 'tool',
  query: {
    q: 'drill'
  },
  notificationFrequency: 'IMMEDIATE',
  enabled: true
});
assert.deepEqual(
  [resumeSearch.adType, materialSearch.adType, toolSearch.adType],
  ['resume', 'material', 'tool'],
  'saved searches support resume, material, and tool categories'
);
assert.equal((await savedSearchService.matchPublishedAd('resume-match')).matched, 1, 'resume saved search matches public resume');
assert.equal((await savedSearchService.matchPublishedAd('material-match')).matched, 1, 'material saved search matches public material');
assert.equal((await savedSearchService.matchPublishedAd('tool-match')).matched, 1, 'tool saved search matches public tool');
assert.equal(savedSearchHarness.notifications.length, 5, 'all immediate category matches create notifications once');

await savedSearchService.delete('search-user', noMatchSearch.id);
assert.equal(
  savedSearchHarness.searches.find((search) => search.id === noMatchSearch.id)?.deletedAt instanceof Date,
  true,
  'saved search is soft deleted'
);

const promotionHarness = createMemoryPromotionHarness();
const promotionService = new PromotionsService(
  promotionHarness.db as never,
  promotionHarness.yooKassaClient as never,
  {
    enabled: true,
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  promotionHarness.notificationService as never
);
let disabledPromotionError: unknown = null;
try {
  await promotionService.createPurchase('promo-owner', 'promo-ad', {
    productType: PromotionProductType.URGENT_BADGE
  });
} catch (error) {
  disabledPromotionError = error;
}
assert.equal((disabledPromotionError as { details?: { code?: string } } | null)?.details?.code, 'PROMOTION_PRODUCT_UNAVAILABLE', 'disabled promotion product is unavailable');
await promotionService.updateAdminProduct(PromotionProductType.URGENT_BADGE, 'admin-user', {
  enabled: true,
  price: '150.00',
  durationHours: 72,
  applicableAdTypes: ['vacancy'],
  channelBehavior: {
    autoBumpChannels: 'NONE'
  }
});
const promotionPurchaseResult = await promotionService.createPurchase('promo-owner', 'promo-ad', {
  productType: PromotionProductType.URGENT_BADGE
});
assert.equal(promotionHarness.createdPayments[0].payload.amount.value, '150.00', 'promotion uses server-side product price');
assert.equal(promotionHarness.createdPayments[0].payload.metadata.purpose, 'AD_PROMOTION', 'promotion payment metadata uses AD_PROMOTION purpose');
assert.equal(promotionPurchaseResult.purchase.status, 'pending', 'pending promotion payment does not activate promotion');
assert.equal(promotionHarness.ads[0].promotionUrgentUntil, null, 'pending payment leaves promotion inactive');
assert.equal(promotionHarness.balance.remaining, 7, 'promotion purchase does not consume publication credit');
let foreignPromotionError: unknown = null;
try {
  await promotionService.createPurchase('other-user', 'promo-ad', {
    productType: PromotionProductType.URGENT_BADGE
  });
} catch (error) {
  foreignPromotionError = error;
}
assert.equal((foreignPromotionError as { statusCode?: number } | null)?.statusCode, 404, 'only owner can promote ad');
promotionHarness.ads[0].deletedAt = new Date();
let deletedPromotionError: unknown = null;
try {
  await promotionService.createPurchase('promo-owner', 'promo-ad', {
    productType: PromotionProductType.URGENT_BADGE
  });
} catch (error) {
  deletedPromotionError = error;
}
assert.equal((deletedPromotionError as { statusCode?: number } | null)?.statusCode, 404, 'deleted ad is not promoted');
promotionHarness.ads[0].deletedAt = null;

const deletedPromotionPaymentHarness = createMemoryPromotionPaymentHarness();
deletedPromotionPaymentHarness.ad.deletedAt = new Date();
const deletedPromotionPaymentService = new AdPaymentService(
  deletedPromotionPaymentHarness.db as never,
  {} as never,
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {
    notifyNewAd: async () => undefined
  } as never,
  undefined,
  deletedPromotionPaymentHarness.notificationService as never
);
let deletedPromotionActivationError: unknown = null;
try {
  await (deletedPromotionPaymentService as unknown as { markPaymentSucceeded(paymentRecordId: string, payment: unknown): Promise<void> }).markPaymentSucceeded(
    'payment-promo',
    {
      id: 'yk-promo',
      status: 'succeeded',
      paid: true,
      amount: {
        value: '150.00',
        currency: 'RUB'
      }
    }
  );
} catch (error) {
  deletedPromotionActivationError = error;
}
assert.equal(
  (deletedPromotionActivationError as { details?: { code?: string } } | null)?.details?.code,
  'PROMOTION_AD_UNAVAILABLE',
  'webhook does not activate promotion for deleted ad'
);
assert.equal(deletedPromotionPaymentHarness.purchase.status, PaymentStatus.PENDING, 'deleted ad promotion payment leaves purchase pending');

const promotionPaymentHarness = createMemoryPromotionPaymentHarness();
const promotionAnalyticsEvents: Array<{ adId: string; eventType: string }> = [];
const promotionPaymentService = new AdPaymentService(
  promotionPaymentHarness.db as never,
  {} as never,
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {
    notifyNewAd: async () => undefined
  } as never,
  undefined,
  promotionPaymentHarness.notificationService as never,
  {
    recordSystemEvent: async (adId: string, eventType: string) => {
      promotionAnalyticsEvents.push({ adId, eventType });
    }
  } as never
);
let fakeAmountError: unknown = null;
try {
  await (promotionPaymentService as unknown as { markPaymentSucceeded(paymentRecordId: string, payment: unknown): Promise<void> }).markPaymentSucceeded(
    'payment-promo',
    {
      id: 'yk-promo',
      status: 'succeeded',
      paid: true,
      amount: {
        value: '1.00',
        currency: 'RUB'
      }
    }
  );
} catch (error) {
  fakeAmountError = error;
}
assert.equal((fakeAmountError as { details?: { code?: string } } | null)?.details?.code, 'PAYMENT_AMOUNT_MISMATCH', 'promotion webhook blocks fake amount');
assert.equal(promotionPaymentHarness.purchase.status, PaymentStatus.PENDING, 'fake amount does not activate promotion');
await (promotionPaymentService as unknown as { markPaymentSucceeded(paymentRecordId: string, payment: unknown): Promise<void> }).markPaymentSucceeded(
  'payment-promo',
  {
    id: 'yk-promo',
    status: 'succeeded',
    paid: true,
    amount: {
      value: '150.00',
      currency: 'RUB'
    }
  }
);
assert.equal(promotionPaymentHarness.purchase.status, PaymentStatus.SUCCEEDED, 'succeeded promotion payment activates purchase');
assert.ok(promotionPaymentHarness.ad.promotionUrgentUntil, 'succeeded promotion payment updates ad effect');
assert.equal(promotionPaymentHarness.notifications.length, 2, 'payment and promotion notifications are created');
assert.deepEqual(
  promotionAnalyticsEvents,
  [{ adId: 'promo-ad', eventType: 'promotion_purchased' }],
  'succeeded promotion payment writes analytics once'
);
await (promotionPaymentService as unknown as { markPaymentSucceeded(paymentRecordId: string, payment: unknown): Promise<void> }).markPaymentSucceeded(
  'payment-promo',
  {
    id: 'yk-promo',
    status: 'succeeded',
    paid: true,
    amount: {
      value: '150.00',
      currency: 'RUB'
    }
  }
);
assert.equal(promotionPaymentHarness.purchaseActivations, 1, 'duplicate webhook does not activate promotion twice');
assert.equal(promotionAnalyticsEvents.length, 1, 'duplicate promotion webhook does not duplicate analytics');
const sortedPromotionAds = [
  { id: 'normal', promotionPinnedUntil: null, boostedAt: new Date('2026-01-01') },
  { id: 'pinned', promotionPinnedUntil: new Date('2026-08-02'), boostedAt: null },
  { id: 'boosted', promotionPinnedUntil: null, boostedAt: new Date('2026-08-01') }
].sort((left, right) =>
  Number(Boolean(right.promotionPinnedUntil)) - Number(Boolean(left.promotionPinnedUntil)) ||
  ((right.boostedAt?.getTime() ?? 0) - (left.boostedAt?.getTime() ?? 0))
);
assert.equal(sortedPromotionAds[0].id, 'pinned', 'promotion sorting keeps pinned first');
let republishUpdateData: { publishedAt?: unknown } | null = null;
const republishRepository = new AdRepository({
  ad: {
    findUnique: async () => ({
      metadataJson: null,
      publishedAt: new Date('2026-08-01T00:00:00.000Z')
    }),
    updateMany: async (query: { data: { publishedAt?: unknown } }) => {
      republishUpdateData = query.data;
      return { count: 0 };
    }
  }
} as never);
await republishRepository.markPublishedIfPublishable('already-published-ad');
const capturedRepublishUpdateData = republishUpdateData as { publishedAt?: unknown } | null;
assert.ok(capturedRepublishUpdateData, 'republish update data is captured');
assert.equal(capturedRepublishUpdateData.publishedAt, undefined, 'republishing an already published ad does not bump it for free');

const analyticsHarness = createMemoryAdAnalyticsHarness();
const adAnalyticsService = new AdAnalyticsService(analyticsHarness.db as never);
const firstView = await adAnalyticsService.recordEvent(
  {
    adId: 'analytics-ad',
    eventType: 'card_open',
    sessionId: 'session-1'
  },
  {
    userAgent: 'Mozilla/5.0'
  }
);
const duplicateView = await adAnalyticsService.recordEvent(
  {
    adId: 'analytics-ad',
    eventType: 'card_open',
    sessionId: 'session-1'
  },
  {
    userAgent: 'Mozilla/5.0'
  }
);
assert.equal(firstView.uniqueView, true, 'first card open is unique');
assert.equal(duplicateView.uniqueView, false, 'duplicate refresh is not a unique view');
assert.equal(analyticsHarness.metric('analytics-ad').views, 2, 'daily aggregation counts card opens');
assert.equal(analyticsHarness.metric('analytics-ad').uniqueViews, 1, 'unique views are deduped per session/day');

await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'contact_open', sessionId: 'session-1' });
await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'phone_click', sessionId: 'session-1' });
await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'email_click', sessionId: 'session-1' });
await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'max_click', sessionId: 'session-1' });
await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'website_click', sessionId: 'session-1' });
assert.equal(analyticsHarness.metric('analytics-ad').contactOpens, 1, 'contact open is aggregated');
assert.equal(analyticsHarness.metric('analytics-ad').phoneClicks, 1, 'phone click is aggregated');
assert.equal(analyticsHarness.metric('analytics-ad').emailClicks, 1, 'email click is aggregated');
assert.equal(analyticsHarness.metric('analytics-ad').maxClicks, 1, 'MAX click is aggregated');
assert.equal(analyticsHarness.metric('analytics-ad').websiteClicks, 1, 'website click is aggregated');

await adAnalyticsService.recordSystemEvent('analytics-ad', 'application_sent');
assert.equal(analyticsHarness.metric('analytics-ad').applications, 1, 'application system event is aggregated');

const ownerDashboard = await adAnalyticsService.getOwnerDashboard('analytics-owner', 'analytics-ad', 7);
assert.equal(ownerDashboard.totals.views, 2, 'owner sees own aggregated views');
assert.equal(ownerDashboard.totals.applications, 1, 'owner sees own application aggregate');

let foreignAnalyticsError: unknown = null;
try {
  await adAnalyticsService.getOwnerDashboard('other-owner', 'analytics-ad', 7);
} catch (error) {
  foreignAnalyticsError = error;
}
assert.equal((foreignAnalyticsError as { statusCode?: number } | null)?.statusCode, 404, 'foreign owner cannot read analytics');

let blockedAnalyticsError: unknown = null;
try {
  await adAnalyticsService.recordEvent(
    { adId: 'analytics-ad', eventType: 'card_open', sessionId: 'blocked-session' },
    { userId: 'blocked-user' }
  );
} catch (error) {
  blockedAnalyticsError = error;
}
assert.equal((blockedAnalyticsError as { details?: { code?: string } } | null)?.details?.code, 'ANALYTICS_USER_BLOCKED', 'blocked user cannot record analytics');

analyticsHarness.ads.get('analytics-ad')!.deletedAt = new Date();
let deletedAnalyticsError: unknown = null;
try {
  await adAnalyticsService.recordEvent({ adId: 'analytics-ad', eventType: 'card_open', sessionId: 'session-2' });
} catch (error) {
  deletedAnalyticsError = error;
}
assert.equal((deletedAnalyticsError as { details?: { code?: string } } | null)?.details?.code, 'AD_ANALYTICS_AD_NOT_FOUND', 'deleted ad cannot receive analytics events');

const lowViewDashboard = await adAnalyticsService.getOwnerDashboard('analytics-owner', 'analytics-low-view-ad', 7);
assert.ok(
  lowViewDashboard.recommendations.some((recommendation) => recommendation.code === 'PROMOTE_LOW_VIEWS'),
  'low views produce promotion recommendation'
);

const adReportsHarness = createMemoryAdReportsHarness();
const adReportsService = new AdReportsService(
  adReportsHarness.db as never,
  adReportsHarness.moderationService as never,
  adReportsHarness.channelPublishingService as never,
  adReportsHarness.notificationService as never
);
const createdReport = await adReportsService.createReport('reporter-user', {
  adId: 'reported-ad',
  reason: 'FRAUD',
  comment: 'Suspicious payment request'
});
assert.equal(createdReport.report.duplicate, false, 'create report creates first open report');
assert.equal(
  adReportsHarness.notifications.some((item) => item.userId === 'moderator-user' && item.type === 'AD_REPORT_CREATED'),
  true,
  'new report notifies moderation recipients'
);
const duplicateReport = await adReportsService.createReport('reporter-user', {
  adId: 'reported-ad',
  reason: 'SPAM',
  comment: 'Duplicate'
});
assert.equal(duplicateReport.report.duplicate, true, 'duplicate open report is not created twice');
assert.equal(adReportsHarness.reports.length, 1, 'duplicate open report keeps one row');
let selfReportError: unknown = null;
try {
  await adReportsService.createReport('reported-owner', {
    adId: 'reported-ad',
    reason: 'OTHER'
  });
} catch (error) {
  selfReportError = error;
}
assert.equal((selfReportError as { details?: { code?: string } } | null)?.details?.code, 'SELF_REPORT_BLOCKED', 'self report is blocked');
const moderationReports = await adReportsService.listForModeration({ status: AdReportStatus.OPEN, page: 1, perPage: 30 });
assert.equal(moderationReports.items.length, 1, 'moderator can list reports');
assert.equal('reporterUserId' in moderationReports.items[0], false, 'moderation report dto does not expose reporter identity by default');
const resolvedReport = await adReportsService.resolveReport('moderator-user', createdReport.report.id, {
  action: 'hide_ad',
  resolution: 'Temporarily hidden while owner fixes misleading content'
});
assert.equal(resolvedReport.status, AdReportStatus.RESOLVED_ACTION_TAKEN, 'resolution stores action taken status');
assert.equal(adReportsHarness.ads.get('reported-ad')?.status, AdStatus.HIDDEN, 'hide report action hides ad');
assert.equal(adReportsHarness.reportHistory.some((item) => item.action === 'hide_ad'), true, 'report action history is audited');
assert.equal(adReportsHarness.moderationLogs.some((item) => item.metadataJson?.includes(createdReport.report.id)), true, 'moderator report action writes audit log');
assert.equal(adReportsHarness.notifications.some((item) => item.userId === 'reported-owner' && item.type === 'AD_REPORT_AD_HIDDEN'), true, 'author is notified about hidden ad');
assert.equal(
  adReportsHarness.notifications.some((item) => JSON.stringify(item).includes('reporter-user')),
  false,
  'author notification does not reveal reporter identity'
);
let reportRoleError: unknown = null;
requireRole(['admin', 'moderator'])(
  { auth: { userId: 'normal-user', role: 'user' } } as Parameters<ReturnType<typeof requireRole>>[0],
  {} as Parameters<ReturnType<typeof requireRole>>[1],
  (error?: unknown) => {
    reportRoleError = error ?? null;
  }
);
assert.equal((reportRoleError as { statusCode?: number } | null)?.statusCode, 403, 'normal user is blocked from report moderation');

const profilesHarness = createMemoryProfilesHarness();
const profilesService = new ProfilesService(profilesHarness.repository as never);
const editedProfile = await profilesService.updateMe('profile-owner', {
  profileType: 'company',
  companyName: 'Reliable Build',
  city: 'Москва',
  districtText: 'ЦАО',
  about: 'Public about text',
  phone: '+7 900 000-00-00',
  email: 'owner@example.com',
  website: 'https://example.com',
  maxContact: '@owner',
  specialization: 'Монолит',
  experience: '10 лет',
  companyInfo: 'Company details',
  registrationDetails: 'Optional registration',
  privacy: {
    showPhone: false,
    showEmail: true,
    showWebsite: true,
    showMaxContact: false,
    allowResumePublicProfile: false
  }
});
assert.equal(editedProfile.userId, 'profile-owner', 'edit own profile updates own row');
assert.equal(editedProfile.profileType, ProfileType.COMPANY, 'profile type is stored');
assert.equal(editedProfile.districtText, 'ЦАО', 'profile district is canonicalized');
assert.equal(editedProfile.showPhone, false, 'profile privacy stores hidden phone');
assert.equal(profilesHarness.updatedUserIds.includes('foreign-user'), false, 'profile edit cannot target a foreign user id');
const parsedProfile = updateProfileSchema.parse({
  about: 'Legacy compatible',
  trustBadges: ['company_verified']
});
assert.equal('trustBadges' in parsedProfile, false, 'user profile payload cannot self-assign badges');

let badgeRoleError: unknown = null;
requireRole(['admin'])(
  { auth: { userId: 'normal-user', role: 'user' } } as Parameters<ReturnType<typeof requireRole>>[0],
  {} as Parameters<ReturnType<typeof requireRole>>[1],
  (error?: unknown) => {
    badgeRoleError = error ?? null;
  }
);
assert.equal((badgeRoleError as { statusCode?: number } | null)?.statusCode, 403, 'badge admin endpoint blocks normal user');
const badgeState = await profilesService.updateTrustBadge('profile-owner', 'admin-user', 'company_verified', {
  enabled: true,
  reason: 'Verified documents'
});
assert.equal(badgeState.trustBadgeAssignments[0]?.badge, UserTrustBadge.COMPANY_VERIFIED, 'admin can assign trust badge');
assert.equal(profilesHarness.history[0]?.reason, 'Verified documents', 'badge assignment writes history reason');

const publicProfileFixture = createPublicProfileFixture();
const publicProfile = serializePublicProfile(publicProfileFixture as never);
assert.equal(publicProfile.displayName, 'Reliable Build', 'public serialization prefers company name');
assert.equal(publicProfile.contacts.some((contact) => contact.type === 'phone'), false, 'hidden contacts are not serialized');
assert.equal(publicProfile.contacts.some((contact) => contact.type === 'email'), true, 'visible contacts are serialized');
assert.equal(publicProfile.trustBadges.includes('company_verified'), true, 'admin assigned badge is public');
assert.equal(publicProfile.trustBadges.includes('long_time_member'), true, 'long time member badge can be added by backend rule');
assert.equal(publicProfile.activeVacancies.length, 1, 'public profile separates active vacancies');
assert.equal(publicProfile.otherActiveAds.length, 1, 'public profile includes other active ads');
assert.equal(publicProfile.reviews.length, 1, 'public profile serializes reviews');
assert.equal(publicProfile.privacy.allowResumePublicProfile, false, 'resume profile privacy is serialized for linking');

const blockedProfileService = new UsersService({
  findPublicProfile: async () => null
} as never);
let blockedProfileError: unknown = null;
try {
  await blockedProfileService.getPublicProfile('blocked-user');
} catch (error) {
  blockedProfileError = error;
}
assert.equal((blockedProfileError as { statusCode?: number } | null)?.statusCode, 404, 'blocked user public profile is not returned');

const revisionCreditFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 6,
  mediaChanged: false
});
assert.equal(revisionCreditFlow.balanceRemaining, 5, 'package 7 remaining 6 then edit republish leaves 5');
assert.equal(revisionCreditFlow.consumedCredits, 1, 'vacancy revision with existing credit consumes one publication');
assert.equal(revisionCreditFlow.createdPayments.length, 0, 'existing credit and no media requires no payment');
assert.equal(revisionCreditFlow.revision.status, 'PENDING_MODERATION', 'paid-by-credit revision enters moderation');
assert.equal(revisionCreditFlow.result.estimate?.remainingBefore, 6, 'revision estimate exposes remaining before submit');
assert.equal(revisionCreditFlow.result.estimate?.remainingAfter, 5, 'revision estimate exposes remaining after submit');

const repeatWithoutDraftFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 6,
  mediaChanged: false,
  hasActiveRevision: false
});
assert.equal(repeatWithoutDraftFlow.currentAd.status, AdStatus.PUBLISHED, 'repeat publish creates revision without hiding live vacancy');
assert.equal(repeatWithoutDraftFlow.savedDrafts, 1, 'repeat publish without draft snapshots the live vacancy first');
assert.equal(repeatWithoutDraftFlow.revision.status, 'PENDING_MODERATION', 'repeat publish snapshot enters moderation');
assert.equal(repeatWithoutDraftFlow.balanceRemaining, 5, 'repeat publish snapshot consumes one package credit');

const revisionNoCreditFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 0,
  mediaChanged: false
});
assert.equal(revisionNoCreditFlow.balanceRemaining, 0, 'empty package balance remains zero');
assert.equal(revisionNoCreditFlow.createdPayments[0]?.amount, '100.00', 'empty package requires a new single publication payment');
assert.equal(revisionNoCreditFlow.revision.status, 'AWAITING_PAYMENT', 'unpaid revision does not enter moderation');

const revisionSingleUsedFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 0,
  mediaChanged: false
});
assert.equal(revisionSingleUsedFlow.createdPayments[0]?.amount, '100.00', 'used single package requires a new payment on edit republish');

const revisionCreditNoMediaFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 1,
  mediaChanged: false
});
assert.equal(revisionCreditNoMediaFlow.result.estimate?.amount, '0.00', 'existing credit and no media has zero extra payment');

const revisionCreditWithMediaFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 1,
  mediaChanged: true
});
assert.equal(revisionCreditWithMediaFlow.createdPayments[0]?.amount, '50.00', 'existing credit and new media requires only media fee');
assert.equal(revisionCreditWithMediaFlow.consumedCredits, 0, 'media-fee revision consumes credit only after payment success');

await revisionCreditWithMediaFlow.service.resubmitMine('owner', 'ad-revision');
assert.equal(revisionCreditWithMediaFlow.createdPayments.length, 1, 'duplicate submit does not create a second payment');
assert.equal(revisionCreditWithMediaFlow.consumedCredits, 0, 'duplicate submit does not double-spend credit before payment');

const resumeRevisionFlow = await runAdRevisionSubmitScenario({
  type: AdType.RESUME,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 0,
  mediaChanged: false
});
assert.equal(resumeRevisionFlow.revision.status, 'PENDING_MODERATION', 'free resume revision is resubmitted for moderation');
assert.equal(resumeRevisionFlow.createdPayments.length, 0, 'free resume revision does not create payment');

const repeatResumeWithoutDraftFlow = await runAdRevisionSubmitScenario({
  type: AdType.RESUME,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 0,
  mediaChanged: false,
  hasActiveRevision: false
});
assert.equal(repeatResumeWithoutDraftFlow.currentAd.status, AdStatus.PUBLISHED, 'repeat publish creates revision without hiding live resume');
assert.equal(repeatResumeWithoutDraftFlow.revision.status, 'PENDING_MODERATION', 'free repeat resume snapshot enters moderation');
assert.equal(repeatResumeWithoutDraftFlow.createdPayments.length, 0, 'free repeat resume snapshot does not create payment');

const rejectedRevisionModeration = await runRevisionModerationScenario('reject');
assert.equal(rejectedRevisionModeration.ad.title, 'Live published title', 'rejecting revision keeps old published ad content');
assert.equal(rejectedRevisionModeration.revision.status, 'REJECTED', 'rejecting revision stores rejected status');
assert.equal(
  (rejectedRevisionModeration as { channelRemoval: { attempted: number } }).channelRemoval.attempted,
  0,
  'rejecting revision does not remove live channel publication'
);

const approvedRevisionModeration = await runRevisionModerationScenario('approve');
assert.equal(approvedRevisionModeration.ad.title, 'Approved revision title', 'approving revision atomically replaces live content');
assert.equal(approvedRevisionModeration.revision.status, 'APPROVED', 'approved revision is stored in history');
assert.equal(approvedRevisionModeration.telegramEnqueues, 1, 'approving revision enqueues Telegram publication independently from MAX result');

const oldAdOpenFlow = await runAdRevisionSubmitScenario({
  type: AdType.VACANCY,
  status: AdStatus.PUBLISHED,
  balanceRemaining: 0,
  mediaChanged: false
});
const oldAd = await oldAdOpenFlow.service.getPublicDetails('ad-revision');
assert.equal(oldAd.id, 'ad-revision', 'old ads continue to open through public details');

const approvedRepositorySnapshot = await runAdRevisionRepositoryApproveSnapshot();
assert.equal(approvedRepositorySnapshot.adUpdate?.priceAmount, 9500, 'revision approve updates public ad price');
assert.equal(
  (JSON.parse(String(approvedRepositorySnapshot.adUpdate?.metadataJson)) as { address?: string }).address,
  'Новый склад',
  'revision approve updates public ad metadata address'
);
assert.equal(
  (approvedRepositorySnapshot.productUpdate as { model?: string } | null)?.model,
  'GBH 2-28',
  'revision approve updates category-specific product detail'
);
assert.equal(approvedRepositorySnapshot.revision.status, 'APPROVED', 'repository approve stores revision history status');

assert.deepEqual(
  Object.fromEntries(
    Object.values(VACANCY_PUBLICATION_PLANS).map((plan) => [
      plan.code,
      {
        publications: plan.publications,
        amountValue: plan.amountValue
      }
    ])
  ),
  {
    single: { publications: 1, amountValue: '100.00' },
    bundle_3: { publications: 3, amountValue: '200.00' },
    bundle_7: { publications: 7, amountValue: '350.00' }
  },
  'vacancy plans'
);

assert.equal(VACANCY_MEDIA_FEE_AMOUNT_RUB, '50.00', 'media fee amount');
assert.equal(VACANCY_MEDIA_HIGHLIGHT_AMOUNT_RUB, VACANCY_MEDIA_FEE_AMOUNT_RUB, 'legacy highlight amount alias');
assert.equal(addMoneyValues('100.00', '50.00'), '150.00', 'single plus media');
assert.equal(addMoneyValues('350.00', '50.00'), '400.00', 'bundle_7 plus media');
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_3', mediaHighlight: false }),
  '200.00',
  'bundle_3 server-side amount'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_7', mediaHighlight: true }),
  '400.00',
  'bundle_7 plus legacy highlight server-side amount'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'single', mediaFeeRequired: true }),
  '150.00',
  'single vacancy with attached media charges media fee'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_3', mediaFeeRequired: true }),
  '250.00',
  'bundle_3 vacancy with attached media charges one media fee'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_7', mediaFeeRequired: true }),
  '400.00',
  'bundle_7 vacancy with attached media charges one media fee'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_3', usesBalance: true, mediaHighlight: false }),
  '0.00',
  'balance vacancy without highlight is free'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_3', usesBalance: true, mediaFeeRequired: true }),
  '50.00',
  'balance vacancy pays media fee only'
);
assert.equal(hasPaidVacancyMedia([]), false, 'empty vacancy media has no fee');
assert.equal(hasPaidVacancyMedia([{ id: 'one-photo' }]), true, 'one photo has media fee');
assert.equal(requiresVacancyMediaFee([]), false, 'empty vacancy media does not require fee');
assert.equal(requiresVacancyMediaFee([{ id: 'one-photo' }]), true, 'one photo requires media fee');
assert.equal(hasPaidVacancyMedia(Array.from({ length: 8 }, (_, index) => ({ id: `photo-${index}` }))), true, 'many photos still have one media fee');
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_7', mediaHighlight: false, mediaFeeRequired: requiresVacancyMediaFee([{ id: 'tampered-photo' }]) }),
  '400.00',
  'frontend mediaHighlight=false cannot change server-side media amount when media exists'
);
assert.equal(
  getVacancyPublicationPaymentAmount({ planCode: 'bundle_3', mediaFeeRequired: requiresVacancyMediaFee([]) }),
  '200.00',
  'removing media removes the media fee'
);

const uploadedPhotoPayload = {
  storageKey: '2026/07/photo.jpg',
  url: '/uploads/2026/07/photo.jpg',
  previewUrl: '/uploads/2026/07/photo.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  altText: 'photo'
};
const vacancyPayloadWithMedia = createVacancyPayloadSchema.parse({
  title: 'Монтажник фасадов',
  companyName: 'Работодатель',
  city: 'Москва',
  address: 'Центр',
  categoryText: 'Монтажник',
  schedule: 'По договоренности',
  workPeriods: [],
  experience: 'От 1 года',
  salaryText: '100000',
  salaryFrom: 100000,
  publicationPlan: 'bundle_3',
  publicationFunding: 'buy_package',
  description: 'Нужен монтажник',
  requirements: [],
  responsibilities: [],
  benefits: [],
  metroStations: [],
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: [uploadedPhotoPayload]
});

function assertProductionConfigFailure(
  envOverrides: Record<string, string>,
  expectedField: string,
  message: string
): void {
  let output = '';

  try {
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '-e', 'import("./packages/config/src/env.ts")'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DATABASE_URL: 'file:./dev.db',
          MAX_BOT_TOKEN: 'max_bot_token_for_test_process_only',
          SESSION_SECRET: 'session_secret_for_test_process_only_32',
          ...envOverrides
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (error) {
    output = `${String((error as { stdout?: unknown }).stdout ?? '')}${String((error as { stderr?: unknown }).stderr ?? '')}`;
  }

  assert.match(output, new RegExp(expectedField), message);
}
assert.equal(
  Object.prototype.hasOwnProperty.call(vacancyPayloadWithMedia, 'mediaHighlight'),
  false,
  'frontend vacancy payload no longer sends legacy mediaHighlight'
);
assert.equal(vacancyPayloadWithMedia.photos.length, 1, 'frontend vacancy payload carries uploaded media metadata');
const backendVacancyWithMedia = createVacancySchema.parse(vacancyPayloadWithMedia);
assert.equal(backendVacancyWithMedia.mediaHighlight, undefined, 'backend accepts media payload without legacy mediaHighlight');
assert.equal(backendVacancyWithMedia.photos[0]?.storageKey, uploadedPhotoPayload.storageKey, 'backend receives uploaded media identifier');
const backendVacancyWithRemovedFields = createVacancySchema.parse({
    ...vacancyPayloadWithMedia,
    paymentFormat: 'piecework',
    employmentType: 'SHIFT',
    workFormat: 'ONSITE',
    providesAccommodation: true,
    providesMeals: true,
    projectDuration: '2 месяца',
    unknownClientOnlyField: 'drop-me'
  } as Record<string, unknown>) as Record<string, unknown>;
assert.equal(
  backendVacancyWithRemovedFields.providesAccommodation,
  undefined,
  'vacancy category schema strips removed extended job fields'
);

const simpleVacancyPayload = createVacancyPayloadSchema.parse({
  title: 'Монолитчик на объект',
  address: 'Москва, Варшавское шоссе',
  salaryText: '120000',
  salaryFrom: 120000,
  publicationPlan: 'single',
  publicationFunding: 'buy_package',
  description: 'Нужен монолитчик на стройку.',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
} as Record<string, unknown>);
const backendSimpleVacancy = createVacancySchema.parse(simpleVacancyPayload);
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleVacancy, 'companyName'), false, 'simple vacancy strips company');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleVacancy, 'salaryFrom'), false, 'simple vacancy strips salaryFrom');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleVacancy, 'schedule'), false, 'simple vacancy strips schedule');

const simpleResumePayload = createResumePayloadSchema.parse({
  name: 'Иван Иванов',
  profession: 'Электромонтажник',
  description: 'Ищу работу на стройке.',
  expectedSalary: 100000,
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
});
const backendSimpleResume = createResumeSchema.parse(simpleResumePayload);
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleResume, 'skills'), false, 'simple resume strips skills');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleResume, 'education'), false, 'simple resume strips education');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleResume, 'experienceText'), false, 'simple resume strips extended experience');

const simpleEquipmentPayload = createEquipmentPayloadSchema.parse({
  title: 'Экскаватор',
  description: 'Готов к работе.',
  priceAmount: 15000,
  address: 'Москва',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
});
const backendSimpleEquipment = createEquipmentSchema.parse(simpleEquipmentPayload);
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleEquipment, 'brand'), false, 'simple equipment strips brand');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleEquipment, 'dealType'), false, 'simple equipment strips deal type');
assert.equal(backendSimpleEquipment.priceAmount, 15000, 'simple equipment accepts public price');

const simpleMaterialPayload = createProductPayloadSchema.parse({
  title: 'Кирпич',
  categoryText: 'Кирпич',
  description: 'Материал в наличии.',
  priceAmount: 25000,
  address: 'Москва',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
});
const backendSimpleMaterial = createTradeAdSchema.parse(simpleMaterialPayload);
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleMaterial, 'manufacturer'), false, 'simple material strips manufacturer');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleMaterial, 'quantity'), false, 'simple material strips quantity');

const simpleToolPayload = createProductPayloadSchema.parse({
  title: 'Перфоратор',
  categoryText: 'Инструмент',
  description: 'Инструмент рабочий.',
  priceAmount: 5000,
  address: 'Москва',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
});
const backendSimpleTool = createTradeAdSchema.parse(simpleToolPayload);
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleTool, 'manufacturer'), false, 'simple tool strips manufacturer');
assert.equal(Object.prototype.hasOwnProperty.call(backendSimpleTool, 'deliveryAvailable'), false, 'simple tool strips delivery');

const resumePayloadExtended = createResumePayloadSchema.parse({
  name: 'Иван Иванов',
  profession: 'Электромонтажник',
  specialization: 'Слаботочные системы',
  description: 'Работаю на стройке',
  experienceText: '6 лет на объектах',
  experienceYears: 6,
  skills: ['кабель', 'щитовые'],
  education: 'Колледж',
  availability: 'сейчас',
  desiredSchedule: '5/2',
  expectedSalary: '',
  travelReady: true,
  siteAccommodationReady: true,
  districtText: 'ЦАО',
  portfolioUrl: 'https://example.com/portfolio',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
} as Record<string, unknown>);
const backendResumeExtended = createResumeSchema.parse(resumePayloadExtended);
assert.equal(backendResumeExtended.expectedSalary, undefined, 'resume desired salary remains optional');
assert.equal(Object.prototype.hasOwnProperty.call(backendResumeExtended, 'skills'), false, 'resume category schema strips skills');
assert.equal(Object.prototype.hasOwnProperty.call(backendResumeExtended, 'travelReady'), false, 'resume category schema strips travel readiness');

const equipmentPayloadExtended = createEquipmentPayloadSchema.parse({
  title: 'Экскаватор JCB 3CX',
  categoryText: 'Экскаватор',
  brand: 'JCB',
  model: '3CX',
  productionYear: 2021,
  condition: 'USED',
  dealType: 'RENT_AND_SALE',
  hourlyPrice: 2500,
  shiftPrice: 15000,
  dailyPrice: 22000,
  salePrice: 4500000,
  operatorIncluded: true,
  deliveryAvailable: true,
  description: 'Готов к работе',
  districtText: 'ЮВАО',
  address: 'Москва',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
} as Record<string, unknown>);
const backendEquipmentExtended = createEquipmentSchema.parse(equipmentPayloadExtended);
assert.equal(Object.prototype.hasOwnProperty.call(backendEquipmentExtended, 'dealType'), false, 'equipment schema strips rent and sale');
assert.equal(Object.prototype.hasOwnProperty.call(backendEquipmentExtended, 'shiftPrice'), false, 'equipment schema strips shift price');

const productPayloadExtended = createProductPayloadSchema.parse({
  title: 'Перфоратор Bosch SDS-plus',
  categoryText: 'Электроинструмент',
  manufacturer: 'Bosch',
  model: 'GBH 2-26',
  condition: 'USED',
  quantity: 2,
  unit: 'шт',
  saleType: 'RETAIL',
  deliveryAvailable: true,
  description: 'В рабочем состоянии',
  priceAmount: 9000,
  districtText: 'САО',
  address: 'Москва',
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  photos: []
} as Record<string, unknown>);
const backendProductExtended = createTradeAdSchema.parse(productPayloadExtended);
assert.equal(Object.prototype.hasOwnProperty.call(backendProductExtended, 'manufacturer'), false, 'product schema strips manufacturer');
assert.equal(Object.prototype.hasOwnProperty.call(backendProductExtended, 'deliveryAvailable'), false, 'product schema strips delivery flag');

const revisionUpdatePayload = saveAdRevisionSchema.parse({
  title: 'Перфоратор Bosch SDS-plus v2',
  description: 'Новое описание',
  districtText: 'РЎРђРћ',
  categoryText: 'Электроинструмент',
  priceAmount: 9500,
  metadata: {
    address: 'Новый склад'
  },
  product: {
    manufacturer: 'Bosch',
    model: 'GBH 2-28',
    condition: 'USED',
    quantity: 1,
    unit: 'С€С‚',
    saleType: 'RETAIL',
    deliveryAvailable: true
  },
  contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
  paid: true,
  amount: 1,
  status: 'approved',
  mediaFee: 0
});
assert.equal(revisionUpdatePayload.priceAmount, 9500, 'revision schema accepts server-priced public price');
assert.equal((revisionUpdatePayload as Record<string, unknown>).paid, undefined, 'revision schema strips fake paid flag');
assert.equal((revisionUpdatePayload as Record<string, unknown>).amount, undefined, 'revision schema strips fake amount');
assert.equal((revisionUpdatePayload as Record<string, unknown>).status, undefined, 'revision schema strips fake status');
assert.equal((revisionUpdatePayload as Record<string, unknown>).mediaFee, undefined, 'revision schema strips fake media fee');
assert.equal(
  (resumeListQuerySchema.parse({ experience: '6 лет', availability: 'сейчас', district: 'ЦАО' }) as Record<string, unknown>).experience,
  undefined,
  'resume filters strip extended experience'
);

async function assertVacancyCreatePaymentFlow(input: {
  name: string;
  publicationPlan: 'single' | 'bundle_3' | 'bundle_7';
  publicationFunding: 'use_balance' | 'buy_package';
  balanceRemaining: number;
  photos: Array<typeof uploadedPhotoPayload>;
  expectedInitialStatus: AdStatus;
  expectedPaymentAmount: string | null;
  expectedCreatedPhotoCount: number;
}) {
  let capturedCreateDto: CreateAdDto | undefined;
  let capturedInitialStatus: AdStatus | undefined;
  let submittedUsingCredit = false;

  const paymentService = {
    getVacancyPublicationBalance: async () => ({
      purchased: input.balanceRemaining,
      bonus: 0,
      used: 0,
      remaining: input.balanceRemaining
    }),
    getInitialAdStatusForAdType: () => AdStatus.PAYMENT_PENDING,
    createPaymentForAd: async (ad: { id: string; metadataJson: string | null }) => {
      const metadata = ad.metadataJson ? (JSON.parse(ad.metadataJson) as { billing?: { paymentAmountValue?: string } }) : {};
      const amount = metadata.billing?.paymentAmountValue ?? null;

      return amount
        ? {
            id: `local-${input.name}`,
            paymentId: `remote-${input.name}`,
            status: 'pending',
            amount,
            currency: 'RUB',
            confirmationUrl: `https://yookassa.ru/checkout/${input.name}`,
            test: true
          }
        : null;
    },
    submitVacancyUsingCredit: async (adId: string, ownerId: string) => {
      submittedUsingCredit = true;
      return {
        id: adId,
        ownerId,
        type: AdType.VACANCY,
        status: AdStatus.PENDING_MODERATION,
        metadataJson: null,
        createdAt: new Date()
      };
    }
  };

  const service = new VacanciesService(
    {} as ConstructorParameters<typeof VacanciesService>[0],
    {
      createAdForModeration: async (_ownerId: string, dto: CreateAdDto, options: { initialStatus?: AdStatus }) => {
        capturedCreateDto = dto;
        capturedInitialStatus = options.initialStatus;

        return {
          id: `ad-${input.name}`,
          ownerId: 'owner',
          type: AdType.VACANCY,
          status: options.initialStatus ?? AdStatus.PENDING_MODERATION,
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
          createdAt: new Date()
        };
      }
    } as unknown as ConstructorParameters<typeof VacanciesService>[1],
    {
      notifyNewAd: async () => undefined
    } as unknown as ConstructorParameters<typeof VacanciesService>[2],
    paymentService as unknown as ConstructorParameters<typeof VacanciesService>[3]
  );

  const result = await service.createForModeration(
    'owner',
    createVacancySchema.parse({
      ...vacancyPayloadWithMedia,
      publicationPlan: input.publicationPlan,
      publicationFunding: input.publicationFunding,
      photos: input.photos
    })
  );
  const capturedMetadata = capturedCreateDto?.metadata as
    | {
        mediaFeeRequired?: boolean;
        billing?: {
          source?: string;
          planCode?: string;
          publications?: number;
          mediaFeeRequired?: boolean;
          paymentAmountValue?: string;
        };
      }
    | undefined;

  assert.equal(capturedInitialStatus, input.expectedInitialStatus, `${input.name} initial status`);
  assert.equal(capturedCreateDto?.photos.length, input.expectedCreatedPhotoCount, `${input.name} created photo count`);
  assert.equal(
    capturedMetadata?.mediaFeeRequired,
    input.photos.length > 0,
    `${input.name} media fee metadata follows saved photos`
  );
  assert.equal(
    capturedMetadata?.billing?.paymentAmountValue ?? null,
    input.expectedPaymentAmount,
    `${input.name} billing payment amount`
  );
  assert.equal(result.payment?.amount ?? null, input.expectedPaymentAmount, `${input.name} payment response amount`);
  assert.equal(submittedUsingCredit, input.expectedPaymentAmount === null, `${input.name} credit submit path`);
}

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-without-media',
  publicationPlan: 'single',
  publicationFunding: 'buy_package',
  balanceRemaining: 0,
  photos: [],
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '100.00',
  expectedCreatedPhotoCount: 0
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-single-media',
  publicationPlan: 'single',
  publicationFunding: 'buy_package',
  balanceRemaining: 0,
  photos: [uploadedPhotoPayload],
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '150.00',
  expectedCreatedPhotoCount: 1
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-bundle-3-media',
  publicationPlan: 'bundle_3',
  publicationFunding: 'buy_package',
  balanceRemaining: 0,
  photos: [uploadedPhotoPayload],
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '250.00',
  expectedCreatedPhotoCount: 1
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-bundle-7-media',
  publicationPlan: 'bundle_7',
  publicationFunding: 'buy_package',
  balanceRemaining: 0,
  photos: [uploadedPhotoPayload],
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '400.00',
  expectedCreatedPhotoCount: 1
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-bundle-3-eight-photos',
  publicationPlan: 'bundle_3',
  publicationFunding: 'buy_package',
  balanceRemaining: 0,
  photos: Array.from({ length: 8 }, (_, index) => ({
    ...uploadedPhotoPayload,
    storageKey: `2026/07/photo-${index}.jpg`,
    url: `/uploads/2026/07/photo-${index}.jpg`,
    previewUrl: `/uploads/2026/07/photo-${index}.jpg`
  })),
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '250.00',
  expectedCreatedPhotoCount: 8
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-credit-media',
  publicationPlan: 'single',
  publicationFunding: 'use_balance',
  balanceRemaining: 1,
  photos: [uploadedPhotoPayload],
  expectedInitialStatus: AdStatus.PAYMENT_PENDING,
  expectedPaymentAmount: '50.00',
  expectedCreatedPhotoCount: 1
});

await assertVacancyCreatePaymentFlow({
  name: 'vacancy-credit-without-media',
  publicationPlan: 'single',
  publicationFunding: 'use_balance',
  balanceRemaining: 1,
  photos: [],
  expectedInitialStatus: AdStatus.DRAFT,
  expectedPaymentAmount: null,
  expectedCreatedPhotoCount: 0
});

assert.equal(isValidExternalUrl('https://yookassa.ru/checkout/payments/v2/contract?orderId=1'), true, 'YooKassa https URL is valid');
assert.equal(isValidExternalUrl(''), false, 'empty payment URL is invalid');
assert.equal(isValidExternalUrl('about:blank'), false, 'about:blank payment URL is invalid');
assert.equal(isValidPaymentConfirmationUrl('https://yookassa.ru/checkout/payments/v2/contract?orderId=1'), true, 'YooKassa confirmation URL is valid');
assert.equal(isValidPaymentConfirmationUrl('https://yoomoney.ru/checkout/payments/v2/contract?orderId=1'), true, 'YooMoney confirmation URL is valid');
assert.equal(isValidPaymentConfirmationUrl('http://yookassa.ru/checkout/payments/v2/contract?orderId=1'), false, 'payment confirmation URL must be https');
assert.equal(isValidPaymentConfirmationUrl('https://example.com/checkout/payments/v2/contract?orderId=1'), false, 'payment confirmation URL host is restricted');

const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
const globalWithWindow = globalThis as typeof globalThis & { window?: unknown };

try {
  const openedViaMax: Array<{ url: string; options?: { try_instant_view?: boolean } }> = [];
  globalWithWindow.window = {
    WebApp: {
      platform: 'web',
      openLink: (url: string, options?: { try_instant_view?: boolean }) => {
        openedViaMax.push({ url, options });
      }
    },
    open: () => {
      throw new Error('window.open must not be used inside MAX');
    }
  };
  const maxOpenResult = openExternalUrlWithResult('https://yookassa.ru/checkout/iphone-web');
  assert.deepEqual(
    maxOpenResult,
    { opened: true, platform: 'web', method: 'WebApp.openLink' },
    'MAX Web payment URL opens through WebApp.openLink'
  );
  assert.deepEqual(
    openedViaMax,
    [{ url: 'https://yookassa.ru/checkout/iphone-web', options: { try_instant_view: false } }],
    'MAX openLink receives payment URL and disables instant view'
  );

  globalWithWindow.window = {
    WebApp: {
      platform: 'web'
    },
    open: () => {
      throw new Error('window.open must not be used when MAX bridge is present');
    },
    location: {
      assign: () => {
        throw new Error('location.assign must never load checkout inside Mini App');
      }
    }
  };
  const maxMissingOpenLinkResult = openExternalUrlWithResult('https://yookassa.ru/checkout/no-open-link');
  assert.equal(maxMissingOpenLinkResult.opened, false, 'MAX Web without openLink keeps Mini App on current screen');
  assert.equal(maxMissingOpenLinkResult.reason, 'max_open_link_unavailable', 'MAX Web missing openLink reports fallback reason');

  let openedOutsideMax: { url: string; target: string; features: string } | null = null;
  globalWithWindow.window = {
    open: (url: string, target: string, features: string) => {
      openedOutsideMax = { url, target, features };
      return { closed: false };
    }
  };
  const browserOpenResult = openExternalUrlWithResult('https://yookassa.ru/checkout/browser');
  assert.deepEqual(
    browserOpenResult,
    { opened: true, platform: 'unknown', method: 'window.open' },
    'non-MAX browser fallback opens a new safe window'
  );
  assert.deepEqual(
    openedOutsideMax,
    { url: 'https://yookassa.ru/checkout/browser', target: '_blank', features: 'noopener,noreferrer' },
    'browser fallback uses noopener/noreferrer blank target'
  );
} finally {
  if (previousWindow === undefined) {
    delete globalWithWindow.window;
  } else {
    globalWithWindow.window = previousWindow;
  }
}

assert.equal(isVacancyPublicationFundingMode('auto'), true, 'auto funding mode');
assert.equal(isVacancyPublicationFundingMode('use_balance'), true, 'balance funding mode');
assert.equal(isVacancyPublicationFundingMode('buy_package'), true, 'package funding mode');
assert.equal(isVacancyPublicationFundingMode('payment'), false, 'unknown funding mode rejected');

assert.deepEqual(
  getRejectedVacancyRefundPolicy({ source: 'payment', planCode: 'single', publications: 1 }),
  { action: 'full_refund', reason: 'single_publication_payment' },
  'single vacancy rejection refunds payment'
);
assert.deepEqual(
  getRejectedVacancyRefundPolicy({ source: 'payment', planCode: 'bundle_3', publications: 3 }),
  { action: 'skip_yookassa_refund', reason: 'bundle_payment_slot_returned' },
  'bundle rejection does not refund whole package'
);
assert.deepEqual(
  getRejectedVacancyRefundPolicy({ source: 'payment', planCode: 'bundle_7', publications: 7, mediaHighlight: true }),
  { action: 'partial_refund', amountValue: '50.00', reason: 'bundle_highlight_payment' },
  'bundle rejection refunds only highlight add-on'
);
assert.deepEqual(
  getRejectedVacancyRefundPolicy({ source: 'payment', planCode: 'single', publications: 0, mediaHighlight: true }),
  { action: 'full_refund', reason: 'credit_highlight_payment' },
  'balance highlight rejection refunds highlight payment'
);
assert.deepEqual(
  getRejectedVacancyRefundPolicy({ source: 'credit', planCode: 'single', publications: 0 }),
  { action: 'skip_yookassa_refund', reason: 'payment_not_required' },
  'credit-only rejection skips YooKassa'
);

const paymentServiceWithDisabledYooKassa = new AdPaymentService(
  {} as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: false,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

assert.equal(
  paymentServiceWithDisabledYooKassa.isPaymentRequiredForAd({
    type: AdType.VACANCY,
    metadataJson: JSON.stringify({
      billing: {
        purpose: 'vacancy_publication',
        source: 'payment',
        planCode: 'bundle_7',
        publications: 7,
        paymentAmountValue: '350.00'
      }
    })
  }),
  true,
  'vacancy payment guard does not depend on YooKassa feature flag'
);
assert.equal(
  paymentServiceWithDisabledYooKassa.getInitialAdStatusForAdType('vacancy').toLowerCase(),
  'payment_pending',
  'vacancy starts as payment_pending when payment is required'
);

const paymentServiceWithMediaGuard = new AdPaymentService(
  {
    adPhoto: {
      findMany: async () => [
        {
          id: 'attached-photo'
        }
      ]
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: false,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await assert.rejects(
  () =>
    paymentServiceWithMediaGuard.createPaymentForAd({
      id: 'tampered-media-ad',
      ownerId: 'owner',
      type: AdType.VACANCY,
      status: 'PAYMENT_PENDING',
      metadataJson: JSON.stringify({
        billing: {
          purpose: 'vacancy_publication',
          source: 'credit',
          planCode: 'single',
          publications: 0,
          mediaHighlight: false,
          paymentAmountValue: '0.00'
        }
      })
    } as Parameters<AdPaymentService['createPaymentForAd']>[0]),
  /YooKassa payment is required/,
  'backend rejects media-fee bypass even when metadata says credit/free'
);

const paymentServiceWithInvalidConfirmationUrl = new AdPaymentService(
  {
    adPhoto: {
      findMany: async () => []
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {
    createPayment: async () => ({
      id: 'bad-confirmation-payment',
      status: 'pending',
      paid: false,
      amount: {
        value: '100.00',
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        confirmation_url: 'about:blank'
      },
      metadata: {
        purpose: 'ad_placement',
        adId: 'ad-with-bad-url'
      },
      test: true
    })
  } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await assert.rejects(
  () =>
    paymentServiceWithInvalidConfirmationUrl.createPaymentForAd({
      id: 'ad-with-bad-url',
      ownerId: 'owner',
      type: AdType.VACANCY,
      status: AdStatus.PAYMENT_PENDING,
      metadataJson: JSON.stringify({
        billing: {
          purpose: 'vacancy_publication',
          source: 'payment',
          planCode: 'single',
          publications: 1,
          paymentAmountValue: '100.00'
        }
      })
    } as Parameters<AdPaymentService['createPaymentForAd']>[0]),
  /valid payment confirmation URL/,
  'backend rejects invalid YooKassa confirmation URL instead of opening about:blank'
);

let productionTestPaymentDbCreates = 0;
const paymentServiceRejectingProductionTestPayment = new AdPaymentService(
  {
    adPhoto: {
      findMany: async () => []
    },
    adPayment: {
      create: async () => {
        productionTestPaymentDbCreates += 1;
        throw new Error('Test YooKassa payment must not be stored in production');
      }
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {
    createPayment: async (payload: { amount: { value: string; currency: string }; metadata: Record<string, string> }) => ({
      id: 'remote-test-payment-in-production',
      status: 'pending',
      paid: false,
      amount: payload.amount,
      confirmation: {
        type: 'redirect',
        confirmation_url: 'https://yookassa.ru/checkout/test-payment-in-production'
      },
      metadata: payload.metadata,
      test: true
    })
  } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await assert.rejects(
  () =>
    paymentServiceRejectingProductionTestPayment.createPaymentForAd({
      id: 'ad-production-test-payment',
      ownerId: 'owner',
      type: AdType.VACANCY,
      status: AdStatus.PAYMENT_PENDING,
      metadataJson: JSON.stringify({
        billing: {
          purpose: 'vacancy_publication',
          source: 'payment',
          planCode: 'single',
          publications: 1,
          paymentAmountValue: '100.00'
        }
      })
    } as Parameters<AdPaymentService['createPaymentForAd']>[0]),
  /test payment while production payments are required/,
  'backend rejects YooKassa test payment responses in production'
);
assert.equal(productionTestPaymentDbCreates, 0, 'production test payment is not stored locally');

async function assertYooKassaCreateAmount(input: {
  name: string;
  planCode: 'single' | 'bundle_3' | 'bundle_7';
  source: 'payment' | 'credit';
  publications: number;
  hasMedia: boolean;
  mediaCount?: number;
  expectedAmount: string;
}) {
  type CapturedYooKassaPaymentRequest = {
    amount: { value: string; currency: string };
    capture: boolean;
    confirmation: { type: string; return_url: string };
    metadata: Record<string, string>;
  };
  let requestedPayment: CapturedYooKassaPaymentRequest | undefined;

  const service = new AdPaymentService(
    {
      adPhoto: {
        findMany: async () =>
          input.hasMedia
            ? Array.from({ length: input.mediaCount ?? 1 }, (_, index) => ({ id: `attached-media-${index}` }))
            : []
      },
      adPayment: {
        create: async (payload: {
          data: {
            yooKassaPaymentId: string;
            status: PaymentStatus;
            amountValue: string;
            currency: string;
            confirmationUrl: string | null;
            packagePublications: number;
            includesMediaHighlight: boolean;
          };
        }) => ({
          id: `local-${input.name}`,
          yooKassaPaymentId: payload.data.yooKassaPaymentId,
          status: payload.data.status,
          amountValue: payload.data.amountValue,
          currency: payload.data.currency,
          confirmationUrl: payload.data.confirmationUrl,
          packagePublications: payload.data.packagePublications,
          includesMediaHighlight: payload.data.includesMediaHighlight
        })
      }
    } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
    {
      createPayment: async (payload: CapturedYooKassaPaymentRequest) => {
        requestedPayment = payload;
        return {
          id: `remote-${input.name}`,
          status: 'pending',
          paid: false,
          amount: payload.amount,
          confirmation: {
            type: 'redirect',
            confirmation_url: `https://yookassa.ru/checkout/${input.name}`
          },
          metadata: payload.metadata,
          test: true
        };
      }
    } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
    {
      enabled: true,
      amountValue: '100.00',
      currency: 'RUB',
      returnUrl: 'https://app.rabst24.ru/my-ads',
      testMode: true
    },
    {} as ConstructorParameters<typeof AdPaymentService>[3]
  );

  const result = await service.createPaymentForAd({
    id: `ad-${input.name}`,
    ownerId: 'owner',
    type: AdType.VACANCY,
    status: AdStatus.PAYMENT_PENDING,
    metadataJson: JSON.stringify({
      billing: {
        purpose: 'vacancy_publication',
        source: input.source,
        planCode: input.planCode,
        publications: input.publications,
        mediaHighlight: false,
        mediaFeeRequired: input.hasMedia,
        paymentAmountValue: input.source === 'payment' ? input.expectedAmount : undefined
      }
    })
  } as Parameters<AdPaymentService['createPaymentForAd']>[0]);

  assert.equal(requestedPayment?.amount.value, input.expectedAmount, `${input.name} YooKassa amount`);
  assert.equal(requestedPayment?.amount.currency, 'RUB', `${input.name} YooKassa currency`);
  assert.equal(requestedPayment?.capture, true, `${input.name} YooKassa capture`);
  assert.equal(requestedPayment?.confirmation.type, 'redirect', `${input.name} YooKassa redirect confirmation`);
  assert.equal(requestedPayment?.confirmation.return_url, 'https://app.rabst24.ru/my-ads', `${input.name} YooKassa return_url`);
  assert.equal(requestedPayment?.metadata.includesMediaFee, String(input.hasMedia), `${input.name} YooKassa media fee metadata`);
  assert.equal(requestedPayment?.metadata.includesMediaHighlight, String(input.hasMedia), `${input.name} legacy YooKassa media metadata`);
  assert.equal(result?.amount, input.expectedAmount, `${input.name} API payment amount`);
  assert.equal(Boolean(result?.confirmationUrl), true, `${input.name} confirmation URL`);
}

await assertYooKassaCreateAmount({
  name: 'single-no-media',
  planCode: 'single',
  source: 'payment',
  publications: 1,
  hasMedia: false,
  expectedAmount: '100.00'
});

await assertYooKassaCreateAmount({
  name: 'single-media',
  planCode: 'single',
  source: 'payment',
  publications: 1,
  hasMedia: true,
  expectedAmount: '150.00'
});

await assertYooKassaCreateAmount({
  name: 'bundle-3-media',
  planCode: 'bundle_3',
  source: 'payment',
  publications: 3,
  hasMedia: true,
  expectedAmount: '250.00'
});

await assertYooKassaCreateAmount({
  name: 'bundle-3-many-media',
  planCode: 'bundle_3',
  source: 'payment',
  publications: 3,
  hasMedia: true,
  mediaCount: 8,
  expectedAmount: '250.00'
});

await assertYooKassaCreateAmount({
  name: 'bundle-7-media',
  planCode: 'bundle_7',
  source: 'payment',
  publications: 7,
  hasMedia: true,
  expectedAmount: '400.00'
});

await assertYooKassaCreateAmount({
  name: 'credit-media',
  planCode: 'single',
  source: 'credit',
  publications: 0,
  hasMedia: true,
  expectedAmount: '50.00'
});

await assertYooKassaCreateAmount({
  name: 'payment-source-zero-publications-media',
  planCode: 'single',
  source: 'payment',
  publications: 0,
  hasMedia: true,
  expectedAmount: '50.00'
});

let republishUsageCreates = 0;
let republishBalanceUpdates = 0;
let republishStatus: AdStatus | null = null;
const paymentServiceWithRepublishCredit = new AdPaymentService(
  {
    userVacancyPublicationBalance: {
      findUnique: async () => ({
        userId: 'owner',
        purchased: 7,
        bonus: 0,
        used: 1,
        remaining: 6,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    adPhoto: {
      findMany: async () => []
    },
    $transaction: async (task: (tx: unknown) => Promise<unknown>) =>
      task({
        ad: {
          findFirst: async () => ({
            id: 'published-ad',
            ownerId: 'owner',
            type: AdType.VACANCY,
            status: AdStatus.PUBLISHED,
            metadataJson: null,
            deletedAt: null
          }),
          update: async (payload: { data: { status: AdStatus } }) => {
            republishStatus = payload.data.status;
            return {
              id: 'published-ad',
              ownerId: 'owner',
              type: AdType.VACANCY,
              status: payload.data.status,
              metadataJson: null
            };
          }
        },
        userVacancyPublicationBalance: {
          updateMany: async () => {
            republishBalanceUpdates += 1;
            return { count: 1 };
          }
        },
        vacancyPublicationUsage: {
          create: async () => {
            republishUsageCreates += 1;
            return {};
          }
        },
        moderationLog: {
          create: async () => ({})
        }
      })
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

const republishCreditResult = await paymentServiceWithRepublishCredit.prepareVacancyRepublish('published-ad', 'owner');

assert.equal(republishCreditResult.payment, null, 'republish with credit and no media does not require payment');
assert.equal(republishStatus, AdStatus.PENDING_MODERATION, 'republish with credit sends vacancy to moderation');
assert.equal(republishBalanceUpdates, 1, 'republish with credit consumes one more publication');
assert.equal(republishUsageCreates, 1, 'republish creates a new publication usage cycle');

let duplicateRejectCoreCalls = 0;
let duplicateRejectCreditReturnCalls = 0;
let duplicateRejectRefundCalls = 0;
const moderationServiceWithDuplicateReject = new ModerationModuleService(
  {} as ConstructorParameters<typeof ModerationModuleService>[0],
  {
    getAdDetails: async () => ({
      id: 'already-rejected-ad',
      status: AdStatus.REJECTED
    })
  } as unknown as ConstructorParameters<typeof ModerationModuleService>[1],
  {
    rejectAd: async () => {
      duplicateRejectCoreCalls += 1;
      return {};
    }
  } as unknown as ConstructorParameters<typeof ModerationModuleService>[2],
  {} as ConstructorParameters<typeof ModerationModuleService>[3],
  {
    removeAdPublications: async () => ({
      attempted: 0,
      removed: 0,
      failed: 0,
      skipped: 0
    })
  } as unknown as ConstructorParameters<typeof ModerationModuleService>[4],
  {
    returnVacancyPublicationCredit: async () => {
      duplicateRejectCreditReturnCalls += 1;
      return {
        returned: false,
        reason: 'usage_not_found'
      };
    },
    refundLatestSucceededAdPayment: async () => {
      duplicateRejectRefundCalls += 1;
      return {
        status: 'skipped',
        reason: 'no_succeeded_payment'
      };
    }
  } as unknown as ConstructorParameters<typeof ModerationModuleService>[5]
);

await moderationServiceWithDuplicateReject.reject('already-rejected-ad', 'moderator', 'Тестовый отказ');

assert.equal(duplicateRejectCoreCalls, 0, 'double reject does not repeat status transition');
assert.equal(duplicateRejectCreditReturnCalls, 1, 'double reject credit return remains idempotent');
assert.equal(duplicateRejectRefundCalls, 1, 'double reject refund remains idempotent');

let refundUpdatePayload: unknown = null;
const paymentServiceWithRefundDb = new AdPaymentService(
  {
    adPayment: {
      findUnique: async () => ({
        id: 'local-payment',
        amountValue: '400.00',
        currency: 'RUB'
      }),
      update: async (payload: unknown) => {
        refundUpdatePayload = payload;
        return payload;
      }
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await (paymentServiceWithRefundDb as unknown as { handleRefundSucceeded: (refund: unknown) => Promise<void> }).handleRefundSucceeded({
  id: 'refund-highlight',
  payment_id: 'remote-payment',
  status: 'succeeded',
  amount: {
    value: '50.00',
    currency: 'RUB'
  }
});

assert.equal(
  (refundUpdatePayload as { data?: { yooKassaRefundId?: string; status?: PaymentStatus } }).data?.yooKassaRefundId,
  'refund-highlight',
  'partial highlight refund webhook is accepted'
);

let unknownWebhookRemoteLookupCalls = 0;
const paymentServiceWithUnknownWebhookPayment = new AdPaymentService(
  {
    adPayment: {
      findUnique: async () => null
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {
    getPayment: async () => {
      unknownWebhookRemoteLookupCalls += 1;
      throw new Error('Remote YooKassa lookup must not run for unknown local payments');
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

const unknownWebhookResult = await paymentServiceWithUnknownWebhookPayment.handleWebhook({
  event: 'payment.succeeded',
  object: {
    id: 'unknown-payment-id'
  }
});

assert.deepEqual(
  unknownWebhookResult,
  {
    handled: false,
    event: 'payment.succeeded',
    paymentId: 'unknown-payment-id'
  },
  'unknown YooKassa payment webhook is ignored without 5xx'
);
assert.equal(unknownWebhookRemoteLookupCalls, 0, 'unknown YooKassa payment does not trigger remote lookup');

let productionTestPaymentStatusUpdates = 0;
const paymentServiceRejectingProductionTestWebhook = new AdPaymentService(
  {
    adPayment: {
      findUnique: async () => ({
        id: 'local-test-payment-in-production',
        adId: 'ad-production-test-webhook',
        amountValue: '100.00',
        currency: 'RUB'
      }),
      update: async () => {
        productionTestPaymentStatusUpdates += 1;
        throw new Error('Test YooKassa webhook must not update local payment in production');
      }
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {
    getPayment: async () => ({
      id: 'remote-test-payment-webhook',
      status: 'succeeded',
      paid: true,
      amount: {
        value: '100.00',
        currency: 'RUB'
      },
      metadata: {
        purpose: 'ad_placement',
        adId: 'ad-production-test-webhook'
      },
      test: true
    })
  } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await assert.rejects(
  () => paymentServiceRejectingProductionTestWebhook.syncPaymentByYooKassaPaymentId('remote-test-payment-webhook'),
  /test payment while production payments are required/,
  'backend rejects YooKassa test payment webhook sync in production'
);
assert.equal(productionTestPaymentStatusUpdates, 0, 'production test payment webhook does not update local status');

let latestRefundQuery: unknown = null;
const paymentServiceWithPendingRefund = new AdPaymentService(
  {
    ad: {
      findUnique: async () => ({
        type: AdType.VACANCY,
        metadataJson: JSON.stringify({
          billing: {
            purpose: 'vacancy_publication',
            source: 'payment',
            planCode: 'single',
            publications: 1,
            paymentAmountValue: '100.00'
          }
        })
      })
    },
    adPayment: {
      findFirst: async (payload: unknown) => {
        latestRefundQuery = payload;
        return null;
      }
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await paymentServiceWithPendingRefund.refundLatestSucceededAdPayment('ad-with-refund');

assert.equal(
  (latestRefundQuery as { where?: { yooKassaRefundId?: null } }).where?.yooKassaRefundId,
  null,
  'pending refund requests are excluded from duplicate refund creation'
);

let revisionRefundPaymentId: string | null = null;
let revisionRefundUpdatedPaymentId: string | null = null;
const paymentServiceWithRevisionRefund = new AdPaymentService(
  {
    adPayment: {
      findFirst: async () => ({
        id: 'revision-payment-local',
        adId: 'ad-revision',
        yooKassaPaymentId: 'revision-payment-remote',
        amountValue: '50.00',
        currency: 'RUB',
        status: PaymentStatus.SUCCEEDED,
        refundedAt: null,
        yooKassaRefundId: null,
        packagePublications: 0,
        includesMediaHighlight: true,
        ad: {
          id: 'ad-revision',
          ownerId: 'owner',
          title: 'Live vacancy',
          type: AdType.VACANCY
        }
      }),
      update: async ({ where }: { where: { id: string } }) => {
        revisionRefundUpdatedPaymentId = where.id;
        return {};
      }
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {
    createRefund: async (payload: { payment_id: string; amount: { value: string } }) => {
      revisionRefundPaymentId = payload.payment_id;
      assert.equal(payload.amount.value, '50.00', 'revision media fee refund uses paid media amount');

      return {
        id: 'revision-refund',
        status: 'succeeded'
      };
    }
  } as unknown as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: true
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

const revisionRefundResult = await paymentServiceWithRevisionRefund.refundSucceededAdPayment('revision-payment-local', 'bad media');
assert.equal(revisionRefundResult.status, 'refunded', 'rejected paid revision refunds its own succeeded payment');
assert.equal(revisionRefundPaymentId, 'revision-payment-remote', 'revision refund targets revision YooKassa payment');
assert.equal(revisionRefundUpdatedPaymentId, 'revision-payment-local', 'revision refund updates revision payment record');

function createPaymentGuardService(input: {
  billing?: Record<string, unknown> | null;
  succeededPayment?: {
    paidAt?: Date | null;
    createdAt?: Date;
    includesMediaHighlight?: boolean;
  } | null;
  activeUsage?: {
    id?: string;
    createdAt?: Date;
  } | null;
  lastPublicationAt?: Date | null;
}) {
  const metadataJson =
    input.billing === undefined
      ? null
      : JSON.stringify({
          billing: {
            purpose: 'vacancy_publication',
            ...input.billing
          }
        });
  const usage = input.activeUsage
    ? {
        id: input.activeUsage.id ?? 'usage',
        createdAt: input.activeUsage.createdAt ?? new Date('2026-07-24T08:00:00.000Z'),
        returnedAt: null
      }
    : null;
  const payment = input.succeededPayment
    ? {
        id: 'local-payment',
        paidAt: input.succeededPayment.paidAt ?? new Date('2026-07-24T08:01:00.000Z'),
        createdAt: input.succeededPayment.createdAt ?? new Date('2026-07-24T08:01:00.000Z'),
        includesMediaHighlight: input.succeededPayment.includesMediaHighlight ?? false
      }
    : null;

  return new AdPaymentService(
    {
      ad: {
        findUnique: async () => ({
          id: 'guarded-vacancy',
          ownerId: 'owner',
          type: AdType.VACANCY,
          metadataJson,
          publishedAt: input.lastPublicationAt ?? null
        })
      },
      adPayment: {
        findFirst: async (query: { where?: { includesMediaHighlight?: boolean } }) => {
          if (query.where?.includesMediaHighlight === true && !payment?.includesMediaHighlight) {
            return null;
          }

          return payment;
        }
      },
      channelPublishLog: {
        findFirst: async () =>
          input.lastPublicationAt
            ? {
                id: 'last-publication',
                publishedAt: input.lastPublicationAt,
                createdAt: input.lastPublicationAt
              }
            : null
      },
      vacancyPublicationUsage: {
        findFirst: async () => usage,
        create: async () => ({})
      },
      userVacancyPublicationBalance: {
        findUnique: async () => ({
          userId: 'owner',
          purchased: 1,
          bonus: 0,
          used: 0,
          remaining: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      },
      $transaction: async (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }

        throw new Error('unexpected transaction shape');
      }
    } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
    {} as ConstructorParameters<typeof AdPaymentService>[1],
    {
      enabled: true,
      amountValue: '100.00',
      currency: 'RUB',
      returnUrl: 'https://app.rabst24.ru/my-ads',
      testMode: false
    },
    {} as ConstructorParameters<typeof AdPaymentService>[3]
  );
}

await assert.rejects(
  () =>
    createPaymentGuardService({
      billing: {
        source: 'payment',
        planCode: 'single',
        publications: 1,
        mediaFeeRequired: false
      },
      succeededPayment: null,
      activeUsage: null
    }).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy'),
  /paid publication credit is required/,
  'unpaid vacancy cannot enter moderation even after payment creation'
);

await assert.rejects(
  () =>
    createPaymentGuardService({
      billing: {
        source: 'payment',
        planCode: 'single',
        publications: 1,
        mediaFeeRequired: false
      },
      succeededPayment: null,
      activeUsage: {
        id: 'tampered-usage'
      }
    }).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy'),
  /Payment is required/,
  'fake credit usage does not replace required succeeded payment'
);

await createPaymentGuardService({
  billing: {
    source: 'credit',
    planCode: 'single',
    publications: 0,
    mediaFeeRequired: false
  },
  succeededPayment: null,
  activeUsage: {
    id: 'credit-usage'
  }
}).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy');

let revisionCreditMetadataJson: string | null = null;
const revisionCreditMarkerService = new AdPaymentService(
  {
    userVacancyPublicationBalance: {
      findUnique: async () => ({
        userId: 'owner',
        purchased: 7,
        bonus: 0,
        used: 1,
        remaining: 6,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    $transaction: async (task: (tx: unknown) => Promise<unknown>) =>
      task({
        ad: {
          findFirst: async () => ({
            metadataJson: null
          }),
          update: async (payload: { data?: { metadataJson?: string } }) => {
            revisionCreditMetadataJson = payload.data?.metadataJson ?? null;
            return {};
          }
        },
        userVacancyPublicationBalance: {
          updateMany: async () => ({ count: 1 })
        },
        vacancyPublicationUsage: {
          create: async () => ({})
        }
      })
  } as unknown as ConstructorParameters<typeof AdPaymentService>[0],
  {} as ConstructorParameters<typeof AdPaymentService>[1],
  {
    enabled: true,
    amountValue: '100.00',
    currency: 'RUB',
    returnUrl: 'https://app.rabst24.ru/my-ads',
    testMode: false
  },
  {} as ConstructorParameters<typeof AdPaymentService>[3]
);

await revisionCreditMarkerService.consumeVacancyPublicationCreditForRevision('guarded-vacancy', 'owner');

assert.equal(
  (JSON.parse(revisionCreditMetadataJson ?? '{}') as { billing?: { source?: string; publications?: number } }).billing?.source,
  'credit',
  'revision credit consumption stores credit billing marker for moderation approve'
);
assert.equal(
  (JSON.parse(revisionCreditMetadataJson ?? '{}') as { billing?: { publications?: number } }).billing?.publications,
  0,
  'revision credit billing marker does not mint new package publications'
);

await assert.rejects(
  () =>
    createPaymentGuardService({
      billing: {
        source: 'payment',
        planCode: 'single',
        publications: 0,
        mediaFeeRequired: true
      },
      succeededPayment: null,
      activeUsage: {
        id: 'credit-before-media'
      }
    }).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy'),
  /Payment is required/,
  'existing credit plus unpaid media fee cannot enter moderation'
);

await createPaymentGuardService({
  billing: {
    source: 'payment',
    planCode: 'single',
    publications: 0,
    mediaFeeRequired: true
  },
  succeededPayment: {
    includesMediaHighlight: true
  },
  activeUsage: {
    id: 'credit-after-media'
  }
}).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy');

await assert.rejects(
  () =>
    createPaymentGuardService({
      billing: {
        source: 'credit',
        planCode: 'single',
        publications: 0,
        mediaFeeRequired: false
      },
      succeededPayment: null,
      activeUsage: {
        id: 'old-credit',
        createdAt: new Date('2026-07-23T08:00:00.000Z')
      },
      lastPublicationAt: new Date('2026-07-24T08:00:00.000Z')
    }).assertAdHasFreshSucceededPaymentForPublication('guarded-vacancy'),
  /new vacancy publication credit is required/,
  'repeat publication requires a fresh consumed credit'
);

const fakePaidPayload = createVacancySchema.parse({
  ...vacancyPayloadWithMedia,
  photos: [],
  paid: true,
  paymentStatus: 'SUCCEEDED',
  paymentPurpose: 'RESUME_CONTACT_UNLOCK',
  purposeCode: 'AD_PROMOTION'
});

assert.equal(
  Object.prototype.hasOwnProperty.call(fakePaidPayload, 'paid'),
  false,
  'backend vacancy schema ignores fake client paid=true'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(fakePaidPayload, 'paymentPurpose'),
  false,
  'backend vacancy schema ignores fake client payment purpose'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(fakePaidPayload, 'purposeCode'),
  false,
  'backend vacancy schema ignores fake client purposeCode'
);

const resumeWithoutSalary = createResumePayloadSchema.safeParse({
  name: 'Иван Иванов',
  profession: 'Отделочник',
  description: 'Опыт отделочных работ',
  experienceText: 'Опыт отделочных работ',
  contacts: [
    {
      type: 'PHONE',
      value: '+79990000000'
    }
  ],
  photos: []
});

assert.equal(resumeWithoutSalary.success, true, 'resume salary is optional');

for (const expectedSalary of [undefined, null, '']) {
  const apiResumeWithoutSalary = createResumeSchema.safeParse({
    name: 'Иван Иванов',
    profession: 'Отделочник',
    description: 'Опыт отделочных работ',
    experienceText: 'Опыт отделочных работ',
    expectedSalary,
    contacts: [
      {
        type: 'PHONE',
        value: '+79990000000'
      }
    ],
    photos: []
  });

  assert.equal(apiResumeWithoutSalary.success, true, `api resume salary ${String(expectedSalary)} is optional`);
  assert.equal(apiResumeWithoutSalary.data?.expectedSalary, undefined, `api resume salary ${String(expectedSalary)} normalizes to undefined`);
}

async function runAdRevisionSubmitScenario(input: {
  type: AdType;
  status: AdStatus;
  balanceRemaining: number;
  mediaChanged: boolean;
  hasActiveRevision?: boolean;
}) {
  let balanceRemaining = input.balanceRemaining;
  let consumedCredits = 0;
  let savedDrafts = 0;
  const createdPayments: Array<{ amount: string }> = [];
  const currentAd = createRevisionScenarioAd(input.type, input.status);
  const revision = createRevisionRecord({
    status: 'DRAFT',
    mediaChanged: input.mediaChanged
  });

  const revisionRepository = {
    findLatestActive: async () => (input.hasActiveRevision === false ? null : revision),
    saveDraft: async () => {
      savedDrafts += 1;
      return revision;
    },
    listForAd: async () => [revision],
    cancel: async () => {
      revision.status = 'CANCELLED';
      return revision;
    },
    markSubmitted: async () => {
      revision.status = 'PENDING_MODERATION';
      revision.submittedAt = new Date();
      return revision;
    },
    markAwaitingPayment: async (_revisionId: string, paymentId: string) => {
      revision.status = 'AWAITING_PAYMENT';
      revision.paymentId = paymentId;
      return revision;
    }
  };

  const paymentService = {
    reconcilePendingOwnerPayments: async () => undefined,
    getInitialAdStatusForAdType: () => AdStatus.PAYMENT_PENDING,
    getVacancyPublicationBalance: async () => ({
      purchased: balanceRemaining,
      bonus: 0,
      used: consumedCredits,
      remaining: balanceRemaining
    }),
    consumeVacancyPublicationCreditForRevision: async () => {
      if (balanceRemaining <= 0) {
        throw new Error('negative balance guard');
      }

      balanceRemaining -= 1;
      consumedCredits += 1;
    },
    createPaymentForVacancyRevision: async (request: {
      publicationPlan?: 'single' | 'bundle_3' | 'bundle_7';
      usesBalance: boolean;
      mediaFeeRequired: boolean;
    }) => {
      const amount = getVacancyPublicationPaymentAmount({
        planCode: request.publicationPlan ?? 'single',
        usesBalance: request.usesBalance,
        mediaFeeRequired: request.mediaFeeRequired
      });
      createdPayments.push({ amount });

      return {
        id: `payment-${createdPayments.length}`,
        paymentId: `remote-payment-${createdPayments.length}`,
        status: 'pending',
        amount,
        currency: 'RUB',
        confirmationUrl: `https://yookassa.ru/checkout/revision-${createdPayments.length}`,
        test: true
      };
    },
    prepareVacancyRepublish: async () => ({
      ad: currentAd,
      payment: null
    }),
    createPaymentForAd: async () => null,
    assertAdHasFreshSucceededPaymentForPublication: async () => undefined
  };

  const service = new AdsService(
    {} as ConstructorParameters<typeof AdsService>[0],
    {
      getOwnedAdDetails: async () => currentAd,
      getPublicAdDetails: async () => currentAd,
      listOwnerAds: async () => ({ items: [currentAd], page: 1, perPage: 20, total: 1 }),
      listPublicAds: async () => ({ items: [currentAd], page: 1, perPage: 20, total: 1 }),
      updateOwnerAd: async () => currentAd,
      resubmitOwnerAd: async () => {
        currentAd.status = AdStatus.PENDING_MODERATION;
        return currentAd;
      }
    } as unknown as ConstructorParameters<typeof AdsService>[1],
    {
      removeAdPublications: async () => ({ attempted: 0, removed: 0, failed: 0, skipped: 0 })
    } as unknown as ConstructorParameters<typeof AdsService>[2],
    {
      notifyNewAd: async () => undefined
    } as unknown as ConstructorParameters<typeof AdsService>[3],
    paymentService as unknown as ConstructorParameters<typeof AdsService>[4],
    revisionRepository as unknown as ConstructorParameters<typeof AdsService>[5]
  );

  const result = await service.resubmitMine('owner', 'ad-revision');

  return {
    service,
    result,
    revision,
    currentAd,
    createdPayments,
    consumedCredits,
    savedDrafts,
    balanceRemaining
  };
}

async function runRevisionModerationScenario(action: 'approve' | 'reject') {
  const ad = createRevisionScenarioAd(AdType.VACANCY, AdStatus.PUBLISHED);
  ad.title = 'Live published title';
  let telegramEnqueues = 0;
  const revision = createRevisionRecord({
    status: 'PENDING_MODERATION',
    mediaChanged: false,
    title: 'Approved revision title'
  });

  const service = new ModerationModuleService(
    {} as ConstructorParameters<typeof ModerationModuleService>[0],
    {
      getAdDetails: async () => ad,
      markAdPublished: async () => {
        ad.status = AdStatus.PUBLISHED;
        return ad;
      },
      listModerationQueue: async () => ({ items: [ad], page: 1, perPage: 20, total: 1 })
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[1],
    {
      approveAd: async () => undefined,
      rejectAd: async () => undefined,
      hideAd: async () => undefined,
      unpublishAd: async () => undefined,
      archiveAd: async () => undefined,
      deleteAd: async () => undefined,
      logChannelRemoved: async () => undefined
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[2],
    {
      list: async () => ({ items: [], page: 1, perPage: 20, total: 0 })
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[3],
    {
      enqueueAdPublication: async () => undefined,
      publishApprovedAd: async () => ({ status: 'skipped', reason: 'test' }),
      removeAdPublications: async () => ({ attempted: 0, removed: 0, failed: 0, skipped: 0 })
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[4],
    {
      assertAdHasFreshSucceededPaymentForPublication: async () => undefined,
      returnVacancyPublicationCredit: async () => ({ returned: true }),
      refundLatestSucceededAdPayment: async () => ({ status: 'skipped', reason: 'test' })
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[5],
    {
      findLatestPendingModeration: async () => (revision.status === 'PENDING_MODERATION' ? revision : null),
      approvePending: async () => {
        revision.status = 'APPROVED';
        revision.approvedAt = new Date();
        ad.title = JSON.parse(revision.dataJson).title as string;
        ad.status = AdStatus.APPROVED;
        return revision;
      },
      rejectPending: async (_adId: string, reason: string) => {
        revision.status = 'REJECTED';
        revision.rejectionReason = reason;
        revision.rejectedAt = new Date();
        return revision;
      }
    } as unknown as ConstructorParameters<typeof ModerationModuleService>[6],
    undefined,
    undefined,
    {
      enqueuePublicationForAd: async () => {
        telegramEnqueues += 1;
      },
      removePublicationsForAd: async () => ({ attempted: 0, deleted: 0, failed: 0, skipped: 0 })
    }
  );

  const result =
    action === 'approve'
      ? await service.approve('ad-revision', 'moderator')
      : await service.reject('ad-revision', 'moderator', 'wrong salary');

  return {
    ...result,
    revision,
    telegramEnqueues
  };
}

async function runAdRevisionRepositoryApproveSnapshot() {
  const revision: AdRevisionRecord = {
    id: 'revision-product',
    adId: 'ad-product',
    version: 2,
    status: 'PENDING_MODERATION',
    dataJson: JSON.stringify({
      title: 'Перфоратор Bosch SDS-plus v2',
      description: 'Новое описание',
      city: null,
      districtText: 'РЎРђРћ',
      categoryText: 'Электроинструмент',
      priceAmount: 9500,
      metadata: {
        address: 'Новый склад'
      },
      contacts: [{ type: 'PHONE', value: '+79990000000', isPreferred: true }],
      requirements: [],
      responsibilities: [],
      benefits: [],
      product: {
        manufacturer: 'Bosch',
        model: 'GBH 2-28',
        condition: 'USED',
        quantity: 1,
        unit: 'С€С‚',
        saleType: 'RETAIL',
        deliveryAvailable: true
      },
      mediaChanged: false
    }),
    mediaJson: null,
    createdBy: 'owner',
    paymentId: null,
    submittedAt: new Date(),
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const adUpdates: Array<Record<string, unknown>> = [];
  let productUpdate: Record<string, unknown> | null = null;

  const db = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    ad: {
      findUnique: async () => ({
        status: AdStatus.PUBLISHED,
        metadataJson: JSON.stringify({ address: 'Старый склад' })
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        adUpdates.push(data);
        return data;
      }
    },
    adRevision: {
      findFirst: async () => revision,
      update: async ({ data }: { data: Partial<AdRevisionRecord> }) => {
        Object.assign(revision, data);
        return revision;
      },
      findUnique: async () => revision,
      create: async () => revision,
      findMany: async () => [revision]
    },
    adPhoto: {
      updateMany: async () => ({}),
      createMany: async () => ({})
    },
    resumeDetails: {
      upsert: async () => ({})
    },
    vacancyDetails: {
      upsert: async () => ({})
    },
    equipmentDetails: {
      upsert: async () => ({})
    },
    productDetails: {
      upsert: async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
        productUpdate = update ?? create;
        return productUpdate;
      }
    },
    adContact: {
      updateMany: async () => ({}),
      createMany: async () => ({})
    },
    adRequirement: {
      deleteMany: async () => ({}),
      createMany: async () => ({})
    },
    adResponsibility: {
      deleteMany: async () => ({}),
      createMany: async () => ({})
    },
    adBenefit: {
      deleteMany: async () => ({}),
      createMany: async () => ({})
    },
    moderationLog: {
      create: async () => ({})
    }
  };

  const repository = new AdRevisionRepository(db as never);
  await repository.approvePending('ad-product', 'moderator');

  return {
    revision,
    adUpdate: adUpdates.find((update) => Object.prototype.hasOwnProperty.call(update, 'priceAmount')) ?? null,
    productUpdate,
    data: parseRevisionData(revision.dataJson)
  };
}

function createRevisionScenarioAd(type: AdType, status: AdStatus) {
  return {
    id: 'ad-revision',
    ownerId: 'owner',
    type,
    status,
    title: 'Live title',
    description: 'Live description',
    city: 'Москва',
    districtText: 'ЦАО',
    categoryText: 'Электрика',
    priceAmount: null,
    priceCurrency: 'RUB',
    metadataJson: null,
    isTest: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: status === AdStatus.PUBLISHED ? new Date() : null,
    moderatedAt: null,
    hiddenAt: null,
    archivedAt: null,
    deletedAt: null,
    expiresAt: null,
    photos: [],
    contacts: [],
    requirements: [],
    responsibilities: [],
    benefits: [],
    metroStations: [],
    resumeDetails: type === AdType.RESUME ? { desiredPosition: 'Монтажник' } : null,
    vacancyDetails: null,
    equipmentDetails: null,
    productDetails: null,
    owner: null,
    moderationLogs: [],
    channelPublishLogs: [],
    payments: []
  } as unknown as Awaited<ReturnType<ConstructorParameters<typeof AdsService>[1]['getOwnedAdDetails']>>;
}

function createRevisionRecord(input: {
  status: AdRevisionRecord['status'];
  mediaChanged: boolean;
  title?: string;
}): AdRevisionRecord {
  return {
    id: 'revision-1',
    adId: 'ad-revision',
    version: 1,
    status: input.status,
    dataJson: JSON.stringify({
      title: input.title ?? 'Revision title',
      description: 'Revision description',
      city: 'Москва',
      districtText: 'ЦАО',
      categoryText: 'Электрика',
      desiredPosition: 'Монтажник',
      mediaChanged: input.mediaChanged
    }),
    mediaJson: input.mediaChanged
      ? JSON.stringify([
          {
            storageKey: 'uploads/revision-photo.jpg',
            url: 'https://cdn.example.test/revision-photo.jpg',
            previewUrl: 'https://cdn.example.test/revision-photo-preview.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 100
          }
        ])
      : null,
    createdBy: 'owner',
    paymentId: null,
    submittedAt: input.status === 'PENDING_MODERATION' ? new Date() : null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function createMemoryOutboxRepository(): {
  jobs: OutboxJobRecord[];
  repository: OutboxJobRepositoryLike;
} {
  const jobs: OutboxJobRecord[] = [];
  let sequence = 0;

  const touch = (job: OutboxJobRecord, now = new Date()): OutboxJobRecord => {
    job.updatedAt = now;
    return job;
  };

  return {
    jobs,
    repository: {
      async create(input: OutboxJobCreateInput) {
        if (jobs.some((job) => job.idempotencyKey === input.idempotencyKey)) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }

        const now = new Date();
        const job: OutboxJobRecord = {
          id: `job-${++sequence}`,
          type: input.type,
          status: OUTBOX_JOB_STATUS.PENDING,
          payloadJson: input.payloadJson,
          idempotencyKey: input.idempotencyKey,
          attempts: 0,
          maxAttempts: input.maxAttempts,
          nextAttemptAt: input.nextAttemptAt,
          lockedAt: null,
          lockedBy: null,
          completedAt: null,
          lastError: null,
          resultJson: null,
          createdAt: now,
          updatedAt: now
        };

        jobs.push(job);
        return job;
      },
      async findByIdempotencyKey(idempotencyKey: string) {
        return jobs.find((job) => job.idempotencyKey === idempotencyKey) ?? null;
      },
      async requeue(id: string, nextAttemptAt: Date, now: Date) {
        const job = findMemoryOutboxJob(jobs, id);
        job.status = OUTBOX_JOB_STATUS.PENDING;
        job.attempts = 0;
        job.nextAttemptAt = nextAttemptAt;
        job.lockedAt = null;
        job.lockedBy = null;
        job.completedAt = null;
        job.lastError = null;
        job.resultJson = null;

        return touch(job, now);
      },
      async claimNext(input) {
        const candidate = jobs.find((job) => {
          const duePending = job.status === OUTBOX_JOB_STATUS.PENDING && job.nextAttemptAt <= input.now;
          const staleProcessing =
            job.status === OUTBOX_JOB_STATUS.PROCESSING &&
            job.lockedAt !== null &&
            job.lockedAt <= input.staleBefore;

          return duePending || staleProcessing;
        });

        if (!candidate) {
          return null;
        }

        candidate.status = OUTBOX_JOB_STATUS.PROCESSING;
        candidate.lockedAt = input.now;
        candidate.lockedBy = input.workerId;
        candidate.attempts += 1;
        candidate.lastError = null;

        return touch(candidate, input.now);
      },
      async complete(id: string, resultJson: string | null, now: Date) {
        const job = findMemoryOutboxJob(jobs, id);
        job.status = OUTBOX_JOB_STATUS.SUCCEEDED;
        job.completedAt = now;
        job.lockedAt = null;
        job.lockedBy = null;
        job.resultJson = resultJson;
        return touch(job, now);
      },
      async retryOrFail(id: string, lastError: string, nextAttemptAt: Date, now: Date) {
        const job = findMemoryOutboxJob(jobs, id);
        const exhausted = job.attempts >= job.maxAttempts;

        job.status = exhausted ? OUTBOX_JOB_STATUS.FAILED : OUTBOX_JOB_STATUS.PENDING;
        job.completedAt = exhausted ? now : null;
        job.nextAttemptAt = exhausted ? job.nextAttemptAt : nextAttemptAt;
        job.lockedAt = null;
        job.lockedBy = null;
        job.lastError = lastError;

        return touch(job, now);
      },
      async recoverStuck(staleBefore: Date, now: Date) {
        let recovered = 0;

        for (const job of jobs) {
          if (job.status === OUTBOX_JOB_STATUS.PROCESSING && job.lockedAt !== null && job.lockedAt <= staleBefore) {
            job.status = OUTBOX_JOB_STATUS.PENDING;
            job.lockedAt = null;
            job.lockedBy = null;
            job.nextAttemptAt = now;
            touch(job, now);
            recovered += 1;
          }
        }

        return recovered;
      }
    }
  };
}

function findMemoryOutboxJob(jobs: OutboxJobRecord[], id: string): OutboxJobRecord {
  const job = jobs.find((item) => item.id === id);

  if (!job) {
    throw new Error(`Outbox job not found: ${id}`);
  }

  return job;
}

function isTestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createMemoryNotificationHarness() {
  type MemoryUser = {
    id: string;
    maxUserId: string | null;
    role: UserRole;
    status: UserStatus;
    notificationPreference: MemoryPreference | null;
  };
  type MemoryPreference = {
    adStatusEnabled: boolean;
    applicationsEnabled: boolean;
    savedSearchesEnabled: boolean;
    paymentsEnabled: boolean;
    marketingEnabled: boolean;
  };
  type MemoryNotification = {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    payloadJson: string | null;
    idempotencyKey: string;
    readAt: Date | null;
    createdAt: Date;
  };
  type MemoryDelivery = {
    id: string;
    notificationId: string;
    channel: NotificationDeliveryChannel;
    status: NotificationDeliveryStatus;
    attempts: number;
    sentAt: Date | null;
    lastError: string | null;
    externalMessageId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const users = new Map<string, MemoryUser>([
    [
      'notify-user',
      {
        id: 'notify-user',
        maxUserId: 'max-notify-user',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        notificationPreference: null
      }
    ]
  ]);
  const preferences = new Map<string, MemoryPreference>();
  const notifications: MemoryNotification[] = [];
  const deliveries: MemoryDelivery[] = [];
  let notificationSequence = 0;
  let deliverySequence = 0;

  const tx = {
    notification: {
      create: async ({ data }: { data: Omit<MemoryNotification, 'id' | 'readAt' | 'createdAt'> }) => {
        const notification: MemoryNotification = {
          id: `notification-${++notificationSequence}`,
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          payloadJson: data.payloadJson,
          idempotencyKey: data.idempotencyKey,
          readAt: null,
          createdAt: new Date()
        };
        notifications.push(notification);
        return notification;
      }
    },
    notificationDelivery: {
      create: async ({ data }: { data: Partial<MemoryDelivery> & Pick<MemoryDelivery, 'notificationId' | 'channel' | 'status'> }) => {
        const delivery: MemoryDelivery = {
          id: `delivery-${++deliverySequence}`,
          notificationId: data.notificationId,
          channel: data.channel,
          status: data.status,
          attempts: data.attempts ?? 0,
          sentAt: data.sentAt ?? null,
          lastError: data.lastError ?? null,
          externalMessageId: data.externalMessageId ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        deliveries.push(delivery);
        return delivery;
      }
    }
  };

  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
      findMany: async () =>
        [...users.values()]
          .filter((user) => user.status === UserStatus.ACTIVE && (user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR))
          .map((user) => ({
            id: user.id,
            role: user.role
          }))
    },
    ad: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'moderation-ad'
          ? {
              id: 'moderation-ad',
              ownerId: 'owner',
              type: AdType.VACANCY,
              status: AdStatus.PENDING_MODERATION,
              title: 'Плотник',
              description: null,
              city: 'Москва',
              districtText: 'ЦАО',
              categoryText: null,
              locationLat: null,
              locationLon: null,
              priceAmount: null,
              currency: 'RUB',
              metadataJson: null,
              isTest: false,
              moderatedAt: null,
              publishedAt: null,
              hiddenAt: null,
              archivedAt: null,
              expiresAt: null,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              owner: {
                id: 'owner',
                maxUserId: 'max-owner',
                maxUsername: 'owner',
                firstName: 'Owner',
                lastName: null,
                displayName: 'Employer'
              },
              contacts: []
            }
          : null
    },
    notification: {
      findUnique: async ({ where }: { where: { idempotencyKey?: string; id?: string }; include?: { deliveries?: boolean } }) => {
        const notification = notifications.find((item) =>
          where.idempotencyKey ? item.idempotencyKey === where.idempotencyKey : item.id === where.id
        );

        return notification ? withNotificationDeliveries(notification) : null;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string }; include?: { deliveries?: boolean } }) => {
        const notification = notifications.find((item) => item.id === where.id && item.userId === where.userId);
        return notification ? withNotificationDeliveries(notification) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { readAt?: Date }; include?: { deliveries?: boolean } }) => {
        const notification = findNotification(where.id);
        notification.readAt = data.readAt ?? notification.readAt;
        return withNotificationDeliveries(notification);
      },
      updateMany: async ({ where, data }: { where: { userId: string; readAt: null }; data: { readAt: Date } }) => {
        let count = 0;
        for (const notification of notifications) {
          if (notification.userId === where.userId && notification.readAt === null) {
            notification.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      },
      findMany: async () => notifications.map(withNotificationDeliveries),
      count: async ({ where }: { where: { userId: string; readAt?: null } }) =>
        notifications.filter((notification) => notification.userId === where.userId && (where.readAt !== null || notification.readAt === null)).length
    },
    notificationDelivery: {
      findFirst: async ({ where }: { where: { id: string; notificationId: string; channel: NotificationDeliveryChannel } }) => {
        const delivery = deliveries.find(
          (item) => item.id === where.id && item.notificationId === where.notificationId && item.channel === where.channel
        );

        if (!delivery) {
          return null;
        }

        const notification = findNotification(delivery.notificationId);
        const user = users.get(notification.userId);

        return {
          ...delivery,
          notification: {
            ...notification,
            user
          }
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MemoryDelivery> & { attempts?: { increment: number } } }) => {
        const delivery = findDelivery(where.id);
        const attemptUpdate = data.attempts as number | { increment: number } | undefined;
        if (data.status) {
          delivery.status = data.status;
        }
        if (data.sentAt !== undefined) {
          delivery.sentAt = data.sentAt;
        }
        if (data.lastError !== undefined) {
          delivery.lastError = data.lastError;
        }
        if (data.externalMessageId !== undefined) {
          delivery.externalMessageId = data.externalMessageId;
        }
        if (attemptUpdate && typeof attemptUpdate === 'object') {
          delivery.attempts += attemptUpdate.increment;
        } else if (typeof attemptUpdate === 'number') {
          delivery.attempts = attemptUpdate;
        }
        delivery.updatedAt = new Date();
        return delivery;
      }
    },
    notificationPreference: {
      upsert: async ({ where, update, create }: { where: { userId: string }; update: Partial<MemoryPreference>; create: { userId: string } & Partial<MemoryPreference> }) => {
        const existing = preferences.get(where.userId);
        const next: MemoryPreference = {
          adStatusEnabled: update.adStatusEnabled ?? create.adStatusEnabled ?? existing?.adStatusEnabled ?? true,
          applicationsEnabled: update.applicationsEnabled ?? create.applicationsEnabled ?? existing?.applicationsEnabled ?? true,
          savedSearchesEnabled: update.savedSearchesEnabled ?? create.savedSearchesEnabled ?? existing?.savedSearchesEnabled ?? true,
          paymentsEnabled: update.paymentsEnabled ?? create.paymentsEnabled ?? existing?.paymentsEnabled ?? true,
          marketingEnabled: update.marketingEnabled ?? create.marketingEnabled ?? existing?.marketingEnabled ?? false
        };
        preferences.set(where.userId, next);
        return next;
      }
    }
  };

  function withNotificationDeliveries(notification: MemoryNotification) {
    return {
      ...notification,
      deliveries: deliveries.filter((delivery) => delivery.notificationId === notification.id)
    };
  }

  function findNotification(id: string): MemoryNotification {
    const notification = notifications.find((item) => item.id === id);

    if (!notification) {
      throw new Error(`Notification not found: ${id}`);
    }

    return notification;
  }

  function findDelivery(id: string): MemoryDelivery {
    const delivery = deliveries.find((item) => item.id === id);

    if (!delivery) {
      throw new Error(`Delivery not found: ${id}`);
    }

    return delivery;
  }

  return {
    db: db as unknown as ConstructorParameters<typeof NotificationService>[0],
    users,
    notifications,
    deliveries
  };
}

function createMemoryFinanceHarness() {
  const createdAt = new Date('2026-08-02T12:00:00.000Z');
  const owner = {
    id: 'finance-owner',
    displayName: 'Finance Owner',
    firstName: null,
    lastName: null,
    maxUsername: 'finance_owner'
  };
  const foreignOwner = {
    id: 'foreign-user',
    displayName: 'Foreign',
    firstName: null,
    lastName: null,
    maxUsername: null
  };
  const ad = {
    id: 'finance-ad',
    title: 'Finance vacancy',
    type: AdType.VACANCY,
    owner
  };
  const foreignAd = {
    id: 'foreign-ad',
    title: 'Foreign ad',
    type: AdType.VACANCY,
    owner: foreignOwner
  };
  const payments = [
    makeFinancePayment({
      id: 'payment-package-partial',
      ad,
      amountValue: '300.00',
      status: PaymentStatus.REFUNDED,
      purposeCode: 'VACANCY_PACKAGE',
      purposeComponents: ['VACANCY_PACKAGE'],
      packagePublications: 3,
      refundAmount: '50.00'
    }),
    makeFinancePayment({
      id: 'payment-full-refund',
      ad,
      amountValue: '70.00',
      status: PaymentStatus.REFUNDED,
      purposeCode: 'VACANCY_PACKAGE',
      purposeComponents: ['VACANCY_PACKAGE'],
      packagePublications: 1,
      refundAmount: '70.00'
    }),
    makeFinancePayment({
      id: 'payment-contact',
      ad,
      amountValue: '20.00',
      status: PaymentStatus.SUCCEEDED,
      purposeCode: 'RESUME_CONTACT_UNLOCK',
      purposeComponents: ['RESUME_CONTACT_UNLOCK'],
      resumeContactUnlock: {
        id: 'unlock-1',
        buyerUserId: owner.id,
        resumeAdId: 'resume-ad',
        status: PaymentStatus.SUCCEEDED
      }
    }),
    makeFinancePayment({
      id: 'payment-promotion',
      ad,
      amountValue: '80.00',
      status: PaymentStatus.SUCCEEDED,
      purposeCode: 'AD_PROMOTION',
      purposeComponents: ['AD_PROMOTION'],
      promotionPurchase: {
        id: 'promotion-1',
        userId: owner.id,
        productType: PromotionProductType.URGENT_BADGE,
        status: PaymentStatus.SUCCEEDED
      }
    }),
    makeFinancePayment({
      id: 'payment-pending',
      ad,
      amountValue: '40.00',
      status: PaymentStatus.PENDING,
      purposeCode: 'VACANCY_MEDIA_FEE',
      purposeComponents: ['VACANCY_MEDIA_FEE'],
      includesMediaHighlight: true
    }),
    makeFinancePayment({
      id: 'payment-test',
      ad,
      yooKassaPaymentId: 'yk-test-payment',
      amountValue: '1000.00',
      status: PaymentStatus.SUCCEEDED,
      purposeCode: 'VACANCY_PACKAGE',
      purposeComponents: ['VACANCY_PACKAGE'],
      packagePublications: 7,
      test: true
    }),
    makeFinancePayment({
      id: 'payment-foreign',
      ad: foreignAd,
      amountValue: '500.00',
      status: PaymentStatus.SUCCEEDED,
      purposeCode: 'VACANCY_PACKAGE',
      purposeComponents: ['VACANCY_PACKAGE'],
      packagePublications: 1
    })
  ];
  let lastHistoryWhere: unknown = null;
  const filterByWhere = (where?: Record<string, unknown>) => {
    if (!where) {
      return payments;
    }

    if (where.OR) {
      lastHistoryWhere = where;
      return payments.filter(
        (payment) =>
          payment.ad.owner.id === owner.id ||
          payment.resumeContactUnlock?.buyerUserId === owner.id ||
          payment.promotionPurchase?.userId === owner.id
      );
    }

    if (where.createdAt && typeof where.createdAt === 'object') {
      const range = where.createdAt as { gte?: Date; lt?: Date };
      return payments.filter(
        (payment) =>
          (!range.gte || payment.createdAt >= range.gte) &&
          (!range.lt || payment.createdAt < range.lt)
      );
    }

    return payments;
  };
  const db = {
    $transaction: async (input: unknown[]) => Promise.all(input),
    adPayment: {
      findMany: async ({ where, skip = 0, take }: { where?: Record<string, unknown>; skip?: number; take?: number } = {}) => {
        const result = filterByWhere(where);
        return result.slice(skip, take ? skip + take : undefined);
      },
      count: async ({ where }: { where?: Record<string, unknown> } = {}) => filterByWhere(where).length
    }
  };

  return {
    db,
    payments,
    get lastHistoryWhere() {
      return lastHistoryWhere;
    }
  };

  function makeFinancePayment(input: {
    id: string;
    ad: typeof ad | typeof foreignAd;
    amountValue: string;
    status: PaymentStatus;
    purposeCode: string;
    purposeComponents: string[];
    packagePublications?: number;
    includesMediaHighlight?: boolean;
    refundAmount?: string;
    test?: boolean;
    yooKassaPaymentId?: string;
    resumeContactUnlock?: {
      id: string;
      buyerUserId: string;
      resumeAdId: string;
      status: PaymentStatus;
    } | null;
    promotionPurchase?: {
      id: string;
      userId: string;
      productType: PromotionProductType;
      status: PaymentStatus;
    } | null;
  }) {
    return {
      id: input.id,
      adId: input.ad.id,
      ad: input.ad,
      yooKassaPaymentId: input.yooKassaPaymentId ?? `yk-${input.id}-123456`,
      yooKassaRefundId: input.refundAmount ? `refund-${input.id}` : null,
      idempotenceKey: `idem-${input.id}`,
      status: input.status,
      amountValue: input.amountValue,
      currency: 'RUB',
      confirmationUrl: null,
      paidAt: input.status === PaymentStatus.SUCCEEDED || input.status === PaymentStatus.REFUNDED ? createdAt : null,
      canceledAt: null,
      refundedAt: input.refundAmount ? createdAt : null,
      rawPayloadJson: JSON.stringify({
        id: input.yooKassaPaymentId ?? `yk-${input.id}-123456`,
        status: input.status === PaymentStatus.CANCELED ? 'canceled' : 'succeeded',
        test: input.test === true
      }),
      refundPayloadJson: input.refundAmount
        ? JSON.stringify({
            id: `refund-${input.id}`,
            status: 'succeeded',
            amount: {
              value: input.refundAmount,
              currency: 'RUB'
            }
          })
        : null,
      purpose: 'VACANCY_PUBLICATION',
      purposeCode: input.purposeCode,
      purposeComponentsJson: JSON.stringify(input.purposeComponents),
      packagePublications: input.packagePublications ?? 0,
      includesMediaHighlight: input.includesMediaHighlight ?? false,
      appliedAt: null,
      createdAt,
      updatedAt: createdAt,
      resumeContactUnlock: input.resumeContactUnlock ?? null,
      promotionPurchase: input.promotionPurchase ?? null
    };
  }
}

function createMemoryProfilesHarness() {
  const now = new Date('2026-08-02T12:00:00.000Z');
  const profiles = new Map<string, Record<string, unknown>>();
  const assignments: Array<Record<string, unknown> & { badge: UserTrustBadge }> = [];
  const history: Array<Record<string, unknown> & { badge: UserTrustBadge; reason?: string | null }> = [];
  const updatedUserIds: string[] = [];

  const repository = {
    findMe: async (userId: string) => profiles.get(userId),
    updateMe: async (userId: string, data: Record<string, unknown>) => {
      updatedUserIds.push(userId);
      const existing = profiles.get(userId) ?? {
        id: `profile-${userId}`,
        userId,
        createdAt: now
      };
      const next = {
        ...existing,
        ...data,
        updatedAt: now
      };
      profiles.set(userId, next);
      return next;
    },
    listTrustBadges: async (userId: string) => ({
      id: userId,
      trustBadgeAssignments: assignments,
      trustBadgeHistory: history
    }),
    updateTrustBadge: async (
      targetUserId: string,
      moderatorId: string,
      badge: UserTrustBadge,
      enabled: boolean,
      reason?: string | null
    ) => {
      if (enabled && !assignments.some((assignment) => assignment.userId === targetUserId && assignment.badge === badge)) {
        assignments.push({
          userId: targetUserId,
          badge,
          assignedById: moderatorId,
          reason,
          createdAt: now,
          updatedAt: now
        });
      }

      if (!enabled) {
        const index = assignments.findIndex((assignment) => assignment.userId === targetUserId && assignment.badge === badge);
        if (index >= 0) {
          assignments.splice(index, 1);
        }
      }

      history.push({
        id: `history-${history.length + 1}`,
        userId: targetUserId,
        badge,
        action: enabled ? 'assigned' : 'removed',
        moderatorId,
        reason,
        createdAt: now
      });

      return {
        id: targetUserId,
        trustBadgeAssignments: assignments,
        trustBadgeHistory: history
      };
    }
  };

  return {
    repository,
    profiles,
    assignments,
    history,
    updatedUserIds
  };
}

function createPublicProfileFixture() {
  const now = new Date('2026-08-02T12:00:00.000Z');
  const oldMemberDate = new Date('2024-01-01T12:00:00.000Z');
  const owner = {
    id: 'profile-owner',
    maxUserId: '123',
    maxUsername: 'owner',
    firstName: 'Ivan',
    lastName: 'Owner',
    displayName: 'Owner display',
    status: UserStatus.ACTIVE,
    deletedAt: null,
    createdAt: oldMemberDate,
    updatedAt: now,
    locale: null,
    role: UserRole.USER,
    blockedUntil: null,
    startedAt: null,
    lastSeenAt: null,
    profile: {
      id: 'profile-row',
      userId: 'profile-owner',
      profileType: ProfileType.COMPANY,
      companyName: 'Reliable Build',
      city: 'Москва',
      districtText: 'ЦАО',
      about: 'Public about',
      avatarUrl: null,
      phone: '+7 900 000-00-00',
      email: 'owner@example.com',
      website: 'https://example.com',
      maxContact: '@owner',
      specialization: 'Монолит',
      experience: '10 лет',
      companyInfo: 'Company info',
      registrationDetails: 'Internal registration',
      showPhone: false,
      showEmail: true,
      showWebsite: true,
      showMaxContact: false,
      allowResumePublicProfile: false,
      deletedAt: null,
      createdAt: oldMemberDate,
      updatedAt: now
    },
    trustBadgeAssignments: [
      {
        userId: 'profile-owner',
        badge: UserTrustBadge.COMPANY_VERIFIED,
        assignedById: 'admin-user',
        reason: 'Verified',
        createdAt: now,
        updatedAt: now
      }
    ]
  };

  const adBase = {
    ownerId: owner.id,
    status: AdStatus.PUBLISHED,
    description: 'Description',
    city: 'Москва',
    districtText: null,
    categoryText: null,
    locationLat: null,
    locationLon: null,
    priceAmount: null,
    currency: 'RUB',
    metadataJson: null,
    isTest: false,
    moderatedAt: now,
    publishedAt: now,
    hiddenAt: null,
    archivedAt: null,
    expiresAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    owner,
    resumeDetails: null,
    equipmentDetails: null,
    productDetails: null,
    photos: [],
    contacts: [],
    requirements: [],
    responsibilities: [],
    benefits: [],
    moderationLogs: [],
    payments: [],
    boostedAt: null,
    promotionUrgentUntil: null,
    promotionPinnedUntil: null,
    promotionHighlightedUntil: null,
    promotionRecommendedUntil: null
  };

  return {
    user: owner,
    activeAds: [
      {
        ...adBase,
        id: 'vacancy-public',
        type: AdType.VACANCY,
        title: 'Public vacancy',
        vacancyDetails: {
          id: 'vacancy-detail',
          adId: 'vacancy-public',
          companyName: 'Reliable Build',
          position: 'Foreman',
          employmentType: null,
          workFormat: null,
          salaryFrom: null,
          salaryTo: null,
          salaryCurrency: 'RUB',
          salaryPeriod: null,
          isSalaryNegotiable: true,
          schedule: null,
          experience: null,
          education: null,
          paymentFormat: null,
          providesAccommodation: false,
          providesMeals: false,
          projectDuration: null,
          createdAt: now,
          updatedAt: now,
          metroStations: []
        }
      },
      {
        ...adBase,
        id: 'resume-public',
        type: AdType.RESUME,
        title: 'Public resume',
        vacancyDetails: null,
        resumeDetails: {
          id: 'resume-detail',
          adId: 'resume-public',
          desiredPosition: 'Foreman',
          profession: 'Builder',
          specialization: 'Монолит',
          experienceYears: 7,
          experienceText: '7 лет',
          employmentType: null,
          workFormat: null,
          desiredSchedule: null,
          expectedSalary: null,
          salaryCurrency: 'RUB',
          skillsJson: null,
          education: null,
          availability: null,
          travelReady: false,
          siteAccommodationReady: false,
          portfolioUrl: null,
          createdAt: now,
          updatedAt: now
        }
      }
    ],
    adsTotal: 2,
    reviews: [
      {
        id: 'review-public',
        authorId: 'review-author',
        subjectId: owner.id,
        adId: 'vacancy-public',
        rating: 5,
        text: 'Good work',
        status: 'PUBLISHED',
        moderationReason: null,
        publishedAt: now,
        moderatedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        author: {
          id: 'review-author',
          displayName: 'Reviewer',
          firstName: null,
          lastName: null,
          maxUsername: null
        },
        ad: {
          id: 'vacancy-public',
          title: 'Public vacancy',
          type: AdType.VACANCY
        }
      }
    ],
    reviewSummary: {
      _avg: {
        rating: 5
      },
      _count: {
        _all: 1
      }
    }
  };
}

function createMemoryPromotionHarness() {
  const now = new Date('2026-08-01T12:00:00.000Z');
  const ads = [
    {
      id: 'promo-ad',
      ownerId: 'promo-owner',
      type: AdType.VACANCY,
      status: AdStatus.PUBLISHED,
      deletedAt: null as Date | null,
      hiddenAt: null as Date | null,
      archivedAt: null as Date | null,
      promotionUrgentUntil: null as Date | null
    }
  ];
  const products: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const purchases: Array<Record<string, unknown> & { paymentId?: string }> = [];
  const createdPayments: Array<{
    payload: {
      amount: { value: string; currency: string };
      metadata: Record<string, string>;
    };
    idempotenceKey: string;
  }> = [];
  const balance = {
    remaining: 7
  };

  const db = {
    ad: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        ads.find((ad) => ad.id === where.id && ad.ownerId === where.ownerId && (where.deletedAt === undefined || ad.deletedAt === where.deletedAt)) ?? null,
      updateMany: async () => ({ count: 0 })
    },
    promotionProduct: {
      findUnique: async ({ where }: { where: { type: PromotionProductType } }) =>
        products.find((product) => product.type === where.type) ?? null,
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        products.filter((product) => {
          if (where?.enabled !== undefined && product.enabled !== where.enabled) {
            return false;
          }

          if (where?.priceValue && product.priceValue === null) {
            return false;
          }

          return true;
        }),
      upsert: async ({ where, update, create }: { where: { type: PromotionProductType }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        let product = products.find((item) => item.type === where.type);
        if (!product) {
          product = {
            id: `product-${where.type}`,
            createdAt: now,
            updatedAt: now,
            ...create
          };
          products.push(product);
          return product;
        }

        Object.assign(product, update, { updatedAt: now });
        return product;
      }
    },
    promotionPurchase: {
      findFirst: async () => null,
      findMany: async () => purchases,
      create: async ({ data, include }: { data: Record<string, unknown>; include?: { payment?: boolean } }) => {
        const purchase: Record<string, unknown> & { paymentId?: string } = {
          id: `purchase-${purchases.length + 1}`,
          startsAt: null,
          endsAt: null,
          lastBumpedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        purchases.push(purchase);
        return include?.payment ? { ...purchase, payment: payments.find((payment) => payment.id === purchase.paymentId) } : purchase;
      }
    },
    adPayment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const payment = {
          id: `payment-${payments.length + 1}`,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        payments.push(payment);
        return payment;
      }
    },
    $transaction: async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      return (input as (tx: unknown) => unknown)(db);
    }
  };

  const yooKassaClient = {
    createPayment: async (payload: { amount: { value: string; currency: string }; metadata: Record<string, string> }, idempotenceKey: string) => {
      createdPayments.push({ payload, idempotenceKey });
      return {
        id: `yk-${createdPayments.length}`,
        status: 'pending',
        paid: false,
        amount: payload.amount,
        confirmation: {
          confirmation_url: 'https://yookassa.ru/payments/promo-test'
        },
        test: true
      };
    }
  };

  return {
    db,
    yooKassaClient,
    notificationService: {
      notify: async () => null
    },
    ads,
    products,
    payments,
    purchases,
    createdPayments,
    balance
  };
}

function createMemoryPromotionPaymentHarness() {
  const ad = {
    id: 'promo-ad',
    ownerId: 'promo-owner',
    type: AdType.VACANCY,
    status: AdStatus.PUBLISHED,
    title: 'Promo vacancy',
    metadataJson: null,
    deletedAt: null as Date | null,
    hiddenAt: null as Date | null,
    archivedAt: null as Date | null,
    promotionUrgentUntil: null as Date | null
  };
  const payment = {
    id: 'payment-promo',
    adId: ad.id,
    yooKassaPaymentId: 'yk-promo',
    status: PaymentStatus.PENDING,
    amountValue: '150.00',
    currency: 'RUB',
    packagePublications: 0,
    includesMediaHighlight: false,
    purposeCode: 'AD_PROMOTION',
    purposeComponentsJson: JSON.stringify(['AD_PROMOTION']),
    appliedAt: null as Date | null,
    paidAt: null as Date | null,
    rawPayloadJson: null as string | null,
    ad
  };
  const purchase: {
    id: string;
    userId: string;
    adId: string;
    productType: PromotionProductType;
    status: PaymentStatus;
    startsAt: Date | null;
    endsAt: Date | null;
    lastBumpedAt: Date | null;
    product: {
      durationHours: number;
    };
  } = {
    id: 'promotion-purchase',
    userId: 'promo-owner',
    adId: ad.id,
    productType: PromotionProductType.URGENT_BADGE,
    status: PaymentStatus.PENDING,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    lastBumpedAt: null as Date | null,
    product: {
      durationHours: 72
    }
  };
  let purchaseActivations = 0;
  const notifications: unknown[] = [];
  const db = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    adPayment: {
      findUnique: async () => payment,
      updateMany: async ({ where, data }: { where?: { appliedAt?: null }; data: Record<string, unknown> }) => {
        if (where?.appliedAt === null && payment.appliedAt !== null) {
          return { count: 0 };
        }

        Object.assign(payment, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(payment, data);
        return payment;
      }
    },
    resumeContactUnlock: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 })
    },
    promotionPurchase: {
      findFirst: async () => purchase,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (purchase.status !== PaymentStatus.SUCCEEDED && data.status === PaymentStatus.SUCCEEDED) {
          purchaseActivations += 1;
        }
        Object.assign(purchase, data);
        return { count: 1 };
      }
    },
    ad: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(ad, data);
        return ad;
      }
    },
    moderationLog: {
      create: async () => ({})
    }
  };

  return {
    db,
    ad,
    purchase,
    notifications,
    get purchaseActivations() {
      return purchaseActivations;
    },
    notificationService: {
      notify: async (payload: unknown) => {
        notifications.push(payload);
        return null;
      },
      buildPaymentLink: () => ({
        label: 'payment',
        path: '/profile'
      }),
      buildAdLink: () => ({
        label: 'ad',
        path: '/ads/promo-ad'
      }),
      buildProfileLink: () => ({
        label: 'profile',
        path: '/profile'
      }),
      buildMyAdsLink: () => ({
        label: 'my ads',
        path: '/my-ads'
      })
    }
  };
}

function createMemorySavedSearchHarness() {
  type MemorySavedSearch = {
    id: string;
    userId: string;
    name: string;
    adType: AdType;
    query: string;
    canonicalFiltersJson: string;
    notificationFrequency: SavedSearchFrequency;
    enabled: boolean;
    lastMatchedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  type MemoryMatch = {
    savedSearchId: string;
    adId: string;
    notifiedAt: Date | null;
    createdAt: Date;
  };
  type MemoryAd = {
    id: string;
    ownerId: string;
    type: AdType;
    title: string;
    status: AdStatus;
    deletedAt: Date | null;
    hiddenAt: Date | null;
    archivedAt: Date | null;
    isTest: boolean;
    owner: {
      status: UserStatus;
      deletedAt: Date | null;
    };
  };

  const searches: MemorySavedSearch[] = [];
  const matches: MemoryMatch[] = [];
  const notifications: Array<{ userId: string; idempotencyKey: string; payload?: Record<string, unknown> }> = [];
  const ads = new Map<string, MemoryAd>([
    [
      'ad-match',
      {
        id: 'ad-match',
        ownerId: 'ad-owner',
        type: AdType.VACANCY,
        title: 'Electric vacancy',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'equipment-match',
      {
        id: 'equipment-match',
        ownerId: 'equipment-owner',
        type: AdType.EQUIPMENT,
        title: 'Crane',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'resume-match',
      {
        id: 'resume-match',
        ownerId: 'resume-owner',
        type: AdType.RESUME,
        title: 'Welder resume',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'material-match',
      {
        id: 'material-match',
        ownerId: 'material-owner',
        type: AdType.MATERIAL,
        title: 'Cement',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'tool-match',
      {
        id: 'tool-match',
        ownerId: 'tool-owner',
        type: AdType.TOOL,
        title: 'Drill',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'ad-unpublished',
      {
        id: 'ad-unpublished',
        ownerId: 'ad-owner',
        type: AdType.VACANCY,
        title: 'Draft vacancy',
        status: AdStatus.PENDING_MODERATION,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ]
  ]);
  let sequence = 0;

  const db = {
    savedSearch: {
      create: async ({ data }: { data: Omit<MemorySavedSearch, 'id' | 'lastMatchedAt' | 'deletedAt' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const search: MemorySavedSearch = {
          id: `saved-search-${++sequence}`,
          userId: data.userId,
          name: data.name,
          adType: data.adType,
          query: data.query,
          canonicalFiltersJson: data.canonicalFiltersJson,
          notificationFrequency: data.notificationFrequency,
          enabled: data.enabled,
          lastMatchedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now
        };
        searches.push(search);
        return search;
      },
      findMany: async ({ where, include }: { where: Record<string, unknown>; include?: { matches?: { where?: { notifiedAt?: null } } } }) => {
        const result = searches.filter((search) => {
          const notificationFrequencyWhere = where.notificationFrequency;
          const userIdWhere = where.userId;
          const matchesWhere = where.matches;
          if (typeof userIdWhere === 'string' && search.userId !== userIdWhere) {
            return false;
          }
          if (where.adType && search.adType !== where.adType) {
            return false;
          }
          if (where.enabled !== undefined && search.enabled !== where.enabled) {
            return false;
          }
          if (where.deletedAt === null && search.deletedAt !== null) {
            return false;
          }
          if (notificationFrequencyWhere === SavedSearchFrequency.DAILY && search.notificationFrequency !== SavedSearchFrequency.DAILY) {
            return false;
          }
          if (isTestRecord(notificationFrequencyWhere) && notificationFrequencyWhere.not === SavedSearchFrequency.OFF && search.notificationFrequency === SavedSearchFrequency.OFF) {
            return false;
          }
          if (isTestRecord(userIdWhere) && typeof userIdWhere.not === 'string' && search.userId === userIdWhere.not) {
            return false;
          }
          if (isTestRecord(matchesWhere) && isTestRecord(matchesWhere.some) && !matches.some((match) => match.savedSearchId === search.id && match.notifiedAt === null)) {
            return false;
          }
          return true;
        });

        if (include?.matches) {
          return result.map((search) => ({
            ...search,
            matches: matches.filter((match) => match.savedSearchId === search.id && match.notifiedAt === null)
          }));
        }

        return result;
      },
      findFirst: async ({ where }: { where: Partial<MemorySavedSearch> }) =>
        searches.find((search) =>
          Object.entries(where).every(([key, value]) => {
            if (key === 'deletedAt' && value === null) {
              return search.deletedAt === null;
            }
            return search[key as keyof MemorySavedSearch] === value;
          })
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<MemorySavedSearch> }) => {
        const search = findSearch(where.id);
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            (search as Record<string, unknown>)[key] = value;
          }
        }
        search.updatedAt = new Date();
        return search;
      }
    },
    savedSearchMatch: {
      create: async ({ data }: { data: { savedSearchId: string; adId: string } }) => {
        if (matches.some((match) => match.savedSearchId === data.savedSearchId && match.adId === data.adId)) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }
        const match: MemoryMatch = {
          savedSearchId: data.savedSearchId,
          adId: data.adId,
          notifiedAt: null,
          createdAt: new Date()
        };
        matches.push(match);
        return match;
      },
      update: async ({ where, data }: { where: { savedSearchId_adId: { savedSearchId: string; adId: string } }; data: { notifiedAt: Date } }) => {
        const match = findMatch(where.savedSearchId_adId.savedSearchId, where.savedSearchId_adId.adId);
        match.notifiedAt = data.notifiedAt;
        return match;
      },
      updateMany: async ({ where, data }: { where: { savedSearchId: string; notifiedAt: null }; data: { notifiedAt: Date } }) => {
        let count = 0;
        for (const match of matches) {
          if (match.savedSearchId === where.savedSearchId && match.notifiedAt === null) {
            match.notifiedAt = data.notifiedAt;
            count += 1;
          }
        }
        return { count };
      }
    },
    ad: {
      findFirst: async ({ where }: { where: { id: string; status?: { in: AdStatus[] } } }) => {
        const ad = ads.get(where.id);
        if (!ad) {
          return null;
        }
        if (where.status?.in && !where.status.in.includes(ad.status)) {
          return null;
        }
        if (ad.deletedAt || ad.hiddenAt || ad.archivedAt || ad.isTest || ad.owner.status !== UserStatus.ACTIVE || ad.owner.deletedAt) {
          return null;
        }
        return {
          id: ad.id,
          ownerId: ad.ownerId,
          type: ad.type,
          title: ad.title
        };
      }
    }
  };

  const adRepository = {
    matchesPublicQuery: async (adId: string, query: { q?: string }, forcedType?: string) => {
      const ad = ads.get(adId);
      const typeByCode: Record<string, AdType> = {
        vacancy: AdType.VACANCY,
        resume: AdType.RESUME,
        equipment: AdType.EQUIPMENT,
        material: AdType.MATERIAL,
        tool: AdType.TOOL
      };
      if (!ad || (forcedType && typeByCode[forcedType] && ad.type !== typeByCode[forcedType])) {
        return false;
      }
      return ['electric', 'crane', 'welder', 'cement', 'drill'].includes(query.q ?? '');
    },
    listPublic: async () => ({
      items: [],
      total: 0,
      page: 1,
      perPage: 20
    })
  };

  const notificationService = {
    notify: async (input: { userId: string; idempotencyKey: string; payload?: Record<string, unknown> }) => {
      if (!notifications.some((item) => item.idempotencyKey === input.idempotencyKey)) {
        notifications.push(input);
      }
      return null;
    },
    buildAdLink: (adId: string) => ({
      label: 'Открыть объявление',
      path: `/ads/${adId}`
    })
  };

  function findSearch(id: string): MemorySavedSearch {
    const search = searches.find((item) => item.id === id);
    if (!search) {
      throw new Error(`Saved search not found: ${id}`);
    }
    return search;
  }

  function findMatch(savedSearchId: string, adId: string): MemoryMatch {
    const match = matches.find((item) => item.savedSearchId === savedSearchId && item.adId === adId);
    if (!match) {
      throw new Error(`Saved search match not found: ${savedSearchId}/${adId}`);
    }
    return match;
  }

  return {
    db: db as unknown as ConstructorParameters<typeof SavedSearchesService>[0],
    adRepository: adRepository as unknown as ConstructorParameters<typeof SavedSearchesService>[1],
    notificationService: notificationService as unknown as ConstructorParameters<typeof SavedSearchesService>[3],
    searches,
    matches,
    notifications
  };
}

function createMemoryAdAnalyticsHarness() {
  type MemoryAnalyticsAd = {
    id: string;
    ownerId: string;
    type: AdType;
    title: string;
    categoryText: string | null;
    status: AdStatus;
    deletedAt: Date | null;
    hiddenAt: Date | null;
    archivedAt: Date | null;
    isTest: boolean;
    owner: {
      status: UserStatus;
      deletedAt: Date | null;
    };
  };
  type MemoryMetric = {
    adId: string;
    date: Date;
    views: number;
    uniqueViews: number;
    favoriteAdds: number;
    favoriteRemoves: number;
    contactOpens: number;
    phoneClicks: number;
    emailClicks: number;
    maxClicks: number;
    websiteClicks: number;
    applications: number;
    contactUnlocks: number;
    promotionPurchases: number;
    internalEvents: number;
  };

  const ads = new Map<string, MemoryAnalyticsAd>([
    [
      'analytics-ad',
      {
        id: 'analytics-ad',
        ownerId: 'analytics-owner',
        type: AdType.VACANCY,
        title: 'Electrician',
        categoryText: 'Electric',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ],
    [
      'analytics-low-view-ad',
      {
        id: 'analytics-low-view-ad',
        ownerId: 'analytics-owner',
        type: AdType.RESUME,
        title: 'Welder',
        categoryText: 'Welding',
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          status: UserStatus.ACTIVE,
          deletedAt: null
        }
      }
    ]
  ]);
  const metrics = new Map<string, MemoryMetric>();
  const uniqueViews = new Set<string>();

  const metric = (adId: string) => {
    const existing = [...metrics.values()].find((item) => item.adId === adId);

    if (!existing) {
      throw new Error(`Metric not found: ${adId}`);
    }

    return existing;
  };

  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const isPublicAd = (ad: MemoryAnalyticsAd | undefined) =>
    Boolean(
      ad &&
        (ad.status === AdStatus.APPROVED || ad.status === AdStatus.PUBLISHED) &&
        !ad.deletedAt &&
        !ad.hiddenAt &&
        !ad.archivedAt &&
        !ad.isTest &&
        ad.owner.status === UserStatus.ACTIVE &&
        !ad.owner.deletedAt
    );
  const emptyMetric = (adId: string, date: Date): MemoryMetric => ({
    adId,
    date,
    views: 0,
    uniqueViews: 0,
    favoriteAdds: 0,
    favoriteRemoves: 0,
    contactOpens: 0,
    phoneClicks: 0,
    emailClicks: 0,
    maxClicks: 0,
    websiteClicks: 0,
    applications: 0,
    contactUnlocks: 0,
    promotionPurchases: 0,
    internalEvents: 0
  });
  const applyMetric = (target: MemoryMetric, increments: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(increments)) {
      if (key === 'adId' || key === 'date' || value === undefined) {
        continue;
      }

      const amount = typeof value === 'object' && value !== null && 'increment' in value ? Number(value.increment) : Number(value);

      if (!Number.isFinite(amount)) {
        continue;
      }

      (target as unknown as Record<string, number>)[key] += amount;
    }
  };

  const db = {
    user: {
      findFirst: async ({ where }: { where: { id: string; status: UserStatus; deletedAt: null } }) =>
        where.id === 'blocked-user'
          ? null
          : {
              id: where.id
            }
    },
    ad: {
      findFirst: async ({ where }: { where: { id: string; ownerId?: string; deletedAt?: null } }) => {
        const ad = ads.get(where.id);

        if (!isPublicAd(ad)) {
          return null;
        }

        if (where.ownerId && ad?.ownerId !== where.ownerId) {
          return null;
        }

        return {
          id: ad!.id
        };
      }
    },
    adMetricDaily: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { adId_date: { adId: string; date: Date } };
        create: MemoryMetric;
        update: Partial<Record<keyof MemoryMetric, { increment: number }>>;
      }) => {
        const key = `${where.adId_date.adId}:${dayKey(where.adId_date.date)}`;
        const existing = metrics.get(key);

        if (existing) {
          applyMetric(existing, update);
          return existing;
        }

        const next = emptyMetric(create.adId, create.date);
        applyMetric(next, create);
        metrics.set(key, next);
        return next;
      },
      findMany: async ({ where }: { where: { adId?: { in: string[] }; date?: { gte: Date }; ad?: { ownerId: string } } }) => {
        return [...metrics.values()]
          .filter((item) => !where.adId?.in || where.adId.in.includes(item.adId))
          .filter((item) => !where.date?.gte || item.date >= where.date.gte)
          .filter((item) => !where.ad?.ownerId || ads.get(item.adId)?.ownerId === where.ad.ownerId)
          .sort((left, right) => left.date.getTime() - right.date.getTime());
      }
    },
    adMetricUniqueView: {
      create: async ({ data }: { data: { adId: string; date: Date; visitorHash: string } }) => {
        const key = `${data.adId}:${dayKey(data.date)}:${data.visitorHash}`;

        if (uniqueViews.has(key)) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }

        uniqueViews.add(key);
        return data;
      }
    }
  };

  return {
    db,
    ads,
    metrics,
    metric
  };
}

function createMemoryAdReportsHarness() {
  type MemoryReportAd = {
    id: string;
    ownerId: string;
    reportedUserId: string;
    title: string;
    type: AdType;
    status: AdStatus;
    deletedAt: Date | null;
  };
  const users = new Map([
    [
      'reporter-user',
      {
        id: 'reporter-user',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        displayName: 'Reporter',
        maxUsername: 'reporter',
        blockedUntil: null
      }
    ],
    [
      'reported-owner',
      {
        id: 'reported-owner',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        displayName: 'Owner',
        maxUsername: 'owner',
        blockedUntil: null
      }
    ],
    [
      'moderator-user',
      {
        id: 'moderator-user',
        role: UserRole.MODERATOR,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        displayName: 'Moderator',
        maxUsername: 'moderator',
        blockedUntil: null
      }
    ]
  ]);
  const ads = new Map<string, MemoryReportAd>([
    [
      'reported-ad',
      {
        id: 'reported-ad',
        ownerId: 'reported-owner',
        reportedUserId: 'reported-owner',
        title: 'Reported ad',
        type: AdType.VACANCY,
        status: AdStatus.PUBLISHED,
        deletedAt: null as Date | null
      }
    ],
    [
      'rejected-ad',
      {
        id: 'rejected-ad',
        ownerId: 'reported-owner',
        reportedUserId: 'reported-owner',
        title: 'Rejected ad',
        type: AdType.VACANCY,
        status: AdStatus.REJECTED,
        deletedAt: null as Date | null
      }
    ]
  ]);
  const reports: Array<{
    id: string;
    reporterUserId: string;
    adId: string;
    reportedUserId: string;
    reason: string;
    comment: string | null;
    evidenceJson: string | null;
    status: AdReportStatus;
    moderatorId: string | null;
    resolution: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const reportHistory: Array<Record<string, unknown> & { reportId: string; action: string; createdAt: Date }> = [];
  const moderationLogs: Array<Record<string, unknown> & { id: string; adId: string; metadataJson?: string | null; createdAt: Date }> = [];
  const notifications: Array<{ userId: string; type: string; title: string; body: string; payload?: unknown }> = [];
  let sequence = 0;

  const buildReport = (report: (typeof reports)[number]) => {
    const ad = ads.get(report.adId)!;
    const reportedUser = users.get(report.reportedUserId)!;

    return {
      ...report,
      ad: {
        id: ad.id,
        ownerId: ad.ownerId,
        title: ad.title,
        type: ad.type,
        status: ad.status,
        moderationLogs,
        _count: {
          reports: reports.filter((item) => item.adId === ad.id).length
        }
      },
      reportedUser: {
        id: reportedUser.id,
        displayName: reportedUser.displayName,
        maxUsername: reportedUser.maxUsername,
        status: reportedUser.status,
        blockedUntil: reportedUser.blockedUntil,
        ads: [...ads.values()].filter((item) => item.ownerId === reportedUser.id && item.status === AdStatus.REJECTED)
      },
      history: reportHistory.filter((item) => item.reportId === report.id)
    };
  };

  const db = {
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return (arg as (tx: unknown) => unknown)(db);
    },
    user: {
      findFirst: async ({ where }: { where: { id: string; status?: UserStatus; deletedAt?: null } }) => {
        const user = users.get(where.id);
        if (!user || (where.status && user.status !== where.status) || (where.deletedAt === null && user.deletedAt)) {
          return null;
        }
        return { id: user.id };
      },
      findMany: async ({ where }: { where: { role?: { in: UserRole[] }; status?: UserStatus; deletedAt?: null } }) =>
        [...users.values()]
          .filter((user) =>
            (!where.role?.in || where.role.in.includes(user.role)) &&
            (!where.status || user.status === where.status) &&
            (where.deletedAt !== null || !user.deletedAt)
          )
          .map((user) => ({
            id: user.id,
            role: user.role
          })),
      findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        const user = users.get(where.id);
        if (!user) {
          return null;
        }
        if (select?.status && select?.role) {
          return { id: user.id, status: user.status, role: UserRole.USER };
        }
        return user;
      },
      update: async ({ where, data, select }: { where: { id: string }; data: { status?: UserStatus; blockedUntil?: Date | null }; select?: Record<string, unknown> }) => {
        const user = users.get(where.id)!;
        Object.assign(user, data);
        return select?.status ? { status: user.status } : user;
      }
    },
    ad: {
      findFirst: async ({ where, select }: { where: { id: string; deletedAt?: null; status?: { not?: AdStatus } }; select?: Record<string, unknown> }) => {
        const ad = ads.get(where.id);
        if (!ad || (where.deletedAt === null && ad.deletedAt) || (where.status?.not && ad.status === where.status.not)) {
          return null;
        }
        if (select) {
          return {
            id: ad.id,
            ownerId: ad.ownerId,
            title: ad.title
          };
        }
        return ad;
      },
      updateMany: async ({ where, data }: { where: { ownerId?: string; id?: string }; data: { status?: AdStatus; hiddenAt?: Date } }) => {
        let count = 0;
        for (const ad of ads.values()) {
          if ((where.ownerId && ad.ownerId !== where.ownerId) || (where.id && ad.id !== where.id)) {
            continue;
          }
          Object.assign(ad, data);
          count += 1;
        }
        return { count };
      }
    },
    adReport: {
      findFirst: async ({ where }: { where: { reporterUserId: string; adId: string; status?: { in: AdReportStatus[] } } }) =>
        reports.find((report) =>
          report.reporterUserId === where.reporterUserId &&
          report.adId === where.adId &&
          (!where.status?.in || where.status.in.includes(report.status))
        ) ?? null,
      create: async ({ data }: { data: Omit<(typeof reports)[number], 'id' | 'createdAt' | 'updatedAt' | 'moderatorId' | 'resolution' | 'resolvedAt'> }) => {
        const now = new Date();
        const report = {
          id: `report-${++sequence}`,
          ...data,
          moderatorId: null,
          resolution: null,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now
        };
        reports.push(report);
        return report;
      },
      findMany: async ({ where }: { where: { status?: AdReportStatus } }) =>
        reports.filter((report) => !where.status || report.status === where.status).map(buildReport),
      count: async ({ where }: { where: { status?: AdReportStatus } }) =>
        reports.filter((report) => !where.status || report.status === where.status).length,
      findUnique: async ({ where }: { where: { id: string } }) => {
        const report = reports.find((item) => item.id === where.id);
        return report ? buildReport(report) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<(typeof reports)[number]> }) => {
        const report = reports.find((item) => item.id === where.id)!;
        Object.assign(report, data, { updatedAt: new Date() });
        return buildReport(report);
      }
    },
    adReportStatusHistory: {
      create: async ({ data }: { data: Record<string, unknown> & { reportId: string; action: string } }) => {
        const item = { ...data, id: `history-${reportHistory.length + 1}`, createdAt: new Date() };
        reportHistory.push(item);
        return item;
      }
    },
    moderationLog: {
      create: async ({ data }: { data: Record<string, unknown> & { adId: string; metadataJson?: string | null } }) => {
        const item = { ...data, id: `moderation-log-${moderationLogs.length + 1}`, createdAt: new Date() };
        moderationLogs.push(item);
        return item;
      }
    }
  };

  return {
    db,
    users,
    ads,
    reports,
    reportHistory,
    moderationLogs,
    notifications,
    moderationService: {
      hideAd: async (adId: string) => {
        ads.get(adId)!.status = AdStatus.HIDDEN;
      },
      submitForModeration: async (adId: string) => {
        ads.get(adId)!.status = AdStatus.PENDING_MODERATION;
      },
      deleteAd: async (adId: string) => {
        ads.get(adId)!.status = AdStatus.DELETED;
      }
    },
    channelPublishingService: {
      removeAdPublications: async () => ({ attempted: 0, removed: 0, failed: 0, skipped: 0 })
    },
    notificationService: {
      notify: async (input: { userId: string; type: string; title: string; body: string; payload?: unknown }) => {
        notifications.push(input);
        return null;
      },
      buildMyAdsLink: () => ({
        label: 'my ads',
        path: '/my-ads'
      }),
      buildModerationLink: (adId?: string | null) => ({
        label: 'moderation',
        path: adId ? `/moderation?adId=${adId}` : '/moderation'
      })
    }
  };
}

process.stdout.write('business-rules: PASS\n');
