import { useState } from 'react';
import { BellPlus, X } from 'lucide-react';
import { useAppStore } from '../../app/store/app-store.js';
import { apiClient } from '../../shared/api/client.js';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import { Input } from '../../shared/ui/Input.js';
import { Select } from '../../shared/ui/Select.js';
import type { SavedSearchAdType, SavedSearchFrequency } from './saved-search.types.js';
import type { VacancyListQuery } from '../vacancies/vacancy.types.js';

interface SaveSearchButtonProps {
  adType: SavedSearchAdType;
  query: Partial<VacancyListQuery>;
  defaultName: string;
}

const frequencyOptions = [
  { value: 'IMMEDIATE', label: 'Сразу' },
  { value: 'DAILY', label: 'Раз в день' },
  { value: 'OFF', label: 'Без уведомлений' }
];

export function SaveSearchButton({ adType, query, defaultName }: SaveSearchButtonProps) {
  const enabled = useAppStore((state) => state.features.SAVED_SEARCHES_ENABLED);
  const accessToken = useAppStore((state) => state.accessToken);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [frequency, setFrequency] = useState<SavedSearchFrequency>('IMMEDIATE');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!enabled || !accessToken) {
    return null;
  }

  const submit = async () => {
    const title = name.trim() || defaultName;
    setStatus('saving');

    try {
      await apiClient.createSavedSearch({
        name: title,
        adType,
        query: sanitizeSavedSearchQuery(query),
        notificationFrequency: frequency,
        enabled: true
      });
      setStatus('saved');
      window.setTimeout(() => {
        setOpen(false);
        setStatus('idle');
      }, 900);
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <ActionButton type="button" variant="secondary" icon={<BellPlus size={18} />} onClick={() => setOpen(true)}>
        Сохранить поиск
      </ActionButton>

      {open ? (
        <div className="fixed inset-0 z-[170] bg-surface-950/82 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button className="absolute inset-0 h-full w-full cursor-default" type="button" aria-label="Закрыть" onClick={() => setOpen(false)} />
          <div className="app-fade-up absolute inset-x-3 bottom-[calc(90px_+_env(safe-area-inset-bottom))] mx-auto grid max-h-[calc(100dvh_-_120px_-_env(safe-area-inset-bottom))] max-w-md gap-4 overflow-y-auto rounded-panel border border-white/10 bg-surface-900 p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase text-accent-green">Подписка</p>
                <h2 className="mt-1 text-lg font-black text-text-primary">Сохранить поиск</h2>
              </div>
              <ActionButton variant="quiet" aria-label="Закрыть" icon={<X size={18} />} onClick={() => setOpen(false)} />
            </div>

            <Input name="savedSearchName" label="Название" value={name} onChange={(event) => setName(event.target.value)} />
            <Select
              name="savedSearchFrequency"
              label="Уведомления"
              value={frequency}
              options={frequencyOptions}
              onChange={(event) => setFrequency(event.target.value as SavedSearchFrequency)}
            />

            {status === 'error' ? (
              <p className="rounded-panel border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">
                Не удалось сохранить поиск.
              </p>
            ) : null}
            {status === 'saved' ? (
              <p className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-3 py-2 text-sm font-bold text-accent-green">
                Поиск сохранён.
              </p>
            ) : null}

            <ActionButton type="button" icon={<BellPlus size={18} />} disabled={status === 'saving'} onClick={() => void submit()}>
              {status === 'saving' ? 'Сохраняем' : 'Сохранить'}
            </ActionButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

function sanitizeSavedSearchQuery(query: Partial<VacancyListQuery>): Partial<VacancyListQuery> {
  return {
    q: query.q,
    category: query.category,
    district: query.district,
    priceFrom: query.priceFrom,
    priceTo: query.priceTo
  };
}
