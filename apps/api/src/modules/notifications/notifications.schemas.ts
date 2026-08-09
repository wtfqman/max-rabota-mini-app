import { z } from 'zod';

export const notificationListQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: z.string().min(1).optional()
});

export const notificationIdParamSchema = z.object({
  notificationId: z.string().min(1)
});

export const notificationPreferencesSchema = z.object({
  adStatusEnabled: z.boolean().optional(),
  applicationsEnabled: z.boolean().optional(),
  savedSearchesEnabled: z.boolean().optional(),
  paymentsEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional()
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationPreferencesPayload = z.infer<typeof notificationPreferencesSchema>;
