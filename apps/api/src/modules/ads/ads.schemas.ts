import { z } from 'zod';
import {
  VACANCY_PUBLICATION_FUNDING_MODES,
  VACANCY_PUBLICATION_PLAN_CODES,
  adListQuerySchema,
  adPhotoInputSchema,
  createAdSchema
} from '@rabst24/shared';

export { adListQuerySchema, createAdSchema };

export const ownedAdsQuerySchema = adListQuerySchema.pick({
  type: true,
  q: true,
  page: true,
  perPage: true
}).extend({
  status: z
    .enum(['draft', 'payment_pending', 'pending_moderation', 'approved', 'rejected', 'published', 'hidden', 'archived', 'deleted'])
    .optional()
});

export const updateOwnedAdSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  districtText: z.string().trim().max(120).nullable().optional(),
  categoryText: z.string().trim().max(120).nullable().optional(),
  priceAmount: z.coerce.number().nonnegative().nullable().optional(),
  metadata: createAdSchema.shape.metadata.optional(),
  desiredPosition: z.string().trim().min(2).max(180).nullable().optional()
});

export const saveAdRevisionSchema = updateOwnedAdSchema.extend({
  photos: z.array(adPhotoInputSchema).max(9).optional(),
  contacts: createAdSchema.shape.contacts.optional(),
  requirements: createAdSchema.shape.requirements.optional(),
  responsibilities: createAdSchema.shape.responsibilities.optional(),
  benefits: createAdSchema.shape.benefits.optional(),
  vacancy: createAdSchema.shape.vacancy.optional(),
  resume: createAdSchema.shape.resume.optional(),
  equipment: createAdSchema.shape.equipment.optional(),
  product: createAdSchema.shape.product.optional()
});

export const publicationSettingsSchema = z.object({
  autoRepeat: z.boolean(),
  repeatPeriod: z.enum(['daily', 'three_days', 'weekly']).default('three_days'),
  activePeriod: z.enum(['three_days', 'seven_days', 'fourteen_days', 'manual']).default('seven_days'),
  remindBeforeEnd: z.boolean().default(true)
});

export const resubmitAdSchema = z.object({
  publicationPlan: z.enum(VACANCY_PUBLICATION_PLAN_CODES).default('single').optional(),
  publicationFunding: z.enum(VACANCY_PUBLICATION_FUNDING_MODES).default('auto').optional()
});

export type OwnedAdsQuery = z.infer<typeof ownedAdsQuerySchema>;
export type UpdateOwnedAdDto = z.infer<typeof updateOwnedAdSchema>;
export type SaveAdRevisionDto = z.infer<typeof saveAdRevisionSchema>;
export type PublicationSettingsDto = z.infer<typeof publicationSettingsSchema>;
export type ResubmitAdDto = z.infer<typeof resubmitAdSchema>;
