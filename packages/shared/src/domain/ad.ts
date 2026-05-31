export const AD_TYPES = ['vacancy', 'resume', 'equipment', 'material', 'tool'] as const;
export const AD_STATUSES = [
  'draft',
  'pending_moderation',
  'approved',
  'rejected',
  'published',
  'hidden',
  'archived',
  'deleted'
] as const;

export type AdTypeCode = (typeof AD_TYPES)[number];
export type AdStatusCode = (typeof AD_STATUSES)[number];

export const AD_TYPE_LABELS: Record<AdTypeCode, string> = {
  vacancy: 'Вакансия',
  resume: 'Резюме',
  equipment: 'Строительная техника',
  material: 'Строительные материалы',
  tool: 'Инструменты'
};
