export const PAYMENT_PURPOSE_CODES = [
  'VACANCY_PACKAGE',
  'VACANCY_MEDIA_FEE',
  'RESUME_CONTACT_UNLOCK',
  'RESUME_CONNECTION_ACCESS',
  'AD_PROMOTION'
] as const;

export type PaymentPurposeCode = (typeof PAYMENT_PURPOSE_CODES)[number];

export interface PaymentPurposeClassification {
  primary: PaymentPurposeCode;
  components: PaymentPurposeCode[];
}

export interface PaymentPurposeEffects {
  addsVacancyPublications: boolean;
  consumesVacancyPublication: boolean;
  submitsVacancyToModeration: boolean;
  unlocksResumeContact: boolean;
  activatesPromotion: boolean;
}

export function isPaymentPurposeCode(value: unknown): value is PaymentPurposeCode {
  return typeof value === 'string' && PAYMENT_PURPOSE_CODES.includes(value as PaymentPurposeCode);
}

export function classifyVacancyPaymentPurpose(input: {
  packagePublications: number;
  includesMediaFee: boolean;
}): PaymentPurposeClassification {
  const components: PaymentPurposeCode[] = [];

  if (input.packagePublications > 0) {
    components.push('VACANCY_PACKAGE');
  }

  if (input.includesMediaFee) {
    components.push('VACANCY_MEDIA_FEE');
  }

  if (components.length === 0) {
    components.push('VACANCY_PACKAGE');
  }

  return {
    primary: components.includes('VACANCY_PACKAGE') ? 'VACANCY_PACKAGE' : components[0],
    components
  };
}

export function normalizePaymentPurpose(input: {
  purposeCode?: unknown;
  purposeComponents?: unknown;
  packagePublications?: number;
  includesMediaFee?: boolean;
}): PaymentPurposeClassification {
  const components = Array.isArray(input.purposeComponents)
    ? Array.from(new Set(input.purposeComponents.filter(isPaymentPurposeCode)))
    : [];

  if (isPaymentPurposeCode(input.purposeCode)) {
    if (input.purposeCode === 'VACANCY_PACKAGE' && components.length === 0) {
      return classifyVacancyPaymentPurpose({
        packagePublications: input.packagePublications ?? 0,
        includesMediaFee: input.includesMediaFee ?? false
      });
    }

    const candidate = components.length > 0 ? components : [input.purposeCode];

    if (!isValidPurposeCombination(input.purposeCode, candidate)) {
      return {
        primary: input.purposeCode,
        components: [input.purposeCode]
      };
    }

    return {
      primary: input.purposeCode,
      components: candidate
    };
  }

  return classifyVacancyPaymentPurpose({
    packagePublications: input.packagePublications ?? 0,
    includesMediaFee: input.includesMediaFee ?? false
  });
}

function isValidPurposeCombination(primary: PaymentPurposeCode, components: PaymentPurposeCode[]): boolean {
  const componentSet = new Set(components);

  if (primary === 'VACANCY_PACKAGE') {
    return (
      componentSet.has('VACANCY_PACKAGE') &&
      [...componentSet].every((component) => component === 'VACANCY_PACKAGE' || component === 'VACANCY_MEDIA_FEE')
    );
  }

  if (primary === 'VACANCY_MEDIA_FEE') {
    return componentSet.size === 1 && componentSet.has('VACANCY_MEDIA_FEE');
  }

  if (primary === 'RESUME_CONTACT_UNLOCK') {
    return componentSet.size === 1 && componentSet.has('RESUME_CONTACT_UNLOCK');
  }

  if (primary === 'RESUME_CONNECTION_ACCESS') {
    return componentSet.size === 1 && componentSet.has('RESUME_CONNECTION_ACCESS');
  }

  return componentSet.size === 1 && componentSet.has('AD_PROMOTION');
}

export function getPaymentPurposeEffects(classification: PaymentPurposeClassification): PaymentPurposeEffects {
  const components = new Set(classification.components);

  return {
    addsVacancyPublications: components.has('VACANCY_PACKAGE'),
    consumesVacancyPublication: components.has('VACANCY_PACKAGE') || components.has('VACANCY_MEDIA_FEE'),
    submitsVacancyToModeration: components.has('VACANCY_PACKAGE') || components.has('VACANCY_MEDIA_FEE'),
    unlocksResumeContact: components.has('RESUME_CONTACT_UNLOCK') || components.has('RESUME_CONNECTION_ACCESS'),
    activatesPromotion: components.has('AD_PROMOTION')
  };
}
