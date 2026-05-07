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
    .enum(['draft', 'pending_moderation', 'approved', 'rejected', 'published', 'hidden', 'archived'])
    .optional()
});

export const updateOwnedAdSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  districtText: z.string().trim().max(120).nullable().optional(),
  categoryText: z.string().trim().max(120).nullable().optional()
});

export type OwnedAdsQuery = z.infer<typeof ownedAdsQuerySchema>;
export type UpdateOwnedAdDto = z.infer<typeof updateOwnedAdSchema>;
