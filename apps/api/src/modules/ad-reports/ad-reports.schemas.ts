import { z } from 'zod';

export const adReportReasons = [
  'FRAUD',
  'FALSE_INFORMATION',
  'NOT_ACTUAL',
  'WRONG_PRICE',
  'SPAM',
  'PROHIBITED_CONTENT',
  'OTHER'
] as const;

export const adReportStatuses = [
  'OPEN',
  'IN_REVIEW',
  'RESOLVED_ACTION_TAKEN',
  'RESOLVED_NO_VIOLATION',
  'CANCELLED'
] as const;

export const adReportActions = [
  'no_violation',
  'hide_ad',
  'send_to_moderation',
  'delete_ad',
  'warn_user',
  'temp_block_user',
  'block_user'
] as const;

export const createAdReportSchema = z.object({
  adId: z.string().trim().min(1),
  reason: z.enum(adReportReasons),
  comment: z.string().trim().max(2000).optional(),
  evidence: z.record(z.string(), z.unknown()).optional()
});

export const adReportIdParamSchema = z.object({
  reportId: z.string().trim().min(1)
});

export const adReportModerationQuerySchema = z.object({
  status: z.enum(adReportStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30)
});

export const resolveAdReportSchema = z.object({
  action: z.enum(adReportActions),
  resolution: z.string().trim().min(3).max(2000),
  tempBlockDays: z.coerce.number().int().min(1).max(30).optional()
});

export type CreateAdReportDto = z.infer<typeof createAdReportSchema>;
export type AdReportModerationQuery = z.infer<typeof adReportModerationQuerySchema>;
export type ResolveAdReportDto = z.infer<typeof resolveAdReportSchema>;
export type AdReportActionDto = z.infer<typeof resolveAdReportSchema>['action'];
