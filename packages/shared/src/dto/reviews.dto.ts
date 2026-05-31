import { z } from 'zod';

const appIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i);

export const createReviewSchema = z.object({
  adId: appIdSchema,
  rating: z.coerce.number().int().min(1).max(5).default(5),
  text: z.string().trim().max(2000).optional()
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
