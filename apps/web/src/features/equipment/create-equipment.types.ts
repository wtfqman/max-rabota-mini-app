import { z } from 'zod';
import { contactTypeOptions } from '../vacancies/create-vacancy.types.js';

export { contactTypeOptions };

export const createEquipmentPayloadSchema = z.object({
  title: z.string().trim().min(3, 'Укажите название техники').max(180),
  categoryText: z.string().trim().min(2, 'Укажите категорию техники').max(120),
  equipmentGroupText: z.string().trim().max(120).optional(),
  description: z.string().trim().min(3, 'Добавьте короткое описание').max(4000),
  districtText: z.string().trim().max(120).optional(),
  address: z.string().trim().max(240).optional(),
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

export type CreateEquipmentPayload = z.infer<typeof createEquipmentPayloadSchema>;

export interface CreateEquipmentResponse {
  id: string;
  type: 'equipment';
  status: 'pending_moderation';
  title: string;
  createdAt: string;
}
