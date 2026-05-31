import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Megaphone,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Trash2,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MyAdsQuery, OwnedAdCard, PublicAdStatus, PublicAdType } from '../features/ads/ad.types.js';
import {
  activePeriodOptions,
  defaultPublicationSettings,
  getPublicationSettings,
  loadPublicationSettings,
  normalizePublicationSettings,
  removePublicationSettings,
  repeatPeriodOptions,
  savePublicationSettings,
  upsertPublicationSettings,
  type PublicationSettings,
  type PublicationSettingsMap
} from '../features/ads/publication-settings.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { MediaPreview } from '../shared/ui/MediaPreview.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { Select } from '../shared/ui/Select.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { Textarea } from '../shared/ui/Textarea.js';

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
  { value: 'published', label: 'Активные' },
  { value: 'pending_moderation', label: 'На модерации' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: 'hidden', label: 'Скрытые' },
  { value: 'archived', label: 'Архив' },
  { value: 'deleted', label: 'Удалённые' }
];

export function MyAdsPage() {
  const [query, setQuery] = useState<MyAdsQuery>({ page: 1, perPage: 20 });
  const [ads, setAds] = useState<OwnedAdCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnedAdCard | null>(null);
  const [previewAd, setPreviewAd] = useState<OwnedAdCard | null>(null);
  const [settingsAd, setSettingsAd] = useState<OwnedAdCard | null>(null);
  const [publicationSettings, setPublicationSettings] = useState<PublicationSettingsMap>(() => loadPublicationSettings());
  const [busyAdId, setBusyAdId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        setPublicationSettings((current) => mergeServerPublicationSettings(current, response.data));
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

  const counters = useMemo(() => {
    const published = ads.filter((ad) => isActiveStatus(ad.status)).length;
    const pending = ads.filter((ad) => ad.status === 'pending_moderation').length;
    const hidden = ads.filter((ad) => isHiddenStatus(ad.status)).length;
    const deleted = ads.filter((ad) => ad.status === 'deleted').length;
    const autoRepeat = ads.filter((ad) => getPublicationSettings(publicationSettings, ad.id).autoRepeat).length;

    return { published, pending, hidden, deleted, autoRepeat };
  }, [ads, publicationSettings]);

  const reload = () => setReloadKey((value) => value + 1);

  const runAdAction = async (adId: string, action: () => Promise<string | void>, successMessage: string) => {
    try {
      setBusyAdId(adId);
      setNotice(null);
      const message = await action();
      setNotice(message ?? successMessage);
      reload();
    } catch (requestError) {
      setNotice(getUserFacingError(requestError, 'my_ads_load'));
    } finally {
      setBusyAdId(null);
    }
  };

  const hideAd = (ad: OwnedAdCard) =>
    runAdAction(
      ad.id,
      () => apiClient.hideMyAd(ad.id).then((response) => {
        return `Объявление больше не отображается в общей ленте.${formatChannelRemoval(response.data.channelRemoval)}`;
      }),
      'Объявление больше не отображается в общей ленте.'
    );

  const archiveAd = (ad: OwnedAdCard) => {
    if (!window.confirm('Архивировать объявление? Оно будет скрыто из общей ленты и по возможности снято из канала.')) {
      return;
    }

    void runAdAction(
      ad.id,
      () => apiClient.archiveMyAd(ad.id).then((response) => {
        setPublicationSettings((current) => removePublicationSettings(current, ad.id));
        return `Объявление архивировано.${formatChannelRemoval(response.data.channelRemoval)}`;
      }),
      'Объявление архивировано.'
    );
  };

  const resubmitAd = (ad: OwnedAdCard) =>
    runAdAction(ad.id, () => apiClient.resubmitMyAd(ad.id).then(() => undefined), 'Объявление отправлено на модерацию.');

  const deleteAd = (ad: OwnedAdCard) => {
    if (!window.confirm('Вы уверены, что хотите удалить объявление? Объявление будет скрыто из приложения и по возможности удалено из канала.')) {
      return;
    }

    void runAdAction(
      ad.id,
      () => apiClient.deleteMyAd(ad.id).then((response) => {
        setPublicationSettings((current) => removePublicationSettings(current, ad.id));
        return `Объявление удалено.${formatChannelRemoval(response.data.channelRemoval)}`;
      }),
      'Объявление удалено.'
    );
  };

  const saveSettings = (settings: PublicationSettings) => {
    void savePublicationSettingsToServer(settings);
  };

  const savePublicationSettingsToServer = async (settings: PublicationSettings) => {
    try {
      setBusyAdId(settings.adId);
      setNotice(null);
      const response = await apiClient.updatePublicationSettings(settings.adId, toPublicationSettingsPayload(settings));
      const nextSettings = normalizePublicationSettings(
        settings.adId,
        response.data.publicationSettings ?? settings
      );

      setPublicationSettings((current) => upsertPublicationSettings(current, nextSettings));
      setSettingsAd(null);
      setNotice('Настройки публикации сохранены.');
      reload();
    } catch (requestError) {
      setNotice(getUserFacingError(requestError, 'my_ads_load'));
    } finally {
      setBusyAdId(null);
    }
  };

  return (
    <AppPage>
      <section className="app-surface app-topline relative overflow-hidden rounded-panel p-4 app-fade-up">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent-green/12 blur-3xl" />
        <div className="relative space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green">
            <Megaphone size={23} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent-green">Кабинет объявлений</p>
            <h1 className="text-2xl font-black leading-tight text-text-primary">Мои объявления</h1>
            <p className="max-w-md text-sm leading-5 text-text-secondary">
              Управляйте публикациями: редактируйте, скрывайте, отправляйте снова и настраивайте автопубликацию.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <StatChip label="активно" value={String(counters.published)} tone="green" />
        <StatChip label="на модерации" value={String(counters.pending)} tone="green" />
        <StatChip label="скрыто" value={String(counters.hidden)} />
        <StatChip label="удалено" value={String(counters.deleted)} />
        <StatChip label="с автопубликацией" value={String(counters.autoRepeat)} tone="green" />
      </div>

      {notice ? (
        <div className="rounded-panel border border-accent-green/25 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {notice}
        </div>
      ) : null}

      <TabRow
        items={typeTabs}
        value={query.type ?? ''}
        onChange={(value) => setQuery((current) => ({ ...current, page: 1, type: value || undefined }))}
      />
      <TabRow
        items={statusTabs}
        value={query.status ?? ''}
        onChange={(value) => setQuery((current) => ({ ...current, page: 1, status: value || undefined }))}
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
          description="Создайте вакансию, резюме, технику, материалы или инструменты, и они появятся здесь."
          action={
            <Link
              to="/create"
              className="inline-flex min-h-11 items-center justify-center rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-extrabold text-surface-950 shadow-glow"
            >
              Разместить объявление
            </Link>
          }
        />
      ) : null}

      {status === 'ready' && ads.length > 0 ? (
        <section className="space-y-4" aria-label="Ваши объявления">
          {ads.map((ad, index) => (
            <ManagedAdCard
              key={ad.id}
              ad={ad}
              index={index}
              busy={busyAdId === ad.id}
              settings={getPublicationSettings(publicationSettings, ad.id)}
              onPreview={() => setPreviewAd(ad)}
              onEdit={() => setEditing(ad)}
              onHide={() => hideAd(ad)}
              onArchive={() => archiveAd(ad)}
              onResubmit={() => resubmitAd(ad)}
              onSettings={() => setSettingsAd(ad)}
              onDelete={() => deleteAd(ad)}
            />
          ))}
        </section>
      ) : null}

      {editing ? (
        <EditSheet
          ad={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice('Изменения сохранены.');
            reload();
          }}
        />
      ) : null}

      {previewAd ? <PreviewSheet ad={previewAd} onClose={() => setPreviewAd(null)} /> : null}

      {settingsAd ? (
        <PublicationSettingsSheet
          ad={settingsAd}
          settings={getPublicationSettings(publicationSettings, settingsAd.id)}
          onClose={() => setSettingsAd(null)}
          onSave={saveSettings}
        />
      ) : null}
    </AppPage>
  );
}

