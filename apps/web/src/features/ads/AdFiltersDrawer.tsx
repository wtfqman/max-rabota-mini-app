import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../../shared/api/client.js';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import { Input } from '../../shared/ui/Input.js';
import { SuggestionInput } from '../../shared/ui/SuggestionInput.js';

export type AdFiltersKind = 'vacancy' | 'resume' | 'equipment' | 'material' | 'tool';

export interface AdFiltersState {
  category: string;
  district: string;
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
  priceFrom: '',
  priceTo: ''
};

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
  const [draft, setDraft] = useState<AdFiltersState>(() => normalizeFiltersForKind(filters));

  useEffect(() => {
    if (open) {
      setDraft(normalizeFiltersForKind(filters));
    }
  }, [open, filters.category, filters.district, filters.priceFrom, filters.priceTo]);

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
    onApply(normalizeFiltersForKind(draft));
  };

  return (
    <div className="fixed inset-0 z-[160] bg-surface-950/82 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 h-full w-full cursor-default"
        type="button"
        aria-label="Закрыть фильтры"
        onClick={onClose}
      />

      <div className="app-fade-up absolute inset-x-0 bottom-[calc(90px_+_env(safe-area-inset-bottom))] mx-auto flex max-h-[calc(100dvh_-_112px_-_env(safe-area-inset-bottom))] max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-surface-900 shadow-panel">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-white/8 px-4 pb-3 pt-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent-green">Фильтры</p>
            <h2 className="text-xl font-black text-text-primary">{copy.title}</h2>
            <p className="text-sm leading-5 text-text-secondary">{copy.description}</p>
          </div>
          <ActionButton variant="quiet" aria-label="Закрыть" icon={<X size={20} />} onClick={onClose} />
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pb-4 pt-4">
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

            <div className="rounded-[22px] border border-white/8 bg-surface-950/35 p-3">
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.1em] text-text-secondary">
                {copy.priceLabel}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input name="priceFrom" label="От" placeholder="0" inputMode="numeric" value={draft.priceFrom} onChange={updateField('priceFrom')} />
                <Input name="priceTo" label="До" placeholder="150000" inputMode="numeric" value={draft.priceTo} onChange={updateField('priceTo')} />
              </div>
            </div>
          </div>

          <div className="shrink-0 grid grid-cols-[1fr_auto] gap-2 border-t border-white/8 bg-surface-900/96 px-4 pb-3 pt-3 backdrop-blur">
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

function normalizeFiltersForKind(filters: Partial<AdFiltersState>): AdFiltersState {
  return {
    ...emptyFilters,
    category: normalizeText(filters.category),
    district: normalizeText(filters.district),
    priceFrom: normalizeMoney(filters.priceFrom),
    priceTo: normalizeMoney(filters.priceTo)
  };
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
      description: 'Оставлены базовые параметры поиска: сфера, район и зарплата.',
      categoryLabel: 'Сфера работы',
      categoryPlaceholder: 'Строительство, водители, склад',
      priceLabel: 'Зарплата, ₽',
      submitLabel: 'Показать вакансии'
    };
  }

  if (kind === 'resume') {
    return {
      title: 'Найти специалистов',
      description: 'Ищите резюме по профессии, району и желаемой сумме.',
      categoryLabel: 'Профессия',
      categoryPlaceholder: 'Монолитчик, отделочник, крановщик',
      priceLabel: 'Желаемая сумма, ₽',
      submitLabel: 'Показать резюме'
    };
  }

  if (kind === 'equipment') {
    return {
      title: 'Подобрать технику',
      description: 'Базовый поиск по типу, району и стоимости.',
      categoryLabel: 'Тип техники',
      categoryPlaceholder: 'Экскаватор, самосвал, автовышка',
      priceLabel: 'Стоимость, ₽',
      submitLabel: 'Показать технику'
    };
  }

  if (kind === 'material') {
    return {
      title: 'Подобрать материалы',
      description: 'Категория, район и цена без лишних параметров.',
      categoryLabel: 'Категория материала',
      categoryPlaceholder: 'Бетон, кирпич, утеплитель',
      priceLabel: 'Цена, ₽',
      submitLabel: 'Показать материалы'
    };
  }

  return {
    title: 'Подобрать инструменты',
    description: 'Категория, район и цена без расширенных характеристик.',
    categoryLabel: 'Категория инструмента',
    categoryPlaceholder: 'Перфоратор, леса, лазерный уровень',
    priceLabel: 'Цена, ₽',
    submitLabel: 'Показать инструменты'
  };
}
