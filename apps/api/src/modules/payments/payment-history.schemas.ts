import { z } from 'zod';

export const paymentHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional()
});

export const adminFinanceQuerySchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
