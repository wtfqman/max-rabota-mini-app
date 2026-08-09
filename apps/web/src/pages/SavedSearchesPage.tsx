import { useEffect, useState } from 'react';
import { ExternalLink, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SavedSearch, SavedSearchFrequency } from '../features/saved-searches/saved-search.types.js';
import { apiClient } from '../shared/api/client.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { Select } from '../shared/ui/Select.js';

const frequencyOptions = [
  { value: 'IMMEDIATE', label: 'Сразу' },
  { value: 'DAILY', label: 'Раз в день' },
  { value: 'OFF', label: 'Без уведомлений' }
];

type FilterKey =
  | 'q'
  | 'city'
  | 'district'
  | 'category'
  | 'priceFrom'
  | 'priceTo';

interface EditingState {
  id: string;
  name: string;
  notificationFrequency: SavedSearchFrequency;
  enabled: boolean;
  filters: Record<FilterKey, string>;
  status: 'idle' | 'saving' | 'error';
}

const commonFilterFields: Array<{ key: FilterKey; label: string; type?: string }> = [
  { key: 'q', label: 'Поисковая строка' },
  { key: 'city', label: 'Город' },
  { key: 'district', label: 'Район' }
];

const categoryFilterFields: Record<SavedSearch['adType'], Array<{ key: FilterKey; label: string; type?: string }>> = {
  vacancy: [
    { key: 'category', label: 'Должность / категория' },
    { key: 'priceFrom', label: 'Зарплата от', type: 'number' },
    { key: 'priceTo', label: 'Зарплата до', type: 'number' }
  ],
  resume: [
    { key: 'category', label: 'Профессия' },
    { key: 'priceFrom', label: 'Зарплата от', type: 'number' },
    { key: 'priceTo', label: 'Зарплата до', type: 'number' }
  ],
  equipment: [
    { key: 'category', label: 'Тип техники' },
    { key: 'priceFrom', label: 'Цена от', type: 'number' },
    { key: 'priceTo', label: 'Цена до', type: 'number' }
  ],
  material: [
    { key: 'category', label: 'Категория материала' },
    { key: 'priceFrom', label: 'Цена от', type: 'number' },
    { key: 'priceTo', label: 'Цена до', type: 'number' }
  ],
  tool: [
    { key: 'category', label: 'Категория инструмента' },
    { key: 'priceFrom', label: 'Цена от', type: 'number' },
    { key: 'priceTo', label: 'Цена до', type: 'number' }
  ]
};

