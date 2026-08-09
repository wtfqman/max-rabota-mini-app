import { z } from 'zod';
import { VACANCY_PUBLICATION_FUNDING_MODES, VACANCY_PUBLICATION_PLAN_CODES, adListQuerySchema } from '@rabst24/shared';

export const vacancyListQuerySchema = adListQuerySchema.omit({
  type: true,
  schedule: true,
  experience: true,
  employmentType: true,
  workFormat: true,
  availability: true,
  dealType: true,
  brand: true,
  condition: true
});

export const createVacancySchema = z.object({
  title: z.string().trim().min(5).max(180),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  districtText: z.string().trim().max(120).optional(),
  categoryText: z.string().trim().max(120).optional(),
  salaryText: z.string().trim().max(180).optional(),
  isSalaryNegotiable: z.boolean().optional(),
  publicationPlan: z.enum(VACANCY_PUBLICATION_PLAN_CODES).default('single'),
  publicationFunding: z.enum(VACANCY_PUBLICATION_FUNDING_MODES).default('auto'),
  mediaHighlight: z.boolean().optional(),
  description: z.string().trim().min(3, 'Добавьте короткое описание').max(4000),
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
    .max(9)
    .default([])
});

export type CreateVacancyDto = z.infer<typeof createVacancySchema>;
