import { z } from 'zod';

export const createReviewSchema = z.object({
  subjectId: z.string().uuid().optional(),
  adId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  text: z.string().trim().max(2000).optional()
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;
