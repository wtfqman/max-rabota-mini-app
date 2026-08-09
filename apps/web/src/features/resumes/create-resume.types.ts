import { z } from 'zod';
import { contactTypeOptions } from '../vacancies/create-vacancy.types.js';

export { contactTypeOptions };

const optionalExpectedSalarySchema = z.preprocess((value) => {
  if (value === '' || value === null) {
    return undefined;
  }

  return value;
}, z.coerce.number().nonnegative().optional());

export const createResumePayloadSchema = z.object({
  name: z.string().trim().min(2, 'Укажите имя').max(180),
  profession: z.string().trim().min(2, 'Укажите профессию').max(180),
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
        value: z.string().trim().min(1, 'Заполните контакт').max(255),
        isPreferred: z.boolean().optional()
      })
    )
    .min(0)
    .max(8),
  verifiedContactId: z.string().trim().min(1).optional(),
  contactConsentId: z.string().trim().min(1).optional(),
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
    .max(9)
});

export type CreateResumePayload = z.infer<typeof createResumePayloadSchema>;

export interface CreateResumeResponse {
  id: string;
  type: 'resume';
  status: 'pending_moderation';
  title: string;
  createdAt: string;
  payment: null;
}
