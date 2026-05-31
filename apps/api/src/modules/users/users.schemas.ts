import { z } from 'zod';

export const updateCurrentUserSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional()
});

export const teamUserQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  role: z.enum(['user', 'moderator', 'admin']).optional()
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'moderator', 'admin'])
});
