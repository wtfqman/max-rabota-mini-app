export const VACANCY_PUBLICATION_PLAN_CODES = ['single', 'bundle_3', 'bundle_7'] as const;

export type VacancyPublicationPlanCode = (typeof VACANCY_PUBLICATION_PLAN_CODES)[number];

export interface VacancyPublicationPlan {
  code: VacancyPublicationPlanCode;
  publications: number;
  amountValue: string;
  label: string;
}

export const VACANCY_PUBLICATION_FUNDING_MODES = ['auto', 'use_balance', 'buy_package'] as const;

export type VacancyPublicationFundingMode = (typeof VACANCY_PUBLICATION_FUNDING_MODES)[number];

export interface VacancyBillingRefundInput {
  source?: 'payment' | 'credit';
  planCode?: VacancyPublicationPlanCode;
  publications?: number;
  mediaHighlight?: boolean;
  mediaFeeRequired?: boolean;
}

export type RejectedVacancyRefundPolicy =
  | {
      action: 'full_refund';
      reason: 'single_publication_payment' | 'credit_highlight_payment';
    }
  | {
      action: 'partial_refund';
      amountValue: string;
      reason: 'bundle_highlight_payment';
    }
  | {
      action: 'skip_yookassa_refund';
      reason:
        | 'payment_not_required'
        | 'bundle_payment_slot_returned'
        | 'unknown_payment_shape';
    };

export const VACANCY_PUBLICATION_PLANS: Record<VacancyPublicationPlanCode, VacancyPublicationPlan> = {
  single: {
    code: 'single',
    publications: 1,
    amountValue: '100.00',
    label: '1 публикация'
  },
  bundle_3: {
    code: 'bundle_3',
    publications: 3,
    amountValue: '200.00',
    label: '3 публикации'
  },
  bundle_7: {
    code: 'bundle_7',
    publications: 7,
    amountValue: '350.00',
    label: '7 публикаций'
  }
};

export const VACANCY_MEDIA_HIGHLIGHT_AMOUNT_RUB = '50.00';
export const VACANCY_MEDIA_FEE_AMOUNT_RUB = VACANCY_MEDIA_HIGHLIGHT_AMOUNT_RUB;

export function hasPaidVacancyMedia(media: Array<unknown> | null | undefined): boolean {
  return requiresVacancyMediaFee(media);
}

export function requiresVacancyMediaFee(media: Array<unknown> | null | undefined): boolean {
  return Array.isArray(media) && media.length > 0;
}

export function getVacancyPublicationPlan(code: unknown): VacancyPublicationPlan {
  return isVacancyPublicationPlanCode(code) ? VACANCY_PUBLICATION_PLANS[code] : VACANCY_PUBLICATION_PLANS.single;
}

export function isVacancyPublicationPlanCode(code: unknown): code is VacancyPublicationPlanCode {
  return typeof code === 'string' && VACANCY_PUBLICATION_PLAN_CODES.includes(code as VacancyPublicationPlanCode);
}

export function addMoneyValues(...values: string[]): string {
  const totalCents = values.reduce((sum, value) => sum + Math.round(Number(value.replace(',', '.')) * 100), 0);
  return (totalCents / 100).toFixed(2);
}

export function getVacancyPublicationPaymentAmount(input: {
  planCode?: unknown;
  usesBalance?: boolean;
  mediaHighlight?: boolean;
  hasPaidMedia?: boolean;
  mediaFeeRequired?: boolean;
}): string {
  const mediaFeeRequired =
    input.mediaFeeRequired === true || input.hasPaidMedia === true || input.mediaHighlight === true;

  if (input.usesBalance) {
    return mediaFeeRequired ? VACANCY_MEDIA_FEE_AMOUNT_RUB : '0.00';
  }

  const plan = getVacancyPublicationPlan(input.planCode);

  return addMoneyValues(plan.amountValue, mediaFeeRequired ? VACANCY_MEDIA_FEE_AMOUNT_RUB : '0.00');
}

export function isVacancyPublicationFundingMode(value: unknown): value is VacancyPublicationFundingMode {
  return typeof value === 'string' && VACANCY_PUBLICATION_FUNDING_MODES.includes(value as VacancyPublicationFundingMode);
}

export function getRejectedVacancyRefundPolicy(
  billing: VacancyBillingRefundInput | null | undefined
): RejectedVacancyRefundPolicy {
  if (!billing || billing.source === 'credit') {
    return {
      action: 'skip_yookassa_refund',
      reason: 'payment_not_required'
    };
  }

  const plan = getVacancyPublicationPlan(billing.planCode);
  const publications = billing.publications ?? plan.publications;
  const mediaFeeRequired = billing.mediaFeeRequired === true || billing.mediaHighlight === true;

  if (publications === 0 && mediaFeeRequired) {
    return {
      action: 'full_refund',
      reason: 'credit_highlight_payment'
    };
  }

  if (publications === 1) {
    return {
      action: 'full_refund',
      reason: 'single_publication_payment'
    };
  }

  if (publications > 1 && mediaFeeRequired) {
    return {
      action: 'partial_refund',
      amountValue: VACANCY_MEDIA_FEE_AMOUNT_RUB,
      reason: 'bundle_highlight_payment'
    };
  }

  if (publications > 1) {
    return {
      action: 'skip_yookassa_refund',
      reason: 'bundle_payment_slot_returned'
    };
  }

  return {
    action: 'skip_yookassa_refund',
    reason: 'unknown_payment_shape'
  };
}
