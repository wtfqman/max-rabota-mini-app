import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, Phone, RefreshCw, Star } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import type { PublicAdContact } from '../features/vacancies/vacancy.types.js';
import type { PublicAdDetail, ReviewItem } from '../features/ads/ad.types.js';

export function AdDetailsPage() {
  const { adId } = useParams();
  const [ad, setAd] = useState<PublicAdDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
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

        if (response.data.type === 'resume') {
          void apiClient
            .listUserReviews(response.data.owner.id)
            .then((reviewsResponse) => {
              if (active) {
                setReviews(reviewsResponse.data);
              }
            })
            .catch(() => {
              if (active) {
                setReviews([]);
              }
            });
        } else {
          setReviews([]);
        }
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
      <Link to={getBackUrl(ad.type)} className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
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
        <SectionCard title={ad.type === 'resume' ? 'О себе' : 'Описание'}>
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{ad.description}</p>
        </SectionCard>
      ) : null}

      {ad.type === 'resume' ? <ResumeReviews reviews={reviews} /> : null}

      {ad.type === 'equipment' ? (
        <SectionCard title="Детали техники">
          <DetailGrid
            items={[
              ['Категория', ad.equipment.category],
              ['Марка', ad.equipment.brand],
              ['Модель', ad.equipment.model],
              ['Год', ad.equipment.productionYear ? String(ad.equipment.productionYear) : null]
            ]}
          />
        </SectionCard>
      ) : null}

      {ad.type === 'material' || ad.type === 'tool' ? (
        <SectionCard title="Детали объявления">
          <DetailGrid
            items={[
              ['Категория', ad.product.category],
              ['Цена', ad.product.price ? `${ad.product.price} ${ad.product.currency}` : null],
              ['Адрес', ad.product.address]
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Контакты">
        {ad.contacts.length ? (
          <div className="grid gap-2">
            {ad.contacts.map((contact) => (
              <a
                key={contact.id}
                href={getContactHref(contact)}
                className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35 active:scale-[0.985]"
              >
                <Phone size={18} className="shrink-0 text-accent-green" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type}</p>
                  <p className="truncate text-sm text-text-secondary">{contact.value}</p>
                </div>
              </a>
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
    return 'Строительная техника';
  }

  if (type === 'material') {
    return 'Строительные материалы';
  }

  if (type === 'tool') {
    return 'Инструменты';
  }

  return 'Вакансия';
}

function getBackUrl(type: string): string {
  if (type === 'resume') {
    return '/resumes';
  }

  if (type === 'equipment') {
    return '/equipment';
  }

  if (type === 'material') {
    return '/materials';
  }

  if (type === 'tool') {
    return '/tools';
  }

  return '/vacancies';
}

function getContactHref(contact: PublicAdContact): string {
  if (contact.type === 'phone') {
    return `tel:${contact.value.replace(/[^\d+]/g, '')}`;
  }

  if (contact.type === 'email') {
    return `mailto:${contact.value}`;
  }

  if (contact.type === 'website') {
    return contact.value.startsWith('http') ? contact.value : `https://${contact.value}`;
  }

  return '#';
}

function DetailGrid({ items }: { items: Array<[string, string | null]> }) {
  const visible = items.filter((item): item is [string, string] => Boolean(item[1]));

  if (!visible.length) {
    return <p className="text-sm text-text-secondary">Подробности указаны в описании.</p>;
  }

  return (
    <div className="grid gap-2">
      {visible.map(([label, value]) => (
        <div key={label} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
          <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ResumeReviews({ reviews }: { reviews: ReviewItem[] }) {
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;

  return (
    <SectionCard title="Отзывы" description="Небольшой сигнал доверия без лишней перегрузки.">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatChip
            label={average ? `${average.toFixed(1)} из 5` : 'Отзывов пока нет'}
            tone="green"
            icon={<Star size={15} />}
          />
          {reviews.length ? <StatChip label={`${reviews.length} отзывов`} /> : null}
        </div>
        {reviews.slice(0, 2).map((review) => (
          <div key={review.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
            <div className="mb-1 flex items-center gap-1 text-accent-green">
              {Array.from({ length: review.rating }).map((_, index) => (
                <Star key={index} size={14} className="fill-accent-green" />
              ))}
            </div>
            {review.text ? <p className="text-sm leading-6 text-text-secondary">{review.text}</p> : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
