import { z } from 'zod';
import { AD_TYPES } from '../domain/ad.js';

export const adTypeSchema = z.enum(AD_TYPES);
const nullableTextSchema = z.string().trim().max(4000).optional();

export const adPhotoInputSchema = z.object({
  storageKey: z.string().trim().min(1).max(512),
  url: z.string().trim().min(1).max(4000),
  previewUrl: z.string().trim().max(4000).optional(),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  altText: z.string().trim().max(255).optional()
});

export const adContactInputSchema = z.object({
  type: z.enum(['MAX', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER']),
  value: z.string().trim().min(1).max(255),
  label: z.string().trim().max(80).optional(),
  isPreferred: z.boolean().optional()
});

export const createAdSchema = z.object({
  type: adTypeSchema,
  title: z.string().trim().min(5).max(180),
  description: nullableTextSchema,
  city: z.string().trim().max(120).optional(),
  districtText: z.string().trim().max(120).optional(),
  categoryText: z.string().trim().max(120).optional(),
  priceAmount: z.coerce.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  photos: z.array(adPhotoInputSchema).max(8).default([]),
  contacts: z
    .array(adContactInputSchema)
    .max(8)
    .default([]),
  requirements: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  benefits: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  vacancy: z
    .object({
      companyName: z.string().trim().max(160).optional(),
      position: z.string().trim().max(160).optional(),
      employmentType: z
        .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'SHIFT', 'INTERNSHIP', 'TEMPORARY'])
        .optional(),
      workFormat: z.enum(['ONSITE', 'REMOTE', 'HYBRID', 'FIELD']).optional(),
      salaryFrom: z.coerce.number().nonnegative().optional(),
      salaryTo: z.coerce.number().nonnegative().optional(),
      salaryCurrency: z.string().trim().length(3).optional(),
      salaryPeriod: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT']).optional(),
      isSalaryNegotiable: z.boolean().optional(),
      schedule: z.string().trim().max(160).optional(),
      experience: z.string().trim().max(160).optional(),
      education: z.string().trim().max(180).optional()
    })
    .optional(),
  resume: z
    .object({
      desiredPosition: z.string().trim().max(160).optional(),
      experienceYears: z.coerce.number().int().min(0).max(80).optional(),
      skills: z.array(z.string().trim().max(80)).default([])
    })
    .optional(),
  equipment: z
    .object({
      categoryText: z.string().trim().max(120).optional(),
      brand: z.string().trim().max(120).optional(),
      model: z.string().trim().max(120).optional(),
      productionYear: z.coerce.number().int().min(1900).max(2100).optional()
    })
    .optional()
});

export const adListQuerySchema = z.object({
  type: adTypeSchema.optional(),
  q: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  schedule: z.string().trim().max(120).optional(),
  experience: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20)
});

export type CreateAdDto = z.infer<typeof createAdSchema>;
export type AdListQueryDto = z.infer<typeof adListQuerySchema>;
