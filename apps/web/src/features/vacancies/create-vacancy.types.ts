import { z } from 'zod';

export const contactTypeOptions = [
  { value: 'MAX', label: 'MAX' },
  { value: 'PHONE', label: 'Телефон' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WEBSITE', label: 'Сайт' },
  { value: 'OTHER', label: 'Другое' }
] as const;

export const salaryPeriodOptions = [
  { value: '', label: 'Не указано' },
  { value: 'HOUR', label: 'час' },
  { value: 'DAY', label: 'день' },
  { value: 'WEEK', label: 'неделя' },
  { value: 'MONTH', label: 'месяц' },
  { value: 'PROJECT', label: 'проект' }
] as const;

export const createVacancyPayloadSchema = z.object({
  title: z.string().trim().min(5, 'Укажите название вакансии').max(180),
  companyName: z.string().trim().min(2, 'Укажите имя или компанию').max(160),
  city: z.string().trim().min(2, 'Укажите город').max(120),
  address: z.string().trim().max(240).optional(),
  districtText: z.string().trim().max(120).optional(),
  categoryText: z.string().trim().min(2, 'Укажите категорию').max(120),
  schedule: z.string().trim().min(2, 'Укажите график').max(160),
  workPeriods: z.array(z.string().trim().min(1).max(120)).max(10),
  workPeriodDescription: z.string().trim().max(500).optional(),
  experience: z.string().trim().min(2, 'Укажите опыт').max(160),
  salaryText: z.string().trim().max(180).optional(),
  salaryFrom: z.number().nonnegative().optional(),
  salaryTo: z.number().nonnegative().optional(),
  salaryPeriod: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT']).optional(),
  isSalaryNegotiable: z.boolean().optional(),
  description: z.string().trim().min(20, 'Добавьте описание от 20 символов').max(4000),
  requirements: z.array(z.string().trim().min(1).max(500)).max(30),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30),
  benefits: z.array(z.string().trim().min(1).max(500)).max(30),
  metroStations: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        lineName: z.string().trim().max(160).optional(),
        walkingMinutes: z.number().int().positive().max(120).optional()
      })
    )
    .max(8),
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
    .max(8)
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
  status: 'pending_moderation';
  title: string;
  createdAt: string;
}
