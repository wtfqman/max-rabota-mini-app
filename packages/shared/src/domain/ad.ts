export const AD_TYPES = ['vacancy', 'resume', 'equipment', 'material', 'tool'] as const;
export const AD_STATUSES = [
  'draft',
  'payment_pending',
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

export const PAID_AD_TYPES = ['vacancy'] as const satisfies readonly AdTypeCode[];
export const FREE_AD_TYPES = ['resume', 'equipment', 'material', 'tool'] as const satisfies readonly AdTypeCode[];

export const AD_TYPE_LABELS: Record<AdTypeCode, string> = {
  vacancy: 'Вакансия',
  resume: 'Резюме',
  equipment: 'Строительная техника',
  material: 'Строительные материалы',
  tool: 'Инструменты'
};

export function normalizeAdTypeCode(type: unknown): AdTypeCode | null {
  if (typeof type !== 'string') {
    return null;
  }

  const normalized = type.trim().toLowerCase();
  return AD_TYPES.includes(normalized as AdTypeCode) ? (normalized as AdTypeCode) : null;
}

export function isPaidAdType(type: unknown): type is 'vacancy' {
  return normalizeAdTypeCode(type) === 'vacancy';
}

export function requiresAdPayment(type: unknown): boolean {
  return isPaidAdType(type);
}
