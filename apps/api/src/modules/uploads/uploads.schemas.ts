import { z } from 'zod';

export const uploadMediaMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm'
] as const;

export const uploadImageMimeTypes = uploadMediaMimeTypes.filter((mimeType) =>
  mimeType.startsWith('image/')
) as Array<(typeof uploadMediaMimeTypes)[number]>;

export const uploadVideoMimeTypes = uploadMediaMimeTypes.filter((mimeType) =>
  mimeType.startsWith('video/')
) as Array<(typeof uploadMediaMimeTypes)[number]>;

export const createUploadIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(uploadMediaMimeTypes),
  sizeBytes: z.coerce.number().int().positive().max(60 * 1024 * 1024)
});

export const uploadMediaSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(uploadMediaMimeTypes),
  dataUrl: z.string().min(1),
  altText: z.string().trim().max(255).optional()
});

export const uploadPhotoSchema = uploadMediaSchema;

export type UploadMediaDto = z.infer<typeof uploadMediaSchema>;
export type UploadPhotoDto = UploadMediaDto;
