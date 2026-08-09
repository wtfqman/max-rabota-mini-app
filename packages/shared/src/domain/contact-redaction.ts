const phoneCandidatePattern = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const defaultPhoneReplacement = '+7 *** ***-**-**';

export function redactPhoneContacts(value: string | null | undefined, replacement = defaultPhoneReplacement): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.replace(phoneCandidatePattern, (candidate) => {
    const digits = candidate.replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 15) {
      return candidate;
    }

    return replacement;
  });
}
