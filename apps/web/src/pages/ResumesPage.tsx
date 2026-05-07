import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RefreshCw, SearchX } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { PublicAdCard, VacancyListMeta } from '../features/vacancies/vacancy.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard, AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { SearchBar } from '../shared/ui/SearchBar.js';
import { StatChip } from '../shared/ui/StatChip.js';

const PER_PAGE = 8;

export function ResumesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const page = readPage(searchParams);
  const filterKey = useMemo(() => buildFilterKey(filters), [filters]);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [ads, setAds] = useState<PublicAdCard[]>([]);
  const [meta, setMeta] = useState<VacancyListMeta | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loadingMore' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    apiClient
      .listFavorites()
      .then((response) => {
        setFavoriteIds(new Set(response.data.map((item) => item.ad.id)));
      })
      .catch(() => {
        setFavoriteIds(new Set());
      });
  }, []);

  useEffect(() => {
    setSearchValue(filters.q);
  }, [filters.q]);

  useEffect(() => {
    let isActive = true;
    const isFirstPage = page === 1;

    setStatus(isFirstPage ? 'loading' : 'loadingMore');
    setError(null);

    apiClient
      .listResumes({
        q: filters.q,
        category: filters.category,
        district: filters.district,
        page,
        perPage: PER_PAGE
      })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setMeta(response.meta ?? null);
        setAds((current) => (isFirstPage ? response.data : mergeAds(current, response.data)));
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        setError(getUserFacingError(requestError, 'vacancies_load'));
        setStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [filterKey, page, reloadKey]);

  const hasMore = Boolean(meta && meta.page < meta.totalPages);
  const isInitialLoading = status === 'loading' && ads.length === 0;
  const isLoadingMore = status === 'loadingMore';

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyQuery({ q: searchValue.trim() });
  };

  const applyQuery = (nextValues: Partial<ReturnType<typeof readFilters>>) => {
    const next = new URLSearchParams(searchParams);
    const merged = {
      ...filters,
      ...nextValues
    };

    writeParam(next, 'q', merged.q);
    writeParam(next, 'category', merged.category);
    writeParam(next, 'district', merged.district);
    next.set('page', '1');
    setSearchParams(next);
  };

  const handleLoadMore = () => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page + 1));
    setSearchParams(next);
  };

  const resetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const toggleFavorite = (adId: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);

      if (next.has(adId)) {
        next.delete(adId);
        void apiClient.removeFavorite(adId).catch(() => setFavoriteIds(current));
      } else {
        next.add(adId);
        void apiClient.addFavorite(adId).catch(() => setFavoriteIds(current));
      }

      return next;
    });
  };

  return (
    <AppPage>
      <section className="space-y-3 app-fade-up">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase text-accent-green">Rabst24</p>
          <h1 className="text-3xl font-black text-text-primary">Резюме</h1>
          <p className="text-base leading-6 text-text-secondary">
            Смотрите анкеты специалистов, ищите по роли, району и ключевым словам. Здесь только
            понятные карточки и быстрый поиск без лишних служебных деталей.
          </p>
        </div>

        <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={handleSearch}>
          <SearchBar
            value={searchValue}
            placeholder="Профессия, имя или ключевое слово"
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <ActionButton type="submit">Найти</ActionButton>
        </form>

        <div className="flex flex-wrap gap-2">
          {filters.q ? <StatChip label={`Поиск: ${filters.q}`} tone="green" /> : null}
          {filters.category ? <StatChip label={filters.category} tone="cyan" /> : null}
          {filters.district ? <StatChip label={filters.district} tone="cyan" /> : null}
          {!filters.q && !filters.category && !filters.district ? (
            <StatChip label={meta ? `Найдено резюме: ${meta.total}` : 'Свежая база специалистов'} />
          ) : null}
        </div>
      </section>

      {isInitialLoading ? (
        <section className="space-y-3" aria-label="Загрузка резюме">
          <AdCardSkeleton />
          <AdCardSkeleton />
          <AdCardSkeleton />
        </section>
      ) : null}

      {status === 'error' && ads.length === 0 ? (
        <EmptyState
          title="Не получилось загрузить резюме"
          description={error ?? 'Попробуйте обновить список ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {!isInitialLoading && status !== 'error' && ads.length === 0 ? (
        <EmptyState
          title="Пока нет подходящих резюме"
          description="Попробуйте уточнить запрос или убрать часть условий поиска. Новые анкеты появятся здесь автоматически."
          action={
            <ActionButton variant="secondary" icon={<SearchX size={18} />} onClick={resetFilters}>
              Сбросить поиск
            </ActionButton>
          }
        />
      ) : null}

      {ads.length > 0 ? (
        <section className="space-y-3" aria-label="Список резюме">
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              to={`/resumes/${ad.id}`}
              typeLabel="Резюме"
              title={ad.title}
              subtitle={ad.subtitle}
              coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
              location={ad.locationShort}
              price={ad.shortSalary ?? undefined}
              category={ad.category}
              description={ad.description}
              chips={ad.chips.map((chip) => ({ key: chip.key, value: chip.value }))}
              isFavorite={favoriteIds.has(ad.id)}
              onFavoriteClick={() => toggleFavorite(ad.id)}
            />
          ))}
        </section>
      ) : null}

      {ads.length > 0 ? (
        <div className="grid gap-3">
          {status === 'error' ? (
            <div className="rounded-panel border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Часть данных не обновилась с первого раза. Попробуйте загрузить список ещё раз.
            </div>
          ) : null}
          {hasMore ? (
            <ActionButton type="button" variant="secondary" disabled={isLoadingMore} onClick={handleLoadMore}>
              {isLoadingMore ? 'Загружаем ещё...' : 'Показать ещё'}
            </ActionButton>
          ) : (
            <p className="text-center text-sm text-text-muted">Вы просмотрели все резюме по текущему запросу.</p>
          )}
        </div>
      ) : null}
    </AppPage>
  );
}

function readFilters(searchParams: URLSearchParams) {
  return {
    q: searchParams.get('q') ?? '',
    category: searchParams.get('category') ?? '',
    district: searchParams.get('district') ?? ''
  };
}

function readPage(searchParams: URLSearchParams): number {
  const page = Number(searchParams.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function writeParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim()) {
    params.set(key, value.trim());
  } else {
    params.delete(key);
  }
}

function buildFilterKey(filters: ReturnType<typeof readFilters>): string {
  return [filters.q, filters.category, filters.district].join('|');
}

function mergeAds(current: PublicAdCard[], next: PublicAdCard[]): PublicAdCard[] {
  const ids = new Set(current.map((ad) => ad.id));
  return [...current, ...next.filter((ad) => !ids.has(ad.id))];
}
