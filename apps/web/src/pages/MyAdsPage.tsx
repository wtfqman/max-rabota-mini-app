import { useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, RefreshCw, SearchX, Send, X } from 'lucide-react';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { Textarea } from '../shared/ui/Textarea.js';
import type { MyAdsQuery, OwnedAdCard, PublicAdStatus, PublicAdType } from '../features/ads/ad.types.js';

const typeTabs: Array<{ value: PublicAdType | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'vacancy', label: 'Вакансии' },
  { value: 'resume', label: 'Резюме' },
  { value: 'equipment', label: 'Техника' },
  { value: 'material', label: 'Материалы' },
  { value: 'tool', label: 'Инструменты' }
];

const statusTabs: Array<{ value: PublicAdStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'pending_moderation', label: 'На проверке' },
  { value: 'rejected', label: 'Нужны правки' },
  { value: 'published', label: 'Опубликованы' },
  { value: 'hidden', label: 'Скрытые' }
];

export function MyAdsPage() {
  const [query, setQuery] = useState<MyAdsQuery>({ page: 1, perPage: 20 });
  const [ads, setAds] = useState<OwnedAdCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnedAdCard | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listMyAds(query)
      .then((response) => {
        if (!active) {
          return;
        }
        setAds(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        setError(getUserFacingError(requestError, 'my_ads_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [query, reloadKey]);

  const counters = useMemo(
    () => ({
      pending: ads.filter((ad) => ad.status === 'pending_moderation').length,
      published: ads.filter((ad) => ad.status === 'published' || ad.status === 'approved').length,
      rejected: ads.filter((ad) => ad.status === 'rejected').length
    }),
    [ads]
  );

  const reload = () => setReloadKey((value) => value + 1);

  const hideAd = async (adId: string) => {
    await apiClient.hideMyAd(adId);
    reload();
  };

  const resubmitAd = async (adId: string) => {
    await apiClient.resubmitMyAd(adId);
    reload();
  };

  return (
    <AppPage>
      <div className="space-y-2 app-fade-up">
        <h1 className="text-3xl font-black text-text-primary">Мои объявления</h1>
        <p className="text-base leading-6 text-text-secondary">
          Здесь можно следить за публикациями, править текст и повторно отправлять объявления после замечаний.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip label="на проверке" value={String(counters.pending)} tone="amber" />
        <StatChip label="опубликовано" value={String(counters.published)} tone="green" />
        <StatChip label="нужны правки" value={String(counters.rejected)} />
      </div>

      <TabRow
        items={typeTabs}
        value={query.type ?? ''}
        onChange={(value) => setQuery((current) => ({ ...current, type: value || undefined }))}
      />
      <TabRow
        items={statusTabs}
        value={query.status ?? ''}
        onChange={(value) => setQuery((current) => ({ ...current, status: value || undefined }))}
      />

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Не получилось загрузить объявления"
          description={error ?? 'Попробуйте обновить раздел ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={reload}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && ads.length === 0 ? (
        <EmptyState
          title="Объявлений пока нет"
          description="Когда вы создадите вакансию, резюме, материал или инструмент, они появятся здесь."
          action={
            <ActionButton variant="secondary" icon={<SearchX size={18} />}>
              Пусто
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && ads.length > 0 ? (
        <section className="space-y-3">
          {ads.map((ad) => (
            <div key={ad.id} className="space-y-2">
              <AdCard
                to={getAdUrl(ad)}
                typeLabel={typeLabel(ad.type)}
                title={ad.title}
                subtitle={ad.subtitle}
                coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
                location={ad.locationShort}
                price={ad.shortSalary ?? undefined}
                category={ad.category}
                description={ad.description}
              />
              <div className="flex flex-wrap gap-2">
                <StatChip label={statusLabel(ad.status)} tone={ad.status === 'published' || ad.status === 'approved' ? 'green' : 'amber'} />
              </div>
              {ad.moderationReason ? (
                <p className="rounded-panel border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Что стоит поправить: {ad.moderationReason}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                <ActionButton variant="secondary" icon={<Eye size={17} />} onClick={() => window.location.assign(getAdUrl(ad))}>
                  Открыть
                </ActionButton>
                <ActionButton variant="secondary" icon={<Pencil size={17} />} onClick={() => setEditing(ad)}>
                  Править
                </ActionButton>
                {ad.status === 'rejected' || ad.status === 'hidden' ? (
                  <ActionButton icon={<Send size={17} />} onClick={() => void resubmitAd(ad.id)}>
                    Отправить снова
                  </ActionButton>
                ) : (
                  <ActionButton variant="secondary" icon={<X size={17} />} onClick={() => void hideAd(ad.id)}>
                    Скрыть
                  </ActionButton>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {editing ? (
        <EditSheet
          ad={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </AppPage>
  );
}

function TabRow<T extends string>({
  items,
  value,
  onChange
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`min-h-10 shrink-0 rounded-panel border px-3 text-sm font-semibold transition ${
            value === item.value
              ? 'border-accent-green bg-accent-greenSoft text-accent-green'
              : 'border-white/8 bg-surface-850 text-text-secondary'
          }`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function EditSheet({
  ad,
  onClose,
  onSaved
}: {
  ad: OwnedAdCard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(ad.title);
  const [description, setDescription] = useState(ad.description ?? '');
  const [categoryText, setCategoryText] = useState(ad.category ?? '');
  const [districtText, setDistrictText] = useState(ad.district ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.updateMyAd(ad.id, {
        title,
        description,
        categoryText,
        districtText
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-surface-950/80 backdrop-blur-sm">
      <button className="absolute inset-0 h-full w-full cursor-default" type="button" onClick={onClose} aria-label="Закрыть" />
      <div className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-[20px] border border-white/8 bg-surface-900 p-4 shadow-panel">
        <div className="grid gap-4">
          <h2 className="text-xl font-bold text-text-primary">Редактирование</h2>
          <Input label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Input label="Категория" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} />
          <Input label="Район" value={districtText} onChange={(event) => setDistrictText(event.target.value)} />
          <Textarea label="Описание" value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ActionButton disabled={saving} onClick={() => void save()}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </ActionButton>
            <ActionButton variant="secondary" onClick={onClose}>
              Закрыть
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function getAdUrl(ad: OwnedAdCard): string {
  if (ad.type === 'vacancy') {
    return `/vacancies/${ad.id}`;
  }

  if (ad.type === 'resume') {
    return `/resumes/${ad.id}`;
  }

  if (ad.type === 'equipment') {
    return `/equipment/${ad.id}`;
  }

  if (ad.type === 'material') {
    return `/materials/${ad.id}`;
  }

  if (ad.type === 'tool') {
    return `/tools/${ad.id}`;
  }

  return `/ads/${ad.id}`;
}

function typeLabel(type: PublicAdType): string {
  const labels: Record<PublicAdType, string> = {
    vacancy: 'Вакансия',
    resume: 'Резюме',
    equipment: 'Техника',
    material: 'Материалы',
    tool: 'Инструменты'
  };

  return labels[type];
}

function statusLabel(status: PublicAdStatus): string {
  const labels: Record<PublicAdStatus, string> = {
    draft: 'Черновик',
    pending_moderation: 'На проверке',
    approved: 'Готово к публикации',
    rejected: 'Нужны правки',
    published: 'Опубликовано',
    hidden: 'Скрыто',
    archived: 'В архиве'
  };

  return labels[status];
}
