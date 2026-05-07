import { z } from 'zod';
import { adListQuerySchema } from '@rabst24/shared';

export const vacancyListQuerySchema = adListQuerySchema.omit({ type: true });

export const createVacancySchema = z.object({
  title: z.string().trim().min(5).max(180),
  companyName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().max(240).optional(),
  districtText: z.string().trim().max(120).optional(),
  categoryText: z.string().trim().min(2).max(120),
  schedule: z.string().trim().min(2).max(160),
  workPeriods: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  workPeriodDescription: z.string().trim().max(500).optional(),
  experience: z.string().trim().min(2).max(160),
  salaryText: z.string().trim().max(180).optional(),
  salaryFrom: z.coerce.number().nonnegative().optional(),
  salaryTo: z.coerce.number().nonnegative().optional(),
  salaryPeriod: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT']).optional(),
  isSalaryNegotiable: z.boolean().optional(),
  description: z.string().trim().min(20).max(4000),
  requirements: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  benefits: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  metroStations: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        lineName: z.string().trim().max(160).optional(),
        walkingMinutes: z.coerce.number().int().positive().max(120).optional()
      })
    )
    .max(8)
    .default([]),
  contacts: z
    .array(
      z.object({
        type: z.enum(['MAX', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER']),
        label: z.string().trim().max(80).optional(),
        value: z.string().trim().min(1).max(255),
        isPreferred: z.boolean().optional()
      })
    )
    .min(1)
    .max(8),
  photos: z
    .array(
      z.object({
        storageKey: z.string().trim().min(1).max(512),
        url: z.string().trim().min(1).max(4000),
        previewUrl: z.string().trim().max(4000).optional(),
        mimeType: z.string().trim().max(120).optional(),
        sizeBytes: z.coerce.number().int().positive().optional(),
        width: z.coerce.number().int().positive().optional(),
        height: z.coerce.number().int().positive().optional(),
        altText: z.string().trim().max(255).optional()
      })
    )
    .max(8)
    .default([])
});

export type CreateVacancyDto = z.infer<typeof createVacancySchema>;
