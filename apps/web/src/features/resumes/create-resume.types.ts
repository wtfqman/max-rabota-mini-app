import { z } from 'zod';
import { contactTypeOptions } from '../vacancies/create-vacancy.types.js';

export { contactTypeOptions };

export const createResumePayloadSchema = z.object({
  name: z.string().trim().min(2, 'Укажите имя').max(180),
  profession: z.string().trim().min(2, 'Укажите профессию').max(180),
  description: z.string().trim().min(20, 'Добавьте описание от 20 символов').max(4000),
  experienceText: z.string().trim().min(2, 'Опишите опыт').max(1200),
  expectedSalary: z.number().nonnegative().optional(),
  districtText: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  categoryText: z.string().trim().max(120).optional(),
  contacts: z
    .array(
      z.object({
        type: z.enum(['MAX', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER']),
        label: z.string().trim().max(80).optional(),
        value: z.string().trim().min(1, 'Заполните контакт').max(255),
        isPreferred: z.boolean().optional()
      })
    )
    .min(1, 'Добавьте хотя бы один контакт')
    .max(8),
  photos: z
    .array(
      z.object({
        storageKey: z.string(),
        url: z.string(),
        previewUrl: z.string().optional(),
        mimeType: z.string().optional(),
        sizeBytes: z.number().optional(),
        altText: z.string().optional()
      })
    )
    .max(1)
});

export type CreateResumePayload = z.infer<typeof createResumePayloadSchema>;

export interface CreateResumeResponse {
  id: string;
  type: 'resume';
  status: 'pending_moderation';
  title: string;
  createdAt: string;
}
