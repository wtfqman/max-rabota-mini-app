import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient } from '../shared/api/client.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { Textarea } from '../shared/ui/Textarea.js';
import type { PublicAdDetail } from '../features/ads/ad.types.js';

export function ModerationPage() {
  const role = useAppStore((state) => state.user.role);
  const [ads, setAds] = useState<PublicAdDetail[]>([]);
  const [selected, setSelected] = useState<PublicAdDetail | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (role !== 'admin' && role !== 'moderator') {
      setStatus('ready');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listModerationQueue({ status: 'pending_moderation', page: 1, perPage: 30 })
      .then((response) => {
        if (!active) {
          return;
        }
        setAds(response.data);
        setSelected(response.data[0] ?? null);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить очередь');
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [role, reloadKey]);

  if (role !== 'admin' && role !== 'moderator') {
    return (
      <AppPage>
        <EmptyState title="Нет доступа" description="Раздел модерации доступен только администраторам и модераторам." />
      </AppPage>
    );
  }

  const reload = () => setReloadKey((value) => value + 1);

  const approve = async (adId: string) => {
    const response = await apiClient.approveModerationAd(adId);
    setActionMessage(`Одобрено. Публикация: ${response.data.publication?.status ?? 'нет данных'}`);
    reload();
  };

  const reject = async (adId: string) => {
    if (reason.trim().length < 3) {
      setActionMessage('Укажите причину отклонения.');
      return;
    }

    await apiClient.rejectModerationAd(adId, reason.trim());
    setReason('');
    setActionMessage('Отклонено.');
    reload();
  };

  const hide = async (adId: string) => {
    await apiClient.hideModerationAd(adId, reason.trim() || undefined);
    setReason('');
    setActionMessage('Скрыто.');
    reload();
  };

  return (
    <AppPage>
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase text-accent-green">Admin</p>
        <h1 className="text-3xl font-black text-text-primary">Модерация</h1>
        <p className="text-base leading-6 text-text-secondary">Очередь объявлений со статусом pending moderation.</p>
      </div>

      {actionMessage ? (
        <p className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {actionMessage}
        </p>
      ) : null}

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Очередь не загрузилась"
          description={error ?? 'Попробуйте еще раз.'}
          action={<ActionButton icon={<RefreshCw size={18} />} onClick={reload}>Повторить</ActionButton>}
        />
      ) : null}

      {status === 'ready' && ads.length === 0 ? (
        <EmptyState title="Очередь пуста" description="Новые объявления появятся здесь после отправки на модерацию." />
      ) : null}

      {status === 'ready' && ads.length > 0 ? (
        <div className="grid gap-4">
          <section className="grid gap-2">
            {ads.map((ad) => (
              <button
                key={ad.id}
                type="button"
                className={`rounded-panel border p-3 text-left transition ${
                  selected?.id === ad.id ? 'border-accent-green bg-accent-greenSoft' : 'border-line bg-surface-850'
                }`}
                onClick={() => setSelected(ad)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-text-primary">{ad.title}</p>
                    <p className="text-sm text-text-secondary">{typeLabel(ad.type)}</p>
                  </div>
                  <StatChip label={ad.status} tone="amber" />
                </div>
              </button>
            ))}
          </section>

          {selected ? (
            <SectionCard title={selected.title} description={selected.subtitle ?? typeLabel(selected.type)}>
              <div className="grid gap-3">
                {selected.coverPhoto ? (
                  <img
                    src={selected.coverPhoto.previewUrl ?? selected.coverPhoto.url}
                    alt=""
                    className="aspect-[16/9] w-full rounded-panel object-cover"
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <StatChip label={typeLabel(selected.type)} tone="green" icon={<ShieldCheck size={15} />} />
                  {selected.category ? <StatChip label={selected.category} /> : null}
                  {selected.locationShort ? <StatChip label={selected.locationShort} tone="cyan" /> : null}
                </div>
                {selected.description ? (
                  <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{selected.description}</p>
                ) : null}
                <Textarea
                  label="Причина для reject/hide"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="grid grid-cols-3 gap-2">
                  <ActionButton icon={<CheckCircle2 size={18} />} onClick={() => void approve(selected.id)}>
                    Approve
                  </ActionButton>
                  <ActionButton variant="danger" icon={<XCircle size={18} />} onClick={() => void reject(selected.id)}>
                    Reject
                  </ActionButton>
                  <ActionButton variant="secondary" icon={<Eye size={18} />} onClick={() => void hide(selected.id)}>
                    Hide
                  </ActionButton>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
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
