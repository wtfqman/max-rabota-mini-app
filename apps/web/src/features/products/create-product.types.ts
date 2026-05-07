import { z } from 'zod';

export type ProductType = 'material' | 'tool';

const adPhotoInputSchema = z.object({
  storageKey: z.string().trim().min(1).max(512),
  url: z.string().trim().min(1).max(4000),
  previewUrl: z.string().trim().max(4000).optional(),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  altText: z.string().trim().max(255).optional()
});

const adContactInputSchema = z.object({
  type: z.enum(['MAX', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER']),
  value: z.string().trim().min(1).max(255),
  label: z.string().trim().max(80).optional(),
  isPreferred: z.boolean().optional()
});

export const createProductPayloadSchema = z.object({
  title: z.string().trim().min(3, 'Укажите название').max(180),
  categoryText: z.string().trim().max(120).optional(),
  description: z.string().trim().min(10, 'Добавьте короткое описание').max(4000),
  priceAmount: z.coerce.number().nonnegative().optional(),
  districtText: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  contacts: z.array(adContactInputSchema).min(1, 'Добавьте контакт').max(8),
  photos: z.array(adPhotoInputSchema).max(8).default([])
});

export type CreateProductPayload = z.infer<typeof createProductPayloadSchema>;

export interface CreateProductResponse {
  id: string;
  type: ProductType;
  status: string;
  title: string;
  createdAt: string;
}
