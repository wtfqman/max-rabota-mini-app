import { z } from 'zod';

export const OUTBOX_JOB_TYPES = [
  'NOOP',
  'MAX_NOTIFICATION',
  'MAX_CHANNEL_PUBLICATION',
  'TELEGRAM_PUBLICATION',
  'SAVED_SEARCH_SCAN',
  'PROMOTION_BUMP'
] as const;

export type OutboxJobType = (typeof OUTBOX_JOB_TYPES)[number];

const basePayloadSchema = z.record(z.string(), z.unknown());

const payloadSchemas: Record<OutboxJobType, z.ZodType<Record<string, unknown>>> = {
  NOOP: basePayloadSchema,
  MAX_NOTIFICATION: z.union([
    z.object({
      notificationId: z.string().min(1),
      deliveryId: z.string().min(1)
    }),
    z.object({
      userId: z.string().min(1),
      message: z.string().min(1),
      dedupeKey: z.string().min(1).optional()
    })
  ]),
  MAX_CHANNEL_PUBLICATION: z.object({
    adId: z.string().min(1),
    channelId: z.union([z.string().min(1), z.number(), z.bigint()]).optional()
  }),
  TELEGRAM_PUBLICATION: z.object({
    adId: z.string().min(1),
    targetId: z.string().min(1),
    source: z.enum(['max', 'telegram', 'rabst24']).optional(),
    publicationVersion: z.number().int().positive().optional(),
    correlationId: z.string().min(1).optional()
  }),
  SAVED_SEARCH_SCAN: z.object({
    adId: z.string().min(1).optional(),
    savedSearchId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    dailyDigestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }),
  PROMOTION_BUMP: z.object({
    promotionId: z.string().min(1).optional(),
    adId: z.string().min(1).optional(),
    maintenanceHour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/).optional()
  })
};

export function isOutboxJobType(value: unknown): value is OutboxJobType {
  return typeof value === 'string' && OUTBOX_JOB_TYPES.includes(value as OutboxJobType);
}

export function validateOutboxPayload(type: string, payload: unknown): Record<string, unknown> {
  if (!isOutboxJobType(type)) {
    throw new Error(`Unsupported outbox job type: ${type}`);
  }

  return payloadSchemas[type].parse(payload);
}
