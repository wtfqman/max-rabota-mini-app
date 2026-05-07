import { z } from 'zod';
import { paginationQuerySchema } from '@rabst24/shared';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';

export const publishAdParamSchema = adIdParamSchema;

export const publishAdSchema = z.object({
  channelId: z.union([z.string().min(1), z.number(), z.bigint()]).optional()
});

export const publishLogsQuerySchema = paginationQuerySchema.extend({
  adId: z.string().uuid().optional(),
  status: z.enum(['pending', 'published', 'failed', 'skipped']).optional()
});

export type PublishAdDto = z.infer<typeof publishAdSchema>;
export type PublishLogsQuery = z.infer<typeof publishLogsQuerySchema>;
