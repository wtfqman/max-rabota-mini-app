import { z } from 'zod';

export const telegramTargetIdParamSchema = z.object({
  targetId: z.string().min(1)
});

export const telegramTestPublishSchema = z.object({
  kind: z.enum(['text', 'photo', 'video', 'album']).default('text')
});

export const telegramLinkConsumeSchema = z.object({
  code: z.string().trim().min(8).max(128)
});

