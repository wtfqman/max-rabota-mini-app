import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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

  useEffect(() => {
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
  }, [reloadKey]);

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
    await apiClient.removeFavorite(adId);
    setItems((current) => current.filter((item) => item.ad.id !== adId));
  };

  return (
    <AppPage>
      <div className="space-y-2 app-fade-up">
        <h1 className="text-3xl font-black text-text-primary">Избранное</h1>
        <p className="text-base leading-6 text-text-secondary">
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
              : 'Попробуйте изменить запрос или откройте вакансии без поиска.'
          }
          action={
            <LinkButton to={items.length === 0 ? '/vacancies' : '/'}>
              {items.length === 0 ? 'Перейти к вакансиям' : 'На главный экран'}
            </LinkButton>
          }
        />
      ) : null}

      {status === 'ready' && filtered.length > 0 ? (
        <section className="space-y-3">
          {filtered.map((item) => (
            <AdCard
              key={item.favoriteId}
              to={item.ad.type === 'vacancy' ? `/vacancies/${item.ad.id}` : `/ads/${item.ad.id}`}
              typeLabel={typeLabel(item.ad.type)}
              title={item.ad.title}
              subtitle={item.ad.subtitle}
              coverImageUrl={item.ad.coverPhoto?.previewUrl ?? item.ad.coverPhoto?.url}
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

  return 'Вакансия';
}
