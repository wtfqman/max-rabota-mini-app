import { z } from 'zod';
import { paginationQuerySchema } from '@rabst24/shared';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';

const appIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i);

export const publishAdParamSchema = adIdParamSchema;

export const publishAdSchema = z.object({
  channelId: z.union([z.string().min(1), z.number(), z.bigint()]).optional()
});

export const publishLogsQuerySchema = paginationQuerySchema.extend({
  adId: appIdSchema.optional(),
  status: z.enum(['pending', 'published', 'failed', 'skipped', 'removed', 'remove_failed']).optional()
});

export type PublishAdDto = z.infer<typeof publishAdSchema>;
export type PublishLogsQuery = z.infer<typeof publishLogsQuerySchema>;
