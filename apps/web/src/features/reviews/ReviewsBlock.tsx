import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Star } from 'lucide-react';
import { useAppStore } from '../../app/store/app-store.js';
import type { ReviewItem } from '../ads/ad.types.js';
import { apiClient } from '../../shared/api/client.js';
import { getUserFacingError } from '../../shared/api/user-facing.js';
import { ActionButton } from '../../shared/ui/ActionButton.js';
import { SectionCard } from '../../shared/ui/SectionCard.js';

interface ReviewsBlockProps {
  subjectUserId: string;
  adId: string;
  adTitle: string;
}

export function ReviewsBlock({ subjectUserId, adId, adTitle }: ReviewsBlockProps) {
  const currentUserId = useAppStore((state) => state.user.id);
  const accessToken = useAppStore((state) => state.accessToken);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canWriteReview = Boolean(accessToken && currentUserId && currentUserId !== subjectUserId);
  const averageRating = useMemo(() => getAverageRating(reviews), [reviews]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listUserReviews(subjectUserId)
      .then((response) => {
        if (!active) {
          return;
        }

        setReviews(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'reviews_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [subjectUserId]);

  const submitReview = async () => {
    if (!canWriteReview || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await apiClient.createReview(subjectUserId, {
        adId,
        rating,
        text: text.trim() || undefined
      });
      const response = await apiClient.listUserReviews(subjectUserId);
      setReviews(response.data);
      setText('');
      setRating(5);
    } catch (requestError) {
      setSubmitError(getUserFacingError(requestError, 'review_submit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Отзывы"
      description="Отзывы привязаны к конкретному опубликованному объявлению. Один пользователь может оставить один отзыв по одному объявлению."
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3">
          <div>
            <p className="text-sm font-bold text-text-primary">Рейтинг владельца</p>
            <p className="text-xs text-text-muted">{reviews.length ? `${reviews.length} отзыв(ов)` : 'Пока нет отзывов'}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-greenSoft px-3 py-2 text-sm font-black text-accent-green">
            <Star size={16} className="fill-accent-green" />
            {averageRating ? averageRating.toFixed(1) : '0.0'}
          </div>
        </div>

        {status === 'loading' ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
            <Loader2 className="animate-spin text-accent-green" size={18} />
            Загружаем отзывы...
          </div>
        ) : null}

        {status === 'error' ? <p className="text-sm font-semibold text-red-100">{error}</p> : null}

        {status === 'ready' && reviews.length > 0 ? (
          <div className="grid gap-2">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-text-primary">{review.author.displayName ?? review.author.maxUsername ?? 'Пользователь'}</p>
                    <p className="truncate text-xs text-text-muted">{review.ad?.title ?? adTitle}</p>
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
        ) : null}

        {status === 'ready' && reviews.length === 0 ? (
          <p className="rounded-panel border border-white/8 bg-white/[0.03] p-3 text-sm leading-6 text-text-secondary">
            У владельца пока нет отзывов. Первый отзыв можно оставить после публикации объявления.
          </p>
        ) : null}

        {canWriteReview ? (
          <div className="grid gap-3 rounded-panel border border-accent-green/20 bg-accent-greenSoft/40 p-3">
            <div>
              <p className="text-sm font-extrabold text-text-primary">Оставить отзыв по объявлению</p>
              <p className="text-xs text-text-muted">{adTitle}</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full p-2 transition active:scale-95 ${value <= rating ? 'text-accent-green' : 'text-text-muted'}`}
                  aria-label={`${value} из 5`}
                  onClick={() => setRating(value)}
                >
                  <Star size={22} className={value <= rating ? 'fill-accent-green' : ''} />
                </button>
              ))}
            </div>
            <textarea
              className="min-h-24 rounded-panel border border-white/10 bg-surface-950/70 px-3 py-2 text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-green/60"
              placeholder="Напишите, как прошла работа или общение. Можно оставить только оценку."
              value={text}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
            />
            {submitError ? <p className="text-sm font-semibold text-red-100">{submitError}</p> : null}
            <ActionButton icon={isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} onClick={() => void submitReview()}>
              {isSubmitting ? 'Отправляем...' : 'Отправить отзыв'}
            </ActionButton>
          </div>
        ) : null}

        {!accessToken ? (
          <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm leading-6 text-accent-green">
            <p className="font-extrabold">Отзывы можно оставлять только через MAX mini app.</p>
            <p className="text-text-secondary">Откройте приложение из бота, авторизуйтесь через MAX и вернитесь к объявлению.</p>
          </div>
        ) : null}

        {accessToken && currentUserId === subjectUserId ? (
          <p className="text-sm text-text-muted">Это ваше объявление, поэтому форму отзыва мы скрыли.</p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function getAverageRating(reviews: ReviewItem[]): number | null {
  if (reviews.length === 0) {
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