function ManagedAdCard({
  ad,
  settings,
  busy,
  index,
  onPreview,
  onEdit,
  onHide,
  onArchive,
  onResubmit,
  onSettings,
  onDelete
}: {
  ad: OwnedAdCard;
  settings: PublicationSettings;
  busy: boolean;
  index: number;
  onPreview: () => void;
  onEdit: () => void;
  onHide: () => void;
  onArchive: () => void;
  onResubmit: () => void;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const status = userStatus(ad.status);
  const inactive = isInactiveStatus(ad.status);
  const pending = ad.status === 'pending_moderation';
  const deleted = ad.status === 'deleted';
  const publicUrl = getAdUrl(ad);
  const isPublic = isActiveStatus(ad.status);

  return (
    <article className="space-y-2 app-fade-up" style={{ animationDelay: `${index * 45}ms` }}>
      <AdCard
        variant="compact"
        to={isPublic ? publicUrl : '/my-ads'}
        typeLabel={typeLabel(ad.type)}
        title={ad.title}
        subtitle={ad.subtitle}
        coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url}
        coverMimeType={ad.coverPhoto?.mimeType}
        location={ad.locationShort}
        price={ad.shortSalary ?? undefined}
        category={ad.category}
        description={ad.description}
      />

      <div className="space-y-3 rounded-panel border border-white/8 bg-surface-950/70 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatChip label={status.label} tone={status.tone} icon={status.icon} />
          {settings.autoRepeat ? (
            <StatChip label={`автопубликация: ${repeatLabel(settings.repeatPeriod)}`} tone="green" icon={<RotateCcw size={15} />} />
          ) : null}
          <StatChip label={`срок: ${activeLabel(settings.activePeriod)}`} icon={<Clock3 size={15} />} />
        </div>

        {ad.moderationReason ? (
          <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-3 py-2 text-sm text-accent-green">
            Что стоит поправить: {ad.moderationReason}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="secondary" icon={<Eye size={17} />} className={isPublic ? undefined : 'col-span-2'} onClick={onPreview}>
            Предпросмотр
          </ActionButton>
          {isPublic ? (
            <LinkButtonLike to={publicUrl} icon={<Eye size={17} />}>
              На сайте
            </LinkButtonLike>
          ) : null}
          <ActionButton variant="secondary" icon={<Pencil size={17} />} disabled={deleted} onClick={onEdit}>
            Редактировать
          </ActionButton>
          <ActionButton variant="secondary" icon={<Settings2 size={17} />} disabled={deleted} onClick={onSettings}>
            Автопубликация
          </ActionButton>
          {pending ? (
            <ActionButton variant="secondary" disabled icon={<Clock3 size={17} />}>
              На модерации
            </ActionButton>
          ) : (
            <ActionButton icon={<Send size={17} />} disabled={busy || deleted} onClick={onResubmit}>
              {inactive ? 'Опубликовать снова' : 'Повторно опубликовать'}
            </ActionButton>
          )}
          {!isHiddenStatus(ad.status) && !deleted ? (
            <ActionButton variant="secondary" icon={<EyeOff size={17} />} disabled={busy} onClick={onHide}>
              Скрыть
            </ActionButton>
          ) : (
            <ActionButton variant="secondary" disabled icon={<EyeOff size={17} />}>
              Уже скрыто
            </ActionButton>
          )}
          <ActionButton variant="secondary" icon={<Archive size={17} />} disabled={busy || deleted || ad.status === 'archived'} onClick={onArchive}>
            Архивировать
          </ActionButton>
          <ActionButton variant="danger" icon={<Trash2 size={17} />} disabled={busy || deleted} onClick={onDelete}>
            Удалить
          </ActionButton>
        </div>
      </div>
    </article>
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
          key={`${item.value}-${item.label}`}
          type="button"
          className={`min-h-10 shrink-0 rounded-panel border px-3 text-sm font-extrabold transition active:scale-[0.985] ${
            value === item.value
              ? 'border-accent-green bg-accent-greenSoft text-accent-green'
              : 'border-white/10 bg-surface-850 text-text-secondary hover:border-accent-green/35'
          }`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function PreviewSheet({ ad, onClose }: { ad: OwnedAdCard; onClose: () => void }) {
  const status = userStatus(ad.status);
  const mediaUrl = ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url ?? null;

  return (
    <Sheet title="Предпросмотр объявления" onClose={onClose}>
      <div className="grid gap-4 pb-3">
        <div className="overflow-hidden rounded-panel border border-white/10 bg-surface-950/78">
          {mediaUrl ? (
            <MediaPreview
              src={mediaUrl}
              mimeType={ad.coverPhoto?.mimeType}
              alt={ad.title}
              className="aspect-[16/9] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,rgba(52,211,153,0.16),transparent_48%),#070b09] text-accent-green">
              <Megaphone size={42} />
            </div>
          )}
          <div className="grid gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              <StatChip label={typeLabel(ad.type)} tone="green" />
              <StatChip label={status.label} tone={status.tone} icon={status.icon} />
            </div>
            <div>
              <h3 className="text-2xl font-black leading-tight text-text-primary">{ad.title}</h3>
              {ad.subtitle ? <p className="mt-1 text-sm font-semibold text-text-secondary">{ad.subtitle}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {ad.locationShort ? <StatChip label={ad.locationShort} /> : null}
              {ad.shortSalary ? <StatChip label={ad.shortSalary} tone="green" /> : null}
              {ad.category ? <StatChip label={ad.category} tone="green" /> : null}
            </div>
          </div>
        </div>

        <SectionCard title="Описание">
          {ad.description ? (
            <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{ad.description}</p>
          ) : (
            <p className="text-sm text-text-secondary">Описание пока не указано.</p>
          )}
        </SectionCard>

        <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm leading-6 text-accent-green">
          Это внутренний предпросмотр из личного кабинета. Он открывается даже когда объявление скрыто или ещё на модерации.
        </div>

        <ActionButton type="button" onClick={onClose}>
          Понятно
        </ActionButton>
      </div>
    </Sheet>
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
  const [desiredPosition, setDesiredPosition] = useState(ad.type === 'resume' ? (ad.subtitle ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiClient.updateMyAd(ad.id, {
        title,
        description,
        categoryText,
        districtText,
        desiredPosition: ad.type === 'resume' ? desiredPosition.trim() || null : undefined
      });
      onSaved();
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'my_ads_load'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="Редактировать объявление" onClose={onClose}>
      <div className="grid gap-4 pb-[calc(120px+env(safe-area-inset-bottom))]">
        {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        <Input label="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
        {ad.type === 'resume' ? (
          <Input
            label="Кем хочу работать"
            value={desiredPosition}
            placeholder="Например: монтажник, слесарь-монтажник"
            onChange={(event) => setDesiredPosition(event.target.value)}
          />
        ) : null}
        <Input label="Категория" value={categoryText} onChange={(event) => setCategoryText(event.target.value)} />
        <Input label="Район" value={districtText} onChange={(event) => setDistrictText(event.target.value)} />
        <Textarea label="Описание" value={description} rows={8} onChange={(event) => setDescription(event.target.value)} />
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 rounded-panel border border-white/10 bg-surface-900/95 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
          <ActionButton type="button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </ActionButton>
          <ActionButton type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

function PublicationSettingsSheet({
  ad,
  settings,
  onClose,
  onSave
}: {
  ad: OwnedAdCard;
  settings: PublicationSettings;
  onClose: () => void;
  onSave: (settings: PublicationSettings) => void;
}) {
  const [draft, setDraft] = useState<PublicationSettings>(settings ?? defaultPublicationSettings(ad.id));
  const status = userStatus(ad.status);

  const updateDraft = <TKey extends keyof PublicationSettings>(key: TKey, value: PublicationSettings[TKey]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <Sheet title="Пульт управления публикацией" onClose={onClose}>
      <div className="grid gap-4">
        <SectionCard title={ad.title} description="Настройте, как объявление будет жить после публикации.">
          <div className="flex flex-wrap gap-2">
            <StatChip label={status.label} tone={status.tone} icon={status.icon} />
            {draft.autoRepeat ? <StatChip label="автопубликация включена" tone="green" icon={<RotateCcw size={15} />} /> : null}
          </div>
        </SectionCard>

        <ToggleRow
          title="Автопубликация"
          description="Объявление будет повторяться по выбранному периоду."
          checked={draft.autoRepeat}
          onChange={(value) => updateDraft('autoRepeat', value)}
        />

        <Select
          label="Повтор публикации"
          value={draft.repeatPeriod}
          options={repeatPeriodOptions}
          disabled={!draft.autoRepeat}
          onChange={(event) => updateDraft('repeatPeriod', event.target.value as PublicationSettings['repeatPeriod'])}
        />

        <Select
          label="Срок размещения"
          value={draft.activePeriod}
          options={activePeriodOptions}
          onChange={(event) => updateDraft('activePeriod', event.target.value as PublicationSettings['activePeriod'])}
        />

        <ToggleRow
          title="Напомнить перед отключением"
          description="Покажем напоминание, когда срок размещения будет подходить к концу."
          checked={draft.remindBeforeEnd}
          onChange={(value) => updateDraft('remindBeforeEnd', value)}
        />

        <div className="sticky bottom-0 z-10 grid grid-cols-[1fr_auto] gap-2 rounded-[20px] border border-white/10 bg-surface-900/95 p-2 shadow-[0_-14px_36px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <ActionButton type="button" onClick={() => onSave(draft)} icon={<CheckCircle2 size={18} />}>
            Сохранить
          </ActionButton>
          <ActionButton type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-4 rounded-panel border border-white/10 bg-surface-900/92 p-4 text-left transition hover:border-accent-green/35 active:scale-[0.985]"
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0 space-y-1">
        <span className="block text-base font-extrabold text-text-primary">{title}</span>
        <span className="block text-sm leading-5 text-text-secondary">{description}</span>
      </span>
      <span
        className={`relative h-8 w-14 shrink-0 rounded-full border transition ${
          checked ? 'border-accent-green bg-accent-greenSoft' : 'border-white/10 bg-white/[0.04]'
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full transition ${
            checked ? 'left-7 bg-accent-green' : 'left-1 bg-text-muted'
          }`}
        />
      </span>
    </button>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[140] bg-surface-950/82 backdrop-blur-sm">
      <button className="absolute inset-0 z-0 h-full w-full cursor-default" type="button" tabIndex={-1} aria-label="Фон окна" />
      <div className="absolute inset-x-0 bottom-0 z-10 max-h-[calc(100vh-24px)] overflow-y-auto rounded-t-[28px] border border-white/10 bg-surface-900 p-4 pb-[calc(18px+env(safe-area-inset-bottom))] shadow-panel app-fade-up">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-text-primary">{title}</h2>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-text-secondary transition hover:text-text-primary active:scale-95"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LinkButtonLike({
  to,
  icon,
  children,
  className
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-panel border border-white/10 bg-surface-800/92 px-3 text-sm font-extrabold text-text-primary transition duration-200 hover:border-accent-green/45 active:scale-[0.985] ${className ?? ''}`}
    >
      {icon}
      {children}
    </Link>
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

function userStatus(status: PublicAdStatus): { label: string; tone: 'green' | 'neutral'; icon: ReactNode } {
  if (status === 'published' || status === 'approved') {
    return { label: 'Опубликовано', tone: 'green', icon: <CheckCircle2 size={15} /> };
  }

  if (status === 'pending_moderation') {
    return { label: 'На модерации', tone: 'green', icon: <Clock3 size={15} /> };
  }

  if (status === 'hidden') {
    return { label: 'Скрыто', tone: 'neutral', icon: <EyeOff size={15} /> };
  }

  if (status === 'archived') {
    return { label: 'Архивировано', tone: 'neutral', icon: <Archive size={15} /> };
  }

  if (status === 'deleted') {
    return { label: 'Удалено', tone: 'neutral', icon: <Trash2 size={15} /> };
  }

  if (status === 'rejected') {
    return { label: 'Отклонено', tone: 'neutral', icon: <X size={15} /> };
  }

  return { label: 'Черновик', tone: 'neutral', icon: <CalendarClock size={15} /> };
}

function isActiveStatus(status: PublicAdStatus) {
  return status === 'published' || status === 'approved';
}

function isHiddenStatus(status: PublicAdStatus) {
  return status === 'hidden';
}

function isInactiveStatus(status: PublicAdStatus) {
  return isHiddenStatus(status) || status === 'archived' || status === 'rejected' || status === 'deleted' || status === 'draft';
}

function repeatLabel(value: PublicationSettings['repeatPeriod']) {
  return repeatPeriodOptions.find((option) => option.value === value)?.label ?? 'раз в 3 дня';
}

function activeLabel(value: PublicationSettings['activePeriod']) {
  return activePeriodOptions.find((option) => option.value === value)?.label ?? '7 дней';
}

function mergeServerPublicationSettings(
  current: PublicationSettingsMap,
  ads: OwnedAdCard[]
): PublicationSettingsMap {
  const next = { ...current };
  const legacySettingsToSync: PublicationSettings[] = [];

  ads.forEach((ad) => {
    if (ad.publicationSettings) {
      next[ad.id] = normalizePublicationSettings(ad.id, ad.publicationSettings);
      return;
    }

    const localSettings = current[ad.id];
    if (localSettings?.autoRepeat) {
      const normalized = normalizePublicationSettings(ad.id, localSettings);
      next[ad.id] = normalized;
      legacySettingsToSync.push(normalized);
    }
  });

  savePublicationSettings(next);

  legacySettingsToSync.forEach((settings) => {
    void apiClient.updatePublicationSettings(settings.adId, toPublicationSettingsPayload(settings)).catch(() => undefined);
  });

  return next;
}

function toPublicationSettingsPayload(
  settings: PublicationSettings
): Pick<PublicationSettings, 'autoRepeat' | 'repeatPeriod' | 'activePeriod' | 'remindBeforeEnd'> {
  return {
    autoRepeat: settings.autoRepeat,
    repeatPeriod: settings.repeatPeriod,
    activePeriod: settings.activePeriod,
    remindBeforeEnd: settings.remindBeforeEnd
  };
}

function formatChannelRemoval(result?: { attempted: number; removed: number; failed: number; skipped: number }): string {
  if (!result || result.attempted === 0) {
    return '';
  }

  if (result.failed > 0) {
    return ' В приложении оно скрыто, но пост в канале не удалось удалить автоматически.';
  }

  if (result.removed > 0) {
    return ' Пост в канале снят.';
  }

  return ' Публикаций в канале для удаления не найдено.';
}