export function SavedSearchesPage() {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');

    apiClient
      .listSavedSearches()
      .then((response) => {
        if (!active) {
          return;
        }
        setItems(response.data);
        setStatus('ready');
      })
      .catch(() => {
        if (active) {
          setStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const updateSearch = async (
    item: SavedSearch,
    patch: Partial<Pick<SavedSearch, 'name' | 'enabled' | 'notificationFrequency'>> & {
      query?: Partial<SavedSearch['query']>;
    }
  ) => {
    const response = await apiClient.updateSavedSearch(item.id, patch);
    setItems((current) => current.map((search) => (search.id === item.id ? response.data : search)));
    return response.data;
  };

  const deleteSearch = async (item: SavedSearch) => {
    await apiClient.deleteSavedSearch(item.id);
    setItems((current) => current.filter((search) => search.id !== item.id));
  };

  const startEditing = (item: SavedSearch) => {
    setEditing({
      id: item.id,
      name: item.name,
      notificationFrequency: item.notificationFrequency,
      enabled: item.enabled,
      filters: createFilterDraft(item),
      status: 'idle'
    });
  };

  const saveEditing = async () => {
    if (!editing) {
      return;
    }

    const item = items.find((search) => search.id === editing.id);
    if (!item) {
      setEditing(null);
      return;
    }

    setEditing({ ...editing, status: 'saving' });

    try {
      await updateSearch(item, {
        name: editing.name.trim() || item.name,
        enabled: editing.enabled,
        notificationFrequency: editing.notificationFrequency,
        query: buildFilterPayload(editing.filters)
      });
      setEditing(null);
    } catch {
      setEditing((current) => (current ? { ...current, status: 'error' } : current));
    }
  };

  if (status === 'loading') {
    return (
      <AppPage>
        <LoadingState />
      </AppPage>
    );
  }

  if (status === 'error') {
    return (
      <AppPage>
        <EmptyState
          title="Поиски недоступны"
          description="Попробуйте обновить список."
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <section className="grid gap-1">
        <p className="text-xs font-extrabold uppercase text-accent-green">Подписки</p>
        <h1 className="text-2xl font-black text-text-primary">Сохранённые поиски</h1>
      </section>

      {items.length ? (
        <section className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="grid gap-3 rounded-panel border border-white/10 bg-surface-900/92 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black text-text-primary">{item.name}</h2>
                  <p className="mt-1 text-xs font-bold uppercase text-text-muted">{getTypeLabel(item.adType)}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-black text-text-secondary">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) => void updateSearch(item, { enabled: event.target.checked })}
                    className="h-5 w-5 accent-accent-green"
                  />
                  Вкл
                </label>
              </div>

              <FilterSummary item={item} />

              <Select
                name={`frequency-${item.id}`}
                label="Частота"
                value={item.notificationFrequency}
                options={frequencyOptions}
                onChange={(event) =>
                  void updateSearch(item, {
                    notificationFrequency: event.target.value as SavedSearchFrequency
                  })
                }
              />

              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/saved-searches/${item.id}/results`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-panel border border-accent-green/30 bg-accent-greenSoft px-3 text-sm font-black text-accent-green"
                >
                  <ExternalLink size={16} />
                  Открыть
                </Link>
                <ActionButton variant="secondary" icon={<Pencil size={16} />} onClick={() => startEditing(item)}>
                  Изменить
                </ActionButton>
                <ActionButton variant="danger" icon={<Trash2 size={16} />} onClick={() => void deleteSearch(item)}>
                  Удалить
                </ActionButton>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="Поисков пока нет" description="Сохраните нужные фильтры на странице вакансий, резюме, техники, материалов или инструментов." />
      )}
      {editing ? (
        <SavedSearchEditor
          item={items.find((search) => search.id === editing.id)}
          editing={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => void saveEditing()}
        />
      ) : null}
    </AppPage>
  );
}

function SavedSearchEditor({
  item,
  editing,
  onChange,
  onClose,
  onSave
}: {
  item: SavedSearch | undefined;
  editing: EditingState;
  onChange: (next: EditingState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!item) {
    return null;
  }

  const fields = [...commonFilterFields, ...categoryFilterFields[item.adType]];

  return (
    <div className="fixed inset-0 z-[170] bg-surface-950/82 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button className="absolute inset-0 h-full w-full cursor-default" type="button" aria-label="Закрыть" onClick={onClose} />
      <div className="app-fade-up absolute inset-x-3 top-10 mx-auto max-h-[86vh] max-w-md overflow-y-auto rounded-panel border border-white/10 bg-surface-900 p-4 shadow-panel">
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase text-accent-green">{getTypeLabel(item.adType)}</p>
              <h2 className="mt-1 text-lg font-black text-text-primary">Изменить поиск</h2>
            </div>
            <ActionButton variant="quiet" aria-label="Закрыть" icon={<X size={18} />} onClick={onClose} />
          </div>

          <Input
            name="savedSearchEditName"
            label="Название"
            value={editing.name}
            onChange={(event) => onChange({ ...editing, name: event.target.value })}
          />

          <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-850/60 p-3">
            <label className="flex items-center gap-2 text-sm font-black text-text-secondary">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(event) => onChange({ ...editing, enabled: event.target.checked })}
                className="h-5 w-5 accent-accent-green"
              />
              Поиск включён
            </label>
            <Select
              name="savedSearchEditFrequency"
              label="Частота"
              value={editing.notificationFrequency}
              options={frequencyOptions}
              onChange={(event) =>
                onChange({
                  ...editing,
                  notificationFrequency: event.target.value as SavedSearchFrequency
                })
              }
            />
          </div>

          <div className="grid gap-3">
            {fields.map((field) => (
              <Input
                key={field.key}
                name={`saved-search-${field.key}`}
                label={field.label}
                type={field.type ?? 'text'}
                min={field.type === 'number' ? 0 : undefined}
                value={editing.filters[field.key]}
                onChange={(event) =>
                  onChange({
                    ...editing,
                    filters: {
                      ...editing.filters,
                      [field.key]: event.target.value
                    }
                  })
                }
              />
            ))}
          </div>

          {editing.status === 'error' ? (
            <p className="rounded-panel border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-200">
              Не удалось сохранить изменения.
            </p>
          ) : null}

          <ActionButton type="button" icon={<Save size={18} />} disabled={editing.status === 'saving'} onClick={onSave}>
            {editing.status === 'saving' ? 'Сохраняем' : 'Сохранить'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function FilterSummary({ item }: { item: SavedSearch }) {
  const labels = new Map([...commonFilterFields, ...categoryFilterFields[item.adType]].map((field) => [field.key, field.label]));
  const allowedKeys = new Set(labels.keys());
  const filters = Object.entries(item.canonicalFilters)
    .filter(([key, value]) => allowedKeys.has(key as FilterKey) && value !== undefined && value !== '')
    .map(([key, value]) => `${labels.get(key as FilterKey) ?? key}: ${String(value)}`);

  if (filters.length === 0) {
    return <p className="text-sm font-semibold text-text-muted">Без фильтров</p>;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {filters.map((filter) => (
        <span key={filter} className="shrink-0 rounded-full border border-white/10 bg-surface-850 px-3 py-1 text-xs font-bold text-text-secondary">
          {filter}
        </span>
      ))}
    </div>
  );
}

function createFilterDraft(item: SavedSearch): Record<FilterKey, string> {
  return {
    q: stringifyFilterValue(item.canonicalFilters.q),
    city: stringifyFilterValue(item.canonicalFilters.city),
    district: stringifyFilterValue(item.canonicalFilters.district),
    category: stringifyFilterValue(item.canonicalFilters.category),
    priceFrom: stringifyFilterValue(item.canonicalFilters.priceFrom),
    priceTo: stringifyFilterValue(item.canonicalFilters.priceTo)
  };
}

function buildFilterPayload(filters: Record<FilterKey, string>): Partial<SavedSearch['query']> {
  const allowedKeys: FilterKey[] = ['q', 'city', 'district', 'category', 'priceFrom', 'priceTo'];
  return Object.fromEntries(allowedKeys.map((key) => [key, filters[key]]).filter(([, value]) => value.trim() !== '')) as Partial<SavedSearch['query']>;
}

function stringifyFilterValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function getTypeLabel(type: SavedSearch['adType']): string {
  const labels: Record<SavedSearch['adType'], string> = {
    vacancy: 'Вакансии',
    resume: 'Резюме',
    equipment: 'Техника',
    material: 'Материалы',
    tool: 'Инструменты'
  };

  return labels[type];
}
