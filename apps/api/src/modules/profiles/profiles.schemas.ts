import { z } from 'zod';

export const updateProfileSchema = z.object({
  city: z.string().trim().max(120).optional(),
  districtText: z.string().trim().max(120).optional(),
  about: z.string().trim().max(2000).optional(),
  avatarUrl: z.url().optional()
});
