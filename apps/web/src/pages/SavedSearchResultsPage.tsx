import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { PublicAdCard, VacancyListMeta } from '../features/vacancies/vacancy.types.js';
import { apiClient } from '../shared/api/client.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard, AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';

const PER_PAGE = 20;

export function SavedSearchResultsPage() {
  const { savedSearchId } = useParams();
  const [ads, setAds] = useState<PublicAdCard[]>([]);
  const [meta, setMeta] = useState<VacancyListMeta | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!savedSearchId) {
      setStatus('error');
      return;
    }

    let active = true;
    setStatus('loading');

    apiClient
      .getSavedSearchResults(savedSearchId, { page: 1, perPage: PER_PAGE })
      .then((response) => {
        if (!active) {
          return;
        }
        setAds(response.data);
        setMeta(response.meta ?? null);
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
  }, [reloadKey, savedSearchId]);

  return (
    <AppPage>
      <section className="grid gap-1">
        <p className="text-xs font-extrabold uppercase text-accent-green">Результаты</p>
        <h1 className="text-2xl font-black text-text-primary">Сохранённый поиск</h1>
        {meta ? <p className="text-sm font-bold text-text-secondary">Найдено: {meta.total}</p> : null}
      </section>

      {status === 'loading' ? (
        <section className="grid grid-cols-2 gap-2.5">
          <AdCardSkeleton variant="grid" />
          <AdCardSkeleton variant="grid" />
        </section>
      ) : null}

      {status === 'error' ? (
        <EmptyState
          title="Не удалось открыть поиск"
          description="Попробуйте обновить результаты."
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && ads.length === 0 ? (
        <EmptyState title="Пока нет результатов" description="Новые подходящие объявления появятся здесь после публикации." />
      ) : null}

      {ads.length > 0 ? (
        <section className="grid grid-cols-2 gap-2.5">
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              variant="grid"
              to={getAdPath(ad)}
              typeLabel={ad.type}
              title={ad.title}
              subtitle={ad.subtitle}
              coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
              coverMimeType={ad.coverPhoto?.mimeType}
              location={ad.locationShort}
              price={ad.shortSalary ?? undefined}
              category={ad.category}
              description={ad.description}
              chips={ad.chips.map((chip) => ({ key: chip.key, value: chip.value }))}
              promotion={ad.promotion}
            />
          ))}
        </section>
      ) : null}
    </AppPage>
  );
}

function getAdPath(ad: PublicAdCard): string {
  if (ad.type === 'vacancy') {
    return `/vacancies/${ad.id}`;
  }

  if (ad.type === 'resume') {
    return `/resumes/${ad.id}`;
  }

  return `/${ad.type === 'material' ? 'materials' : ad.type === 'tool' ? 'tools' : 'equipment'}/${ad.id}`;
}
