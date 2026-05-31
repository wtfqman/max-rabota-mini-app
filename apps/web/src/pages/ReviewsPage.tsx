import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Star } from 'lucide-react';
import type { ReviewItem } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { SectionCard } from '../shared/ui/SectionCard.js';

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const average = useMemo(() => getAverageRating(reviews), [reviews]);

  const loadReviews = () => {
    setStatus('loading');
    setError(null);

    apiClient
      .listMyReviews()
      .then((response) => {
        setReviews(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        setError(getUserFacingError(requestError, 'reviews_load'));
        setStatus('error');
      });
  };

  useEffect(() => {
    loadReviews();
  }, []);

  if (status === 'loading') {
    return (
      <AppPage>
        <SectionCard title="Отзывы" description="Здесь собраны отзывы, которые оставили вам по опубликованным объявлениям.">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <Loader2 className="animate-spin text-accent-green" size={18} />
            Загружаем отзывы...
          </div>
        </SectionCard>
      </AppPage>
    );
  }

  if (status === 'error') {
    return (
      <AppPage>
        <EmptyState
          title="Не удалось загрузить отзывы"
          description={error ?? 'Попробуйте обновить раздел ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={loadReviews}>
              Обновить
            </ActionButton>
          }
        />
      </AppPage>
    );
  }

  if (reviews.length === 0) {
    return (
      <AppPage>
        <EmptyState
          title="Отзывов пока нет"
          description="Отзывы появляются после того, как другой пользователь откроет опубликованное объявление и оставит оценку владельцу. Самому себе отзыв оставить нельзя."
          action={
            <LinkButton to="/my-ads" variant="secondary">
              Мои объявления
            </LinkButton>
          }
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <SectionCard title="Отзывы" description="Отзывы привязаны к объявлениям и защищены от дублей.">
        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-panel border border-white/8 bg-surface-900/92 p-3">
            <div>
              <p className="text-sm font-bold text-text-primary">Ваш рейтинг</p>
              <p className="text-xs text-text-muted">{reviews.length} отзыв(ов)</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-greenSoft px-3 py-2 text-sm font-black text-accent-green">
              <Star size={16} className="fill-accent-green" />
              {average ? average.toFixed(1) : '0.0'}
            </div>
          </div>

          <div className="grid gap-2">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-text-primary">{review.author.displayName ?? review.author.maxUsername ?? 'Пользователь'}</p>
                    {review.ad ? <p className="truncate text-xs text-text-muted">{review.ad.title}</p> : null}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-xs font-black text-accent-green">
                    <Star size={13} className="fill-accent-green" /> {review.rating}
                  </span>
                </div>
                {review.text ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-text-secondary">{review.text}</p> : null}
                <p className="mt-3 text-xs text-text-muted">{formatDate(review.createdAt)}</p>
              </article>
            ))}
          </div>
        </div>
      </SectionCard>
    </AppPage>
  );
}

function getAverageRating(reviews: ReviewItem[]): number | null {
  if (!reviews.length) {
    return null;
  }

  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}
