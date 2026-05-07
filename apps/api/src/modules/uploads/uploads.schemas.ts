import { z } from 'zod';

export const createUploadIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive().max(20 * 1024 * 1024)
});

export const uploadPhotoSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataUrl: z.string().min(1),
  altText: z.string().trim().max(255).optional()
});

export type UploadPhotoDto = z.infer<typeof uploadPhotoSchema>;
