import { z } from 'zod';
import { adListQuerySchema, createAdSchema } from '@rabst24/shared';

export { adListQuerySchema, createAdSchema };

export const ownedAdsQuerySchema = adListQuerySchema.pick({
  type: true,
  q: true,
  page: true,
  perPage: true
}).extend({
  status: z
    .enum(['draft', 'pending_moderation', 'approved', 'rejected', 'published', 'hidden', 'archived', 'deleted'])
    .optional()
});

export const updateOwnedAdSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  districtText: z.string().trim().max(120).nullable().optional(),
  categoryText: z.string().trim().max(120).nullable().optional(),
  desiredPosition: z.string().trim().min(2).max(180).nullable().optional()
});

export const publicationSettingsSchema = z.object({
  autoRepeat: z.boolean(),
  repeatPeriod: z.enum(['daily', 'three_days', 'weekly']).default('three_days'),
  activePeriod: z.enum(['three_days', 'seven_days', 'fourteen_days', 'manual']).default('seven_days'),
  remindBeforeEnd: z.boolean().default(true)
});

export type OwnedAdsQuery = z.infer<typeof ownedAdsQuerySchema>;
export type UpdateOwnedAdDto = z.infer<typeof updateOwnedAdSchema>;
export type PublicationSettingsDto = z.infer<typeof publicationSettingsSchema>;
