import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../shared/api/client.js';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import { Input } from '../../shared/ui/Input.js';
import { Select } from '../../shared/ui/Select.js';
import { SuggestionInput } from '../../shared/ui/SuggestionInput.js';

export type AdFiltersKind = 'vacancy' | 'resume' | 'equipment' | 'material' | 'tool';

export interface AdFiltersState {
  category: string;
  district: string;
  schedule: string;
  experience: string;
  priceFrom: string;
  priceTo: string;
}

interface AdFiltersDrawerProps {
  open: boolean;
  kind: AdFiltersKind;
  filters: AdFiltersState;
  onClose: () => void;
  onApply: (filters: AdFiltersState) => void;
  onReset: () => void;
}

const emptyFilters: AdFiltersState = {
  category: '',
  district: '',
  schedule: '',
  experience: '',
  priceFrom: '',
  priceTo: ''
};

const experienceOptions = [
  { value: '', label: 'Любой опыт' },
  { value: 'без опыта', label: 'Без опыта' },
  { value: '1', label: 'От 1 года' },
  { value: '3', label: 'От 3 лет' },
  { value: '5', label: 'От 5 лет' }
];

const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

export function AdFiltersDrawer({
  open,
  kind,
  filters,
  onClose,
  onApply,
  onReset
}: AdFiltersDrawerProps) {
  const copy = useMemo(() => getFilterCopy(kind), [kind]);
  const [draft, setDraft] = useState<AdFiltersState>(() => normalizeFiltersForKind(kind, filters));
  const shouldShowVacancyOnlyFilters = kind === 'vacancy';

  useEffect(() => {
    if (open) {
      setDraft(normalizeFiltersForKind(kind, filters));
    }
  }, [
    open,
    kind,
    filters.category,
    filters.district,
    filters.schedule,
    filters.experience,
    filters.priceFrom,
    filters.priceTo
  ]);

  if (!open) {
    return null;
  }

  const updateField =
    (field: keyof AdFiltersState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((current) => ({
        ...current,
        [field]: event.target.value
      }));
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(normalizeFiltersForKind(kind, draft));
  };

  return (
    <div className="fixed inset-0 z-[160] bg-surface-950/82 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 h-full w-full cursor-default"
        type="button"
        aria-label="Закрыть фильтры"
        onClick={onClose}
      />

      <div className="app-fade-up absolute inset-x-0 bottom-0 mx-auto max-h-[calc(100dvh-18px)] max-w-2xl overflow-hidden rounded-t-[28px] border border-white/10 bg-surface-900 shadow-panel">
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-4 pb-3 pt-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent-green">Фильтры</p>
            <h2 className="text-xl font-black text-text-primary">{copy.title}</h2>
            <p className="text-sm leading-5 text-text-secondary">{copy.description}</p>
          </div>
          <ActionButton variant="quiet" aria-label="Закрыть" icon={<X size={20} />} onClick={onClose} />
        </div>

        <form className="flex max-h-[calc(100dvh-132px)] flex-col" onSubmit={handleSubmit}>
          <div className="grid gap-4 overflow-y-auto px-4 pb-[calc(118px+env(safe-area-inset-bottom))] pt-4">
            <SuggestionInput
              name="category"
              label={copy.categoryLabel}
              placeholder={copy.categoryPlaceholder}
              value={draft.category}
              onChange={updateField('category')}
              loadSuggestions={loadCategorySuggestions}
            />

            <SuggestionInput
              name="district"
              label="Район"
              placeholder="ЦАО, ЮВАО, Подольск"
              value={draft.district}
              onChange={updateField('district')}
              loadSuggestions={loadDistrictSuggestions}
            />

            {shouldShowVacancyOnlyFilters ? (
              <div className="grid gap-4">
                <Select
                  name="experience"
                  label="Опыт"
                  value={draft.experience}
                  onChange={updateField('experience')}
                  options={experienceOptions}
                />
              </div>
            ) : null}

            <div className="rounded-[22px] border border-white/8 bg-surface-950/35 p-3">
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.1em] text-text-secondary">
                {copy.priceLabel}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="priceFrom"
                  label="От"
                  placeholder="0"
                  inputMode="numeric"
                  value={draft.priceFrom}
                  onChange={updateField('priceFrom')}
                />
                <Input
                  name="priceTo"
                  label="До"
                  placeholder="150000"
                  inputMode="numeric"
                  value={draft.priceTo}
                  onChange={updateField('priceTo')}
                />
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 grid grid-cols-[1fr_auto] gap-2 border-t border-white/8 bg-surface-900/96 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
            <ActionButton type="submit">{copy.submitLabel}</ActionButton>
            <ActionButton type="button" variant="secondary" onClick={onReset}>
              Сбросить
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function normalizeFiltersForKind(kind: AdFiltersKind, filters: Partial<AdFiltersState>): AdFiltersState {
  const normalized = {
    ...emptyFilters,
    ...filters,
    category: normalizeText(filters.category),
    district: normalizeText(filters.district),
    schedule: normalizeText(filters.schedule),
    experience: normalizeText(filters.experience),
    priceFrom: normalizeMoney(filters.priceFrom),
    priceTo: normalizeMoney(filters.priceTo)
  };

  normalized.schedule = '';

  if (kind !== 'vacancy') {
    normalized.experience = '';
  }

  return normalized;
}

function normalizeText(value?: string): string {
  return value?.trim() ?? '';
}

function normalizeMoney(value?: string): string {
  return (value ?? '').replace(/[^\d.,]/g, '').replace(',', '.').trim();
}

function getFilterCopy(kind: AdFiltersKind) {
  if (kind === 'vacancy') {
    return {
      title: 'Подобрать вакансии',
      description: 'Оставили только параметры, которые реально помогают найти работу.',
      categoryLabel: 'Сфера работы',
      categoryPlaceholder: 'Строительство, водители, склад',
      priceLabel: 'Зарплата, ₽',
      submitLabel: 'Показать вакансии'
    };
  }

  if (kind === 'resume') {
    return {
      title: 'Найти специалистов',
      description: 'Фильтруйте анкеты по роли, району и желаемой зарплате.',
      categoryLabel: 'Специальность',
      categoryPlaceholder: 'Монолитчик, отделочник, крановщик',
      priceLabel: 'Желаемая зарплата, ₽',
      submitLabel: 'Показать резюме'
    };
  }

  if (kind === 'equipment') {
    return {
      title: 'Подобрать технику',
      description: 'Тип техники, район и цена без лишних полей про график работы.',
      categoryLabel: 'Тип техники',
      categoryPlaceholder: 'Экскаватор, самосвал, автовышка',
      priceLabel: 'Цена или аренда, ₽',
      submitLabel: 'Показать технику'
    };
  }

  if (kind === 'material') {
    return {
      title: 'Подобрать материалы',
      description: 'Категория, район и цена: только то, что нужно для закупки.',
      categoryLabel: 'Категория материала',
      categoryPlaceholder: 'Бетон, кирпич, утеплитель',
      priceLabel: 'Цена, ₽',
      submitLabel: 'Показать материалы'
    };
  }

  return {
    title: 'Подобрать инструменты',
    description: 'Категория, район и цена без лишних параметров из вакансий.',
    categoryLabel: 'Категория инструмента',
    categoryPlaceholder: 'Перфоратор, леса, лазерный уровень',
    priceLabel: 'Цена, ₽',
    submitLabel: 'Показать инструменты'
  };
}
