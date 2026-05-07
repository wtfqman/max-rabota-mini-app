import { z } from 'zod';
import { adListQuerySchema } from '@rabst24/shared';

export const equipmentListQuerySchema = adListQuerySchema.omit({
  type: true,
  schedule: true,
  experience: true
});

export const createEquipmentSchema = z.object({
  title: z.string().trim().min(3).max(180),
  categoryText: z.string().trim().min(2).max(120),
  equipmentGroupText: z.string().trim().max(120).optional(),
  description: z.string().trim().min(20).max(4000),
  districtText: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
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

export type CreateEquipmentDto = z.infer<typeof createEquipmentSchema>;
