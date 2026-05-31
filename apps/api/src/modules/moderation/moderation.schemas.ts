export { rejectAdSchema } from '@rabst24/shared';
import { z } from 'zod';
import { adListQuerySchema } from '@rabst24/shared';

export { adIdParamSchema as moderationAdParamSchema } from '../../shared/http/params.schemas.js';

export const moderationQueueQuerySchema = adListQuerySchema.pick({
  type: true,
  q: true,
  page: true,
  perPage: true
}).extend({
  status: z
    .enum(['pending_moderation', 'approved', 'rejected', 'published', 'hidden', 'archived', 'deleted', 'test'])
    .default('pending_moderation')
});

export const hideAdSchema = z.object({
  reason: z.string().trim().min(3).max(1000).optional()
});

export type ModerationQueueQuery = z.infer<typeof moderationQueueQuerySchema>;
