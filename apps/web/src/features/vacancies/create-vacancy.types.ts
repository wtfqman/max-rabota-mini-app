import { z } from 'zod';
import { VACANCY_PUBLICATION_FUNDING_MODES, VACANCY_PUBLICATION_PLAN_CODES } from '@rabst24/shared';
import type { CreateAdPayment } from '../ads/payment.types.js';

export const contactTypeOptions = [
  { value: 'MAX', label: 'MAX' },
  { value: 'PHONE', label: 'Телефон' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'OTHER', label: 'Другое' }
] as const;

export const createVacancyPayloadSchema = z.object({
  title: z.string().trim().min(5, 'Укажите название вакансии').max(180),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
  districtText: z.string().trim().max(120).optional(),
  categoryText: z.string().trim().max(120).optional(),
  salaryText: z.string().trim().max(180).optional(),
  isSalaryNegotiable: z.boolean().optional(),
  publicationPlan: z.enum(VACANCY_PUBLICATION_PLAN_CODES),
  publicationFunding: z.enum(VACANCY_PUBLICATION_FUNDING_MODES).optional(),
  description: z.string().trim().min(3, 'Добавьте короткое описание').max(4000),
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
    .max(9)
});

export type CreateVacancyPayload = z.infer<typeof createVacancyPayloadSchema>;

export interface UploadedPhoto {
  storageKey: string;
  url: string;
  previewUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
}

export interface CreateVacancyResponse {
  id: string;
  type: 'vacancy';
  status: 'payment_pending' | 'pending_moderation';
  title: string;
  createdAt: string;
  payment: CreateAdPayment | null;
}
