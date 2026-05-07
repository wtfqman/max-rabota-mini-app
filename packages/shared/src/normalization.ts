export type TaxonomyKind = 'category' | 'district';

export interface TaxonomySuggestion {
  value: string;
  aliases: string[];
}

const CATEGORY_SUGGESTIONS: TaxonomySuggestion[] = [
  { value: 'Строительство', aliases: ['стройка', 'строительные работы', 'строитель'] },
  { value: 'Водители', aliases: ['водитель', 'доставка', 'логистика'] },
  { value: 'Склад', aliases: ['склады', 'кладовщик', 'складская работа'] },
  { value: 'Производство', aliases: ['завод', 'цех', 'производственные работы'] },
  { value: 'Спецтехника', aliases: ['техника', 'аренда техники', 'строительная техника'] },
  { value: 'Погрузчики', aliases: ['погрузчик', 'вилочный погрузчик'] },
  { value: 'Экскаваторы', aliases: ['экскаватор', 'экскаватор-погрузчик'] },
  { value: 'Разнорабочие', aliases: ['разнорабочий', 'подсобник', 'подсобные работы'] }
];

const DISTRICT_SUGGESTIONS: TaxonomySuggestion[] = [
  { value: 'ЦАО', aliases: ['центр', 'центральный округ'] },
  { value: 'САО', aliases: ['север', 'северный округ'] },
  { value: 'СВАО', aliases: ['северо-восток', 'северо восток'] },
  { value: 'ВАО', aliases: ['восток', 'восточный округ'] },
  { value: 'ЮВАО', aliases: ['юго-восток', 'юго восток'] },
  { value: 'ЮАО', aliases: ['юг', 'южный округ'] },
  { value: 'ЮЗАО', aliases: ['юго-запад', 'юго запад'] },
  { value: 'ЗАО', aliases: ['запад', 'западный округ'] },
  { value: 'СЗАО', aliases: ['северо-запад', 'северо запад'] },
  { value: 'Подольск', aliases: ['подольский район'] },
  { value: 'Химки', aliases: ['химкинский район'] },
  { value: 'Мытищи', aliases: ['мытищинский район'] }
];

export function normalizeTaxonomyText(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .normalize('NFKC')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^\p{L}\p{N}\s./-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || undefined;
}

export function normalizeSearchText(value: string | null | undefined): string | undefined {
  return normalizeTaxonomyText(value)?.toLocaleLowerCase('ru-RU');
}

export function canonicalizeCategory(value: string | null | undefined): string | undefined {
  return canonicalizeTaxonomyValue(value, CATEGORY_SUGGESTIONS);
}

export function canonicalizeDistrict(value: string | null | undefined): string | undefined {
  return canonicalizeTaxonomyValue(value, DISTRICT_SUGGESTIONS);
}

export function buildTaxonomySearchVariants(
  value: string | null | undefined,
  kind: TaxonomyKind
): string[] {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return [];
  }

  const suggestions = kind === 'category' ? CATEGORY_SUGGESTIONS : DISTRICT_SUGGESTIONS;
  const variants = new Set<string>([normalized]);

  for (const suggestion of suggestions) {
    const suggestionTokens = [suggestion.value, ...suggestion.aliases]
      .map((item) => normalizeSearchText(item))
      .filter((item): item is string => Boolean(item));

    if (suggestionTokens.some((item) => item.includes(normalized) || normalized.includes(item))) {
      suggestionTokens.forEach((item) => variants.add(item));
    }
  }

  return [...variants];
}

export function getCategorySuggestions(query?: string): TaxonomySuggestion[] {
  return filterSuggestions(CATEGORY_SUGGESTIONS, query);
}

export function getDistrictSuggestions(query?: string): TaxonomySuggestion[] {
  return filterSuggestions(DISTRICT_SUGGESTIONS, query);
}

function canonicalizeTaxonomyValue(
  value: string | null | undefined,
  suggestions: TaxonomySuggestion[]
): string | undefined {
  const normalized = normalizeTaxonomyText(value);
  const searchValue = normalizeSearchText(normalized);

  if (!normalized || !searchValue) {
    return undefined;
  }

  for (const suggestion of suggestions) {
    const tokens = [suggestion.value, ...suggestion.aliases]
      .map((item) => normalizeSearchText(item))
      .filter((item): item is string => Boolean(item));

    if (tokens.includes(searchValue)) {
      return suggestion.value;
    }
  }

  return normalized;
}

function filterSuggestions(suggestions: TaxonomySuggestion[], query?: string): TaxonomySuggestion[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return suggestions;
  }

  return suggestions.filter((suggestion) =>
    [suggestion.value, ...suggestion.aliases]
      .map((item) => normalizeSearchText(item))
      .some((item) => item?.includes(normalizedQuery))
  );
}
