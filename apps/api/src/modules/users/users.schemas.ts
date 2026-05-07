import { z } from 'zod';

export const updateCurrentUserSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional()
});
