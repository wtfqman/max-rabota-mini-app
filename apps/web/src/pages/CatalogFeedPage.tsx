import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Hammer, Package, RefreshCw, SearchX, Wrench } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AdFiltersDrawer, type AdFiltersKind, type AdFiltersState } from '../features/ads/AdFiltersDrawer.js';
import type { PublicAdCard, VacancyListMeta, VacancyListQuery } from '../features/vacancies/vacancy.types.js';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient, type ApiEnvelope } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard, AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { FilterButton } from '../shared/ui/FilterButton.js';
import { SearchBar } from '../shared/ui/SearchBar.js';
import { StatChip } from '../shared/ui/StatChip.js';

const PER_PAGE = 8;

const feeds = {
  equipment: {
    title: 'Строительная техника',
    description: 'Спецтехника, аренда и предложения для объектов рядом с вами.',
    searchPlaceholder: 'Название техники, район или категория',
    typeLabel: 'Техника',
    emptyTitle: 'Техника пока не найдена',
    emptyDescription: 'Попробуйте изменить запрос или вернуться позже.',
    path: '/equipment',
    icon: Hammer,
    load: apiClient.listEquipment
  },
  materials: {
    title: 'Строительные материалы',
    description: 'Материалы для ремонта, стройки и снабжения объектов без лишней переписки.',
    searchPlaceholder: 'Материал, марка, район или категория',
    typeLabel: 'Материалы',
    emptyTitle: 'Материалов пока нет',
    emptyDescription: 'Скоро здесь появятся новые предложения. Можно попробовать другой запрос.',
    path: '/materials',
    icon: Package,
    load: apiClient.listMaterials
  },
  tools: {
    title: 'Инструменты',
    description: 'Ручной и электрический инструмент для строительных задач.',
    searchPlaceholder: 'Инструмент, бренд, район или категория',
    typeLabel: 'Инструменты',
    emptyTitle: 'Инструменты пока не найдены',
    emptyDescription: 'Попробуйте убрать поиск или посмотреть другие разделы.',
    path: '/tools',
    icon: Wrench,
    load: apiClient.listTools
  }
} satisfies Record<
  string,
  {
    title: string;
    description: string;
    searchPlaceholder: string;
    typeLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    path: string;
    icon: typeof Hammer;
    load: (query: VacancyListQuery) => Promise<ApiEnvelope<PublicAdCard[], VacancyListMeta>>;
  }
>;

type FeedKey = keyof typeof feeds;

const feedFilterKind: Record<FeedKey, AdFiltersKind> = {
  equipment: 'equipment',
  materials: 'material',
  tools: 'tool'
};

