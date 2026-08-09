import { z } from 'zod';
import { adListQuerySchema } from '@rabst24/shared';

export const resumeListQuerySchema = adListQuerySchema.omit({
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

const optionalExpectedSalarySchema = z.preprocess((value) => {
  if (value === '' || value === null) {
    return undefined;
  }

  return value;
}, z.coerce.number().nonnegative().optional());

export const createResumeSchema = z.object({
  name: z.string().trim().min(2).max(180),
  profession: z.string().trim().min(2).max(180),
  description: z.string().trim().min(3, 'Добавьте короткое описание').max(4000),
  expectedSalary: optionalExpectedSalarySchema,
  districtText: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  categoryText: z.string().trim().max(120).optional(),
  contacts: z
    .array(
      z.object({
        type: z.enum(['MAX', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER']),
        label: z.string().trim().max(80).optional(),
        value: z.string().trim().min(1).max(255),
        isPreferred: z.boolean().optional()
      })
    )
    .max(8)
    .default([]),
  verifiedContactId: z.string().trim().min(1).optional(),
  contactConsentId: z.string().trim().min(1).optional(),
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

export type CreateResumeDto = z.infer<typeof createResumeSchema>;
