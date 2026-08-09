import { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ListMeta, UserPaymentOperation } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';

const PER_PAGE = 20;

export function ProfilePaymentsPage() {
  const [items, setItems] = useState<UserPaymentOperation[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);
    setPage(1);

    apiClient
      .listPaymentHistory({ page: 1, perPage: PER_PAGE })
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.data.filter((item) => !item.test));
        setMeta(response.meta ?? null);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const loadMore = async () => {
    if (loadingMore) {
      return;
    }

    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);

    try {
      const response = await apiClient.listPaymentHistory({ page: nextPage, perPage: PER_PAGE });
      setItems((current) => [...current, ...response.data.filter((item) => !item.test)]);
      setMeta(response.meta ?? null);
      setPage(nextPage);
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'profile_load'));
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = meta ? page < meta.totalPages : false;

  return (
    <AppPage>
      <Link to="/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <ArrowLeft size={17} />
        В профиль
      </Link>

      <SectionCard title="История операций" description="Платежи, возвраты, пакеты публикаций, контакты и продвижения.">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? (
          <div className="grid gap-2">
            <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
              {error}
            </p>
            <ActionButton type="button" variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          </div>
        ) : null}
        {status === 'ready' && items.length === 0 ? <EmptyState title="Операций пока нет" description="Платежи и возвраты появятся здесь после первых действий." /> : null}
        {status === 'ready' && items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item) => (
              <PaymentOperationCard key={item.id} item={item} />
            ))}
            {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">{error}</p> : null}
            {hasMore ? (
              <ActionButton type="button" variant="secondary" icon={<RefreshCw size={18} />} disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Загружаем...' : 'Показать ещё'}
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </AppPage>
  );
}

function PaymentOperationCard({ item }: { item: UserPaymentOperation }) {
  return (
    <article className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-text-primary">{item.purposeLabel}</p>
          <p className="mt-1 text-xs text-text-muted">{formatDate(item.createdAt)} · {item.yooKassaPaymentIdMasked}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-text-primary">{item.amount} {item.currency}</p>
          {Number(item.refundAmount) > 0 ? <p className="text-xs font-bold text-red-100">refund {item.refundAmount}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">{paymentStatusLabel(item.status)}</span>
        {item.packagePublications > 0 ? <span className="rounded-full border border-accent-green/25 px-2 py-1 text-xs font-bold text-accent-green">+{item.packagePublications} публикаций</span> : null}
        {item.includesMediaFee ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">media fee</span> : null}
        {item.isResumeContactUnlock ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">contact unlock</span> : null}
        {item.isPromotion ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">promotion</span> : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <p className="min-w-0 truncate text-xs text-text-muted">{item.ad.title}</p>
        <LinkButton to={getAdPath(item.ad)} variant="secondary" icon={<CreditCard size={16} />}>
          Открыть объявление
        </LinkButton>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

function getAdPath(ad: UserPaymentOperation['ad']): string {
  if (ad.type === 'vacancy') {
    return `/vacancies/${ad.id}`;
  }

  if (ad.type === 'resume') {
    return `/resumes/${ad.id}`;
  }

  if (ad.type === 'material') {
    return `/materials/${ad.id}`;
  }

  if (ad.type === 'tool') {
    return `/tools/${ad.id}`;
  }

  return `/equipment/${ad.id}`;
}

function paymentStatusLabel(status: UserPaymentOperation['status']): string {
  const labels: Record<UserPaymentOperation['status'], string> = {
    PENDING: 'ожидает',
    SUCCEEDED: 'успешно',
    CANCELED: 'отменён',
    REFUND_PENDING: 'возврат в обработке',
    PARTIALLY_REFUNDED: 'частичный возврат',
    REFUNDED: 'возврат',
    FAILED: 'ошибка'
  };

  return labels[status];
}
