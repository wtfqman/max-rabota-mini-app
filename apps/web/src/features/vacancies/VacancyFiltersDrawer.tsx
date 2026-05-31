import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import { Select } from '../../shared/ui/Select.js';
import { SuggestionInput } from '../../shared/ui/SuggestionInput.js';
import { apiClient } from '../../shared/api/client.js';

export interface VacancyFiltersState {
  category: string;
  district: string;
  schedule: string;
  experience: string;
}

interface VacancyFiltersDrawerProps {
  open: boolean;
  filters: VacancyFiltersState;
  onClose: () => void;
  onApply: (filters: VacancyFiltersState) => void;
  onReset: () => void;
}

const scheduleOptions = [
  { value: '', label: 'Любой график' },
  { value: '5/2', label: '5/2' },
  { value: '2/2', label: '2/2' },
  { value: 'вахта', label: 'Вахта' },
  { value: 'сменный', label: 'Сменный' },
  { value: 'удаленно', label: 'Удалённо' }
];

const experienceOptions = [
  { value: '', label: 'Любой опыт' },
  { value: 'без опыта', label: 'Без опыта' },
  { value: '1', label: 'От 1 года' },
  { value: '3', label: 'От 3 лет' },
  { value: '5', label: 'От 5 лет' }
];

const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

export function VacancyFiltersDrawer({
  open,
  filters,
  onClose,
  onApply,
  onReset
}: VacancyFiltersDrawerProps) {
  if (!open) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    onApply({
      category: getValue(formData, 'category'),
      district: getValue(formData, 'district'),
      schedule: getValue(formData, 'schedule'),
      experience: getValue(formData, 'experience')
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-surface-950/80 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" type="button" aria-label="Закрыть фильтры" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[20px] border border-white/8 bg-surface-900 p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Фильтры</h2>
            <p className="text-sm leading-6 text-text-secondary">Уточните выдачу по району, графику и опыту.</p>
          </div>
          <ActionButton variant="quiet" aria-label="Закрыть" icon={<X size={20} />} onClick={onClose} />
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <SuggestionInput
            name="category"
            label="Категория"
            placeholder="Например: сварка, водитель"
            defaultValue={filters.category}
            loadSuggestions={loadCategorySuggestions}
          />
          <SuggestionInput
            name="district"
            label="Район"
            placeholder="ЦАО, ЮВАО, Подольск"
            defaultValue={filters.district}
            loadSuggestions={loadDistrictSuggestions}
          />
          <Select name="schedule" label="График" defaultValue={filters.schedule} options={scheduleOptions} />
          <Select name="experience" label="Опыт" defaultValue={filters.experience} options={experienceOptions} />

          <div className="sticky bottom-0 grid grid-cols-[1fr_auto] gap-2 bg-surface-900 pt-2">
            <ActionButton type="submit">Показать вакансии</ActionButton>
            <ActionButton type="button" variant="secondary" onClick={onReset}>
              Сбросить
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function getValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
