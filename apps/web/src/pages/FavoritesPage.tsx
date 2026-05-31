import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SearchBar } from '../shared/ui/SearchBar.js';
import type { FavoriteItem } from '../features/ads/ad.types.js';

export function FavoritesPage() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const accessToken = useAppStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      setError('Нужно открыть mini app через MAX, чтобы увидеть избранное.');
      setStatus('error');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listFavorites()
      .then((response) => {
        if (!active) {
          return;
        }
        setItems(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        setError(getUserFacingError(requestError, 'favorites_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [accessToken, reloadKey]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return items;
    }

    return items.filter((item) =>
      [item.ad.title, item.ad.subtitle, item.ad.category, item.ad.locationShort]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [items, query]);

  const remove = async (adId: string) => {
    if (!accessToken) {
      return;
    }

    await apiClient.removeFavorite(adId);
    setItems((current) => current.filter((item) => item.ad.id !== adId));
  };

  return (
    <AppPage>
      <div className="space-y-2 app-fade-up">
        <h1 className="text-2xl font-black text-text-primary">Избранное</h1>
        <p className="text-sm leading-5 text-text-secondary">
          Сохраняйте вакансии и объявления, чтобы быстро вернуться к ним позже.
        </p>
      </div>

      <SearchBar
        placeholder="Поиск по сохранённым объявлениям"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Избранное не загрузилось"
          description={error ?? 'Попробуйте открыть раздел ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'Пока ничего не сохранено' : 'Ничего не нашлось'}
          description={
            items.length === 0
              ? 'Добавляйте интересные объявления в избранное, чтобы быстро находить их позже.'
              : 'Попробуйте изменить запрос или открыть главный экран.'
          }
          action={
            <LinkButton to={items.length === 0 ? '/' : '/'}>
              На главный экран
            </LinkButton>
          }
        />
      ) : null}

      {status === 'ready' && filtered.length > 0 ? (
        <section className="grid grid-cols-2 gap-2.5">
          {filtered.map((item) => (
            <AdCard
              key={item.favoriteId}
              variant="grid"
              to={getAdUrl(item.ad.type, item.ad.id)}
              typeLabel={typeLabel(item.ad.type)}
              title={item.ad.title}
              subtitle={item.ad.subtitle}
              coverImageUrl={item.ad.coverPhoto?.previewUrl ?? item.ad.coverPhoto?.url}
              coverMimeType={item.ad.coverPhoto?.mimeType}
              location={item.ad.locationShort}
              price={item.ad.shortSalary ?? undefined}
              category={item.ad.category}
              isFavorite
              onFavoriteClick={() => void remove(item.ad.id)}
            />
          ))}
        </section>
      ) : null}
    </AppPage>
  );
}

function typeLabel(type: string): string {
  if (type === 'resume') {
    return 'Резюме';
  }

  if (type === 'equipment') {
    return 'Техника';
  }

  if (type === 'material') {
    return 'Материалы';
  }

  if (type === 'tool') {
    return 'Инструменты';
  }

  return 'Вакансия';
}

function getAdUrl(type: string, adId: string): string {
  if (type === 'vacancy') {
    return `/vacancies/${adId}`;
  }

  if (type === 'resume') {
    return `/resumes/${adId}`;
  }

  if (type === 'equipment') {
    return `/equipment/${adId}`;
  }

  if (type === 'material') {
    return `/materials/${adId}`;
  }

  if (type === 'tool') {
    return `/tools/${adId}`;
  }

  return `/ads/${adId}`;
}
