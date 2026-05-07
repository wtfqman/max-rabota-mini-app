import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().uuid()
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid()
});

export const adIdParamSchema = z.object({
  adId: z.string().uuid()
});
