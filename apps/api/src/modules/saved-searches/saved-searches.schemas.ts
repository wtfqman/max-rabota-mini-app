import { z } from 'zod';
import { adListQuerySchema, adTypeSchema } from '@rabst24/shared';

export const savedSearchFrequencySchema = z.enum(['IMMEDIATE', 'DAILY', 'OFF']);

export const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  adType: adTypeSchema,
  query: adListQuerySchema.partial().default({}),
  notificationFrequency: savedSearchFrequencySchema.default('IMMEDIATE'),
  enabled: z.boolean().default(true)
});

export const updateSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  query: adListQuerySchema.partial().optional(),
  notificationFrequency: savedSearchFrequencySchema.optional(),
  enabled: z.boolean().optional()
});

export const savedSearchIdParamSchema = z.object({
  savedSearchId: z.string().min(1)
});

export const savedSearchListQuerySchema = z.object({
  adType: adTypeSchema.optional()
});

export const savedSearchResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export type CreateSavedSearchDto = z.infer<typeof createSavedSearchSchema>;
export type UpdateSavedSearchDto = z.infer<typeof updateSavedSearchSchema>;
export type SavedSearchListQuery = z.infer<typeof savedSearchListQuerySchema>;
export type SavedSearchResultsQuery = z.infer<typeof savedSearchResultsQuerySchema>;