export function CatalogFeedPage({ feed }: { feed: FeedKey }) {
  const config = feeds[feed];
  const filterKind = feedFilterKind[feed];
  const Icon = config.icon;
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const page = readPage(searchParams);
  const filterKey = useMemo(() => buildFilterKey(filters), [filters]);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [ads, setAds] = useState<PublicAdCard[]>([]);
  const [meta, setMeta] = useState<VacancyListMeta | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loadingMore' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const accessToken = useAppStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) {
      setFavoriteIds(new Set());
      return;
    }

    apiClient
      .listFavorites()
      .then((response) => setFavoriteIds(new Set(response.data.map((item) => item.ad.id))))
      .catch(() => setFavoriteIds(new Set()));
  }, [accessToken]);

  useEffect(() => {
    setSearchValue(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (!filterNotice) {
      return;
    }

    const timer = window.setTimeout(() => setFilterNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [filterNotice]);

  useEffect(() => {
    let isActive = true;
    const isFirstPage = page === 1;

    setStatus(isFirstPage ? 'loading' : 'loadingMore');
    setError(null);

    config
      .load({
        q: filters.q,
        category: filters.category,
        district: filters.district,
        priceFrom: filters.priceFrom,
        priceTo: filters.priceTo,
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
  }, [config, filterKey, page, reloadKey]);

  const activeFilterCount = [filters.category, filters.district, filters.priceFrom, filters.priceTo].filter(Boolean).length;
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
    writeParam(next, 'priceFrom', merged.priceFrom);
    writeParam(next, 'priceTo', merged.priceTo);
    next.set('page', '1');
    setSearchParams(next);
  };

  const resetFilters = () => {
    setFiltersOpen(false);
    setFilterNotice('Фильтры сброшены');
    setSearchParams(new URLSearchParams());
  };

  const handleLoadMore = () => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page + 1));
    setSearchParams(next);
  };

  const toggleFavorite = (adId: string) => {
    if (!accessToken) {
      return;
    }

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
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-accent-greenSoft text-accent-green">
            <Icon size={21} />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-text-primary">{config.title}</h1>
            <p className="text-sm leading-5 text-text-secondary">{config.description}</p>
          </div>
        </div>

        <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={handleSearch}>
          <SearchBar
            value={searchValue}
            placeholder={config.searchPlaceholder}
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <ActionButton type="submit">Найти</ActionButton>
        </form>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            className="min-h-11 rounded-panel border border-white/10 bg-surface-900/92 px-3 text-left text-sm font-bold text-text-secondary transition hover:border-accent-green/45 hover:text-text-primary"
            onClick={() => applyQuery({ q: '' })}
          >
            {filters.q ? `Ищем: ${filters.q}` : meta ? `Найдено: ${meta.total}` : 'Свежие предложения'}
          </button>
          <FilterButton
            type="button"
            aria-label={activeFilterCount ? `Открыть фильтры, выбрано ${activeFilterCount}` : 'Открыть фильтры'}
            onClick={() => setFiltersOpen(true)}
          />
        </div>

        <ActiveFilterChips filters={filters} onClear={(key) => applyQuery({ [key]: '' })} />

        {filterNotice ? (
          <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-3 py-2 text-sm font-semibold text-accent-green">
            {filterNotice}
          </p>
        ) : null}
      </section>

      {isInitialLoading ? (
        <section className="grid grid-cols-2 gap-2.5" aria-label="Загрузка объявлений">
          <AdCardSkeleton variant="grid" />
          <AdCardSkeleton variant="grid" />
          <AdCardSkeleton variant="grid" />
        </section>
      ) : null}

      {status === 'error' && ads.length === 0 ? (
        <EmptyState
          title="Не получилось загрузить раздел"
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
          title={config.emptyTitle}
          description={config.emptyDescription}
          action={
            <ActionButton variant="secondary" icon={<SearchX size={18} />} onClick={resetFilters}>
              Сбросить фильтры
            </ActionButton>
          }
        />
      ) : null}

      {ads.length > 0 ? (
        <section className="grid grid-cols-2 gap-2.5" aria-label={config.title}>
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              variant="grid"
              to={`${config.path}/${ad.id}`}
              typeLabel={config.typeLabel}
              title={ad.title}
              subtitle={ad.subtitle}
              coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
              coverMimeType={ad.coverPhoto?.mimeType}
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
          {hasMore ? (
            <ActionButton type="button" variant="secondary" disabled={isLoadingMore} onClick={handleLoadMore}>
              {isLoadingMore ? 'Загружаем ещё...' : 'Показать ещё'}
            </ActionButton>
          ) : (
            <p className="text-center text-sm text-text-muted">Это все объявления по текущему запросу.</p>
          )}
        </div>
      ) : null}

      <AdFiltersDrawer
        open={filtersOpen}
        kind={filterKind}
        filters={filters}
        onClose={() => setFiltersOpen(false)}
        onReset={resetFilters}
        onApply={(nextFilters: AdFiltersState) => {
          setFiltersOpen(false);
          setFilterNotice('Фильтры применены');
          applyQuery(nextFilters);
        }}
      />
    </AppPage>
  );
}

function ActiveFilterChips({
  filters,
  onClear
}: {
  filters: ReturnType<typeof readFilters>;
  onClear: (key: keyof ReturnType<typeof readFilters>) => void;
}) {
  const chips = [
    { key: 'category', label: filters.category },
    { key: 'district', label: filters.district },
    { key: 'priceFrom', label: filters.priceFrom ? `от ${formatMoney(filters.priceFrom)} ₽` : '' },
    { key: 'priceTo', label: filters.priceTo ? `до ${formatMoney(filters.priceTo)} ₽` : '' }
  ].filter((chip) => chip.label);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button key={chip.key} type="button" onClick={() => onClear(chip.key as keyof ReturnType<typeof readFilters>)}>
          <StatChip label={chip.label} tone="green" />
        </button>
      ))}
    </div>
  );
}

function readFilters(searchParams: URLSearchParams) {
  return {
    q: searchParams.get('q') ?? '',
    category: searchParams.get('category') ?? '',
    district: searchParams.get('district') ?? '',
    schedule: '',
    experience: '',
    priceFrom: searchParams.get('priceFrom') ?? '',
    priceTo: searchParams.get('priceTo') ?? ''
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
  return [filters.q, filters.category, filters.district, filters.priceFrom, filters.priceTo].join('|');
}

function formatMoney(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function mergeAds(current: PublicAdCard[], next: PublicAdCard[]): PublicAdCard[] {
  const ids = new Set(current.map((ad) => ad.id));
  return [...current, ...next.filter((ad) => !ids.has(ad.id))];
}
