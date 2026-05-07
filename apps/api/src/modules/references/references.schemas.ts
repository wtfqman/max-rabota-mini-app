import { z } from 'zod';

export const referenceSuggestQuerySchema = z.object({
  q: z.string().trim().max(80).optional()
});

export type ReferenceSuggestQuery = z.infer<typeof referenceSuggestQuerySchema>;
