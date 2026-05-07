import { useEffect, useState } from 'react';
import { RefreshCw, Star } from 'lucide-react';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { Textarea } from '../shared/ui/Textarea.js';
import type { ReviewItem } from '../features/ads/ad.types.js';

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [targetUserId, setTargetUserId] = useState('');
  const [rating, setRating] = useState('5');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listMyReviews()
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
  }, [reloadKey]);

  const average = reviews.length
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  const submit = async () => {
    if (!targetUserId.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.createReview(targetUserId.trim(), {
        rating: Number(rating) || 5,
        text: text.trim() || undefined
      });
      setTargetUserId('');
      setRating('5');
      setText('');
      setReloadKey((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppPage>
      <div className="space-y-2 app-fade-up">
        <h1 className="text-3xl font-black text-text-primary">Отзывы</h1>
        <p className="text-base leading-6 text-text-secondary">Здесь собирается обратная связь о работе и взаимодействии.</p>
      </div>

      <SectionCard title="Рейтинг">
        <div className="flex flex-wrap gap-2">
          <StatChip label="средний" value={average} tone="amber" icon={<Star size={15} />} />
          <StatChip label="отзывов" value={String(reviews.length)} />
        </div>
      </SectionCard>

      <SectionCard title="Оставить отзыв" description="Пока отзыв можно отправить по ID пользователя из его профиля.">
        <Input label="ID пользователя" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} />
        <Input label="Оценка" inputMode="numeric" value={rating} onChange={(event) => setRating(event.target.value)} />
        <Textarea label="Текст" value={text} onChange={(event) => setText(event.target.value)} />
        <ActionButton disabled={submitting || !targetUserId.trim()} onClick={() => void submit()}>
          {submitting ? 'Отправляем...' : 'Отправить отзыв'}
        </ActionButton>
      </SectionCard>

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Не удалось загрузить отзывы"
          description={error ?? 'Попробуйте открыть раздел ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && reviews.length === 0 ? (
        <EmptyState title="Отзывов пока нет" description="Когда появится обратная связь, она отобразится здесь." />
      ) : null}

      {status === 'ready' && reviews.length > 0 ? (
        <section className="space-y-3">
          {reviews.map((review) => (
            <SectionCard key={review.id} title={review.author.displayName ?? review.author.maxUsername ?? 'Пользователь'}>
              <div className="grid gap-2">
                <StatChip label="оценка" value={String(review.rating)} tone="amber" icon={<Star size={15} />} />
                {review.text ? <p className="text-base leading-6 text-text-secondary">{review.text}</p> : null}
                <p className="text-sm text-text-muted">{formatDate(review.createdAt)}</p>
              </div>
            </SectionCard>
          ))}
        </section>
      ) : null}
    </AppPage>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}
