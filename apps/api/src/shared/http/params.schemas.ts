import { z } from 'zod';

const appIdSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i);

export const idParamSchema = z.object({
  id: appIdSchema
});

export const userIdParamSchema = z.object({
  userId: appIdSchema
});

export const adIdParamSchema = z.object({
  adId: appIdSchema
});
