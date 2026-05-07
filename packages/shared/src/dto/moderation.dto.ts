import { z } from 'zod';

export const rejectAdSchema = z.object({
  reason: z.string().trim().min(3).max(1000)
});

export type RejectAdDto = z.infer<typeof rejectAdSchema>;
