import { z } from 'zod';
import { AD_TYPES } from '@rabst24/shared';

export const promotionProductTypes = [
  'BUMP_ONCE',
  'URGENT_BADGE',
  'PIN_CATEGORY',
  'HIGHLIGHT_CARD',
  'RECOMMENDED',
  'AUTO_BUMP'
] as const;

export const promotionProductTypeSchema = z.enum(promotionProductTypes);

export const promotionProductTypeParamSchema = z.object({
  type: promotionProductTypeSchema
});

export const promotionAdIdParamSchema = z.object({
  adId: z.string().trim().min(1)
});

const priceSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{2})?$/)
  .transform((value) => Number(value).toFixed(2));

export const updatePromotionProductSchema = z.object({
  enabled: z.boolean().optional(),
  price: priceSchema.nullable().optional(),
  durationHours: z.coerce.number().int().positive().max(24 * 365).nullable().optional(),
  applicableAdTypes: z.array(z.enum(AD_TYPES)).max(5).optional(),
  configuration: z.record(z.string(), z.unknown()).nullable().optional(),
  channelBehavior: z
    .object({
      showBadgesInMax: z.boolean().optional(),
      showBadgesInTelegram: z.boolean().optional(),
      autoBumpChannels: z.enum(['NONE', 'MAX_ONLY', 'TELEGRAM_ONLY', 'ALL']).default('NONE')
    })
    .nullable()
    .optional()
});

export const createPromotionPurchaseSchema = z.object({
  productType: promotionProductTypeSchema
});

export type PromotionProductTypeDto = z.infer<typeof promotionProductTypeSchema>;
export type UpdatePromotionProductDto = z.infer<typeof updatePromotionProductSchema>;
export type CreatePromotionPurchaseDto = z.infer<typeof createPromotionPurchaseSchema>;
