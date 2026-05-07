import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import type { PublicAdDetail } from '../features/ads/ad.types.js';

export function AdDetailsPage() {
  const { adId } = useParams();
  const [ad, setAd] = useState<PublicAdDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!adId) {
      setStatus('error');
      setError('Объявление не найдено.');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getAdDetails(adId)
      .then((response) => {
        if (!active) {
          return;
        }
        setAd(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        setError(getUserFacingError(requestError, 'ad_load'));
        setStatus('error');
      });

    apiClient
      .listFavorites()
      .then((response) => setIsFavorite(response.data.some((item) => item.ad.id === adId)))
      .catch(() => setIsFavorite(false));

    return () => {
      active = false;
    };
  }, [adId, reloadKey]);

  const toggleFavorite = async () => {
    if (!ad) {
      return;
    }

    const previous = isFavorite;
    setIsFavorite(!previous);

    try {
      if (previous) {
        await apiClient.removeFavorite(ad.id);
      } else {
        await apiClient.addFavorite(ad.id);
      }
    } catch {
      setIsFavorite(previous);
    }
  };

  if (status === 'loading') {
    return (
      <AppPage>
        <LoadingState />
      </AppPage>
    );
  }

  if (status === 'error' || !ad) {
    return (
      <AppPage>
        <EmptyState
          title="Не удалось открыть объявление"
          description={error ?? 'Попробуйте вернуться назад и открыть его ещё раз.'}
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
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <ArrowLeft size={17} />
        Назад
      </Link>

      <section className="overflow-hidden rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.98),rgba(10,15,13,0.98))] shadow-glow app-fade-up">
        {ad.coverPhoto ? (
          <img src={ad.coverPhoto.previewUrl ?? ad.coverPhoto.url} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : null}
        <div className="grid gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-green">{typeLabel(ad.type)}</p>
              <h1 className="text-3xl font-black text-text-primary">{ad.title}</h1>
              {ad.subtitle ? <p className="text-base text-text-secondary">{ad.subtitle}</p> : null}
            </div>
            <ActionButton
              variant="secondary"
              aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              icon={<Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={19} />}
              onClick={() => void toggleFavorite()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ad.category ? <StatChip label={ad.category} tone="green" /> : null}
            {ad.locationShort ? <StatChip label={ad.locationShort} tone="cyan" /> : null}
            {ad.shortSalary ? <StatChip label={ad.shortSalary} /> : null}
          </div>
        </div>
      </section>

      {ad.description ? (
        <SectionCard title="Описание">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{ad.description}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Контакты">
        {ad.contacts.length ? (
          <div className="grid gap-2">
            {ad.contacts.map((contact) => (
              <div key={contact.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type}</p>
                <p className="text-sm text-text-secondary">{contact.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Контакты пока не указаны.</p>
        )}
      </SectionCard>
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
