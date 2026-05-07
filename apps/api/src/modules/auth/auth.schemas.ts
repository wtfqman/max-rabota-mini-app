import { z } from 'zod';

export const verifyMaxLaunchSchema = z.object({
  initData: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web', 'desktop']).optional()
});

export type VerifyMaxLaunchBody = z.infer<typeof verifyMaxLaunchSchema>;

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1)
});
