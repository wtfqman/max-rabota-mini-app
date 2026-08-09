import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  History,
  Megaphone,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import type {
  AdLifecycleActionResponse,
  AdRevisionSummary,
  MyAdsQuery,
  OwnedAdCard,
  PublicAdStatus,
  PublicAdType,
  RevisionPublicationEstimate,
  UpdateOwnedAdResponse
} from '../features/ads/ad.types.js';
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
import {
  buildAdRevisionUpdatePayload,
  createAdFormFromOwnedAd,
  type AdCategoryFormState
} from '../features/ads/form/ad-form.model.js';
import type { PromotionProduct, PromotionPurchase } from '../features/promotions/promotion.types.js';
import type { JobApplication, JobApplicationStatus } from '../features/applications/application.types.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { isValidPaymentConfirmationUrl, openExternalUrlWithResult } from '../shared/max/max-bridge.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { FormSection } from '../shared/ui/FormSection.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { MediaPreview } from '../shared/ui/MediaPreview.js';
import { PhotoUploader } from '../shared/ui/PhotoUploader.js';
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
  { value: 'payment_pending', label: 'Ожидают оплаты' },
  { value: 'pending_moderation', label: 'На модерации' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: 'hidden', label: 'Скрытые' },
  { value: 'archived', label: 'Архив' },
  { value: 'deleted', label: 'Удалённые' }
];

export function MyAdsPage() {
  const promotionsEnabled = useAppStore((state) => state.features.PROMOTIONS_ENABLED);
  const [query, setQuery] = useState<MyAdsQuery>({ page: 1, perPage: 20 });
  const [ads, setAds] = useState<OwnedAdCard[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnedAdCard | null>(null);
  const [previewAd, setPreviewAd] = useState<OwnedAdCard | null>(null);
  const [historyAd, setHistoryAd] = useState<OwnedAdCard | null>(null);
  const [settingsAd, setSettingsAd] = useState<OwnedAdCard | null>(null);
  const [promotionAd, setPromotionAd] = useState<OwnedAdCard | null>(null);
  const [applicationsAd, setApplicationsAd] = useState<OwnedAdCard | null>(null);
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
    const pending = ads.filter((ad) => ad.status === 'pending_moderation' || ad.status === 'payment_pending').length;
    const hidden = ads.filter((ad) => isHiddenStatus(ad.status)).length;
    const deleted = ads.filter((ad) => ad.status === 'deleted').length;

    return { published, pending, hidden, deleted };
  }, [ads]);

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
    runAdAction(
      ad.id,
      () =>
        apiClient.resubmitMyAd(ad.id).then((response) => {
          const paymentUrl = response.data.payment?.confirmationUrl?.trim();

          if (isValidPaymentConfirmationUrl(paymentUrl)) {
            setQuery((current) => ({ ...current, page: 1, status: 'payment_pending' }));
            openExternalUrlWithResult(paymentUrl);
            return `Открыл оплату ${formatRubAmount(response.data.payment?.amount ?? '0.00')}.`;
          }

          if (response.data.payment) {
            throw new Error('YooKassa не вернула корректную ссылку оплаты.');
          }

          return formatResubmitNotice(response.data.publication);
        }),
      'Объявление отправлено на модерацию.'
    );

  const cancelRevision = (ad: OwnedAdCard) => {
    if (!window.confirm('Отменить текущую редакцию? Опубликованная версия останется без изменений.')) {
      return;
    }

    void runAdAction(
      ad.id,
      () => apiClient.cancelAdRevision(ad.id).then(() => 'Редакция отменена. Опубликованная версия осталась активной.'),
      'Редакция отменена.'
    );
  };

  const deleteAd = (ad: OwnedAdCard) => {
    if (!window.confirm('Вы уверены, что хотите удалить объявление? Объявление будет скрыто из приложения и по возможности удалено из канала.')) {
      return;
    }

    void runAdAction(
      ad.id,
      () => apiClient.deleteMyAd(ad.id).then((response) => {
        setPublicationSettings((current) => removePublicationSettings(current, ad.id));
        clearCreateDraft(ad.type);
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
              Управляйте публикациями: редактируйте, скрывайте и отправляйте объявления на повторную проверку.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <StatChip label="активно" value={String(counters.published)} tone="green" />
        <StatChip label="на модерации" value={String(counters.pending)} tone="green" />
        <StatChip label="скрыто" value={String(counters.hidden)} />
        <StatChip label="удалено" value={String(counters.deleted)} />
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
              Создать объявление
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
              onHistory={() => setHistoryAd(ad)}
              onPromote={promotionsEnabled ? () => setPromotionAd(ad) : undefined}
              onApplications={() => setApplicationsAd(ad)}
              onCancelRevision={() => cancelRevision(ad)}
              onDelete={() => deleteAd(ad)}
            />
          ))}
        </section>
      ) : null}

      {editing ? (
        <EditSheet
          ad={editing}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            if (result.payment?.confirmationUrl) {
              setQuery((current) => ({ ...current, page: 1, status: 'payment_pending' }));
            }
            setNotice(result.revision ? 'Черновик изменений сохранён. Теперь его можно предварительно посмотреть и опубликовать заново.' : 'Изменения сохранены.');
            reload();
          }}
        />
      ) : null}

      {previewAd ? <PreviewSheet ad={previewAd} onClose={() => setPreviewAd(null)} /> : null}

      {historyAd ? <RevisionHistorySheet ad={historyAd} onClose={() => setHistoryAd(null)} /> : null}

      {promotionAd ? (
        <PromotionSheet
          ad={promotionAd}
          onClose={() => setPromotionAd(null)}
          onPurchased={() => {
            setPromotionAd(null);
            reload();
          }}
        />
      ) : null}

      {applicationsAd ? (
        <VacancyApplicationsSheet ad={applicationsAd} onClose={() => setApplicationsAd(null)} />
      ) : null}

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
  onHistory,
  onPromote,
  onApplications,
  onCancelRevision,
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
  onHistory: () => void;
  onPromote?: () => void;
  onApplications: () => void;
  onCancelRevision: () => void;
  onDelete: () => void;
}) {
  const paymentUrl = ad.payment?.confirmationUrl?.trim() || null;
  const paymentAwaiting =
    isValidPaymentConfirmationUrl(paymentUrl) && (ad.payment?.status === 'pending' || ad.payment?.status === 'waiting_for_capture');
  const effectiveStatus = paymentAwaiting ? 'payment_pending' : ad.status;
  const status = userStatus(effectiveStatus);
  const paymentPending = effectiveStatus === 'payment_pending';
  const pending = ad.status === 'pending_moderation';
  const deleted = ad.status === 'deleted';
  const activeRevision = ad.revision;
  const revisionAwaitingPayment = activeRevision?.status === 'awaiting_payment';
  const revisionPendingModeration = activeRevision?.status === 'pending_moderation';
  const revisionCanSubmit = activeRevision?.status === 'draft' || activeRevision?.status === 'rejected';
  const publicUrl = getAdUrl(ad);
  const isPublic = isActiveStatus(effectiveStatus);
  const canResubmit =
    revisionCanSubmit ||
    (!activeRevision &&
      (effectiveStatus === 'rejected' ||
        effectiveStatus === 'approved' ||
        effectiveStatus === 'published' ||
        effectiveStatus === 'hidden' ||
        effectiveStatus === 'archived'));

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
        promotion={ad.promotion}
      />

      <div className="space-y-3 rounded-panel border border-white/8 bg-surface-950/70 p-3 shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatChip label={status.label} tone={status.tone} icon={status.icon} />
          <StatChip label={`срок: ${activeLabel(settings.activePeriod)}`} icon={<Clock3 size={15} />} />
          {ad.type === 'vacancy' ? (
            <StatChip label="Отклики" value={String(ad.applicationsCount ?? 0)} tone={(ad.applicationsCount ?? 0) > 0 ? 'green' : 'neutral'} icon={<Users size={15} />} />
          ) : null}
        </div>

        {ad.moderationReason ? (
          <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-3 py-2 text-sm text-accent-green">
            Что стоит поправить: {ad.moderationReason}
          </p>
        ) : null}

        {activeRevision ? (
          <RevisionNotice
            revision={activeRevision}
            estimate={ad.estimate ?? null}
            type={ad.type}
            paymentUrl={revisionAwaitingPayment ? paymentUrl : null}
          />
        ) : null}

        {ad.analytics ? <AdAnalyticsPanel ad={ad} /> : null}

        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="secondary" icon={<Eye size={17} />} className={isPublic ? undefined : 'col-span-2'} onClick={onPreview}>
            Предпросмотр
          </ActionButton>
          {isPublic ? (
            <LinkButtonLike to={publicUrl} icon={<Eye size={17} />}>
              На сайте
            </LinkButtonLike>
          ) : null}
          {isPublic && onPromote ? (
            <ActionButton variant="secondary" icon={<Sparkles size={17} />} disabled={busy || deleted} onClick={onPromote}>
              Продвинуть
            </ActionButton>
          ) : null}
          {ad.type === 'vacancy' ? (
            <ActionButton variant="secondary" icon={<Users size={17} />} disabled={busy || deleted} onClick={onApplications}>
              Отклики
            </ActionButton>
          ) : null}
          <ActionButton variant="secondary" icon={<Pencil size={17} />} disabled={deleted} onClick={onEdit}>
            Редактировать
          </ActionButton>
          <ActionButton variant="secondary" icon={<History size={17} />} disabled={busy} onClick={onHistory}>
            История версий
          </ActionButton>
          {revisionAwaitingPayment && paymentUrl ? (
            <ExternalButtonLike href={paymentUrl} icon={<CreditCard size={17} />}>
              Оплатить редакцию
            </ExternalButtonLike>
          ) : paymentPending && paymentUrl ? (
            <ExternalButtonLike href={paymentUrl} icon={<CreditCard size={17} />}>
              Оплатить
            </ExternalButtonLike>
          ) : revisionAwaitingPayment ? (
            <ActionButton variant="secondary" disabled icon={<Clock3 size={17} />}>
              Ожидает оплату
            </ActionButton>
          ) : paymentPending ? (
            <ActionButton variant="secondary" disabled icon={<Clock3 size={17} />}>
              Ожидает оплаты
            </ActionButton>
          ) : revisionPendingModeration || pending ? (
            <ActionButton variant="secondary" disabled icon={<Clock3 size={17} />}>
              На модерации
            </ActionButton>
          ) : canResubmit ? (
            <ActionButton icon={<Send size={17} />} disabled={busy || deleted} onClick={onResubmit}>
              {effectiveStatus === 'rejected' ? 'Отправить на проверку' : 'Опубликовать снова'}
            </ActionButton>
          ) : null}
          {!isHiddenStatus(effectiveStatus) && !deleted ? (
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
          {activeRevision && activeRevision.status !== 'approved' && activeRevision.status !== 'cancelled' ? (
            <ActionButton variant="secondary" icon={<X size={17} />} disabled={busy} onClick={onCancelRevision}>
              Отменить редакцию
            </ActionButton>
          ) : null}
          <ActionButton variant="danger" icon={<Trash2 size={17} />} disabled={busy || deleted} onClick={onDelete}>
            Удалить
          </ActionButton>
        </div>
      </div>
    </article>
  );
}

function AdAnalyticsPanel({ ad }: { ad: OwnedAdCard }) {
  const analytics = ad.analytics;

  if (!analytics) {
    return null;
  }

  const favoriteBalance = Math.max(0, analytics.totals.favoriteAdds - analytics.totals.favoriteRemoves);
  const contactActions =
    analytics.totals.contactOpens +
    analytics.totals.phoneClicks +
    analytics.totals.emailClicks +
    analytics.totals.maxClicks +
    analytics.totals.websiteClicks;
  const last7Views = analytics.series.slice(-7).reduce((sum, item) => sum + item.views, 0);
  const last30Views = analytics.series.reduce((sum, item) => sum + item.views, 0);

  return (
    <div className="grid gap-3 rounded-panel border border-white/8 bg-surface-900/80 p-3">
      <div className="flex flex-wrap gap-2">
        <StatChip label="Просмотры" value={String(analytics.totals.views)} tone={analytics.totals.views > 0 ? 'green' : 'neutral'} />
        <StatChip label="Уникальные" value={String(analytics.totals.uniqueViews)} />
        <StatChip label="Избранное" value={String(favoriteBalance)} />
        <StatChip label="Контакты" value={String(contactActions)} tone={contactActions > 0 ? 'green' : 'neutral'} />
        <StatChip label="Отклики" value={String(analytics.totals.applications)} tone={analytics.totals.applications > 0 ? 'green' : 'neutral'} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoCell label="7 дней" value={`${last7Views} просмотров`} />
        <InfoCell label="30 дней" value={`${last30Views} просмотров`} />
        <InfoCell label="В контакты" value={`${analytics.conversion.viewToContact}%`} />
        <InfoCell label="В отклики" value={`${analytics.conversion.viewToApplication}%`} />
      </div>
      {analytics.recommendations.length > 0 ? (
        <div className="grid gap-2">
          {analytics.recommendations.map((recommendation) => (
            <p key={recommendation.code} className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-3 py-2 text-sm leading-5 text-accent-green">
              <strong>{recommendation.title}.</strong> {recommendation.body}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-white/8 bg-black/[0.16] p-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-text-primary">{value}</p>
    </div>
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

function RevisionNotice({
  revision,
  estimate,
  type,
  paymentUrl
}: {
  revision: AdRevisionSummary;
  estimate: RevisionPublicationEstimate | null;
  type: PublicAdType;
  paymentUrl: string | null;
}) {
  const status = revisionStatusLabel(revision.status);

  return (
    <div className="grid gap-3 rounded-panel border border-accent-green/25 bg-accent-greenSoft px-3 py-3 text-sm text-accent-green">
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label={`Редакция #${revision.version}`} tone="green" icon={<Pencil size={15} />} />
        <StatChip label={status} tone="green" icon={<Clock3 size={15} />} />
      </div>

      {revision.rejectionReason ? (
        <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-red-100">
          Причина отказа: {revision.rejectionReason}
        </p>
      ) : null}

      {estimate ? (
        <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-950/55 p-3 text-text-primary">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">{type === 'vacancy' ? 'Списание публикаций' : 'Повторная публикация'}</span>
            <strong>{type === 'vacancy' ? (estimate.usesBalance ? '1' : 'после оплаты') : 'бесплатно'}</strong>
          </div>
          {type === 'vacancy' ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">Останется после отправки</span>
                <strong>{estimate.remainingAfter}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">Фото/видео</span>
                <strong>{estimate.mediaFeeRequired ? '+50 ₽' : 'без доплаты'}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary">Итого к оплате</span>
                <strong>{formatRubAmount(estimate.amount)}</strong>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {paymentUrl ? (
        <ExternalButtonLike href={paymentUrl} icon={<CreditCard size={17} />}>
          Оплатить редакцию
        </ExternalButtonLike>
      ) : null}
    </div>
  );
}

function RevisionHistorySheet({ ad, onClose }: { ad: OwnedAdCard; onClose: () => void }) {
  const [revisions, setRevisions] = useState<AdRevisionSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listAdRevisions(ad.id)
      .then((response) => {
        if (!active) {
          return;
        }

        setRevisions(response.data);
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
  }, [ad.id]);

  return (
    <Sheet title="История версий" onClose={onClose}>
      <div className="grid gap-3 pb-3">
        <SectionCard title={ad.title}>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Опубликованная версия" tone="green" icon={<CheckCircle2 size={15} />} />
            {ad.revision ? <StatChip label={`Активная редакция #${ad.revision.version}`} icon={<Pencil size={15} />} /> : null}
          </div>
        </SectionCard>

        {status === 'loading' ? <LoadingState /> : null}

        {status === 'error' ? (
          <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
        ) : null}

        {status === 'ready' && revisions.length === 0 ? (
          <p className="rounded-panel border border-white/10 bg-surface-850 px-3 py-3 text-sm text-text-secondary">
            Редакций пока нет.
          </p>
        ) : null}

        {revisions.map((revision) => (
          <div key={revision.id} className="grid gap-2 rounded-panel border border-white/10 bg-surface-950/70 p-3">
            <div className="flex flex-wrap gap-2">
              <StatChip label={`Версия #${revision.version}`} tone="green" />
              <StatChip label={revisionStatusLabel(revision.status)} />
            </div>
            {revision.snapshot ? (
              <div className="grid gap-1 rounded-panel border border-white/8 bg-surface-900/80 px-3 py-2">
                <strong className="text-sm text-text-primary">{revision.snapshot.title}</strong>
                {revision.snapshot.description ? (
                  <p className="line-clamp-3 text-sm leading-5 text-text-secondary">{revision.snapshot.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {revision.snapshot.categoryText ? <StatChip label={revision.snapshot.categoryText} tone="green" /> : null}
                  {revision.snapshot.districtText ? <StatChip label={revision.snapshot.districtText} /> : null}
                  {revision.snapshot.mediaChanged ? <StatChip label="медиа изменены" tone="green" /> : null}
                </div>
              </div>
            ) : null}
            <div className="grid gap-1 text-sm text-text-secondary">
              <span>Создано: {formatDateTime(revision.createdAt)}</span>
              {revision.submittedAt ? <span>Отправлено: {formatDateTime(revision.submittedAt)}</span> : null}
              {revision.approvedAt ? <span>Одобрено: {formatDateTime(revision.approvedAt)}</span> : null}
              {revision.rejectedAt ? <span>Отклонено: {formatDateTime(revision.rejectedAt)}</span> : null}
            </div>
            {revision.rejectionReason ? (
              <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {revision.rejectionReason}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function PreviewSheet({ ad, onClose }: { ad: OwnedAdCard; onClose: () => void }) {
  const preview = getRevisionPreview(ad);
  const status = userStatus(ad.status);
  const mediaUrl = preview.coverPhoto?.previewUrl ?? preview.coverPhoto?.url ?? null;

  return (
    <Sheet title="Предпросмотр объявления" onClose={onClose}>
      <div className="grid gap-4 pb-3">
        {preview.isRevision ? (
          <div className="rounded-panel border border-accent-green/25 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
            Предпросмотр новой редакции. Опубликованная версия останется без изменений до одобрения модератором.
          </div>
        ) : null}
        <div className="overflow-hidden rounded-panel border border-white/10 bg-surface-950/78">
          {mediaUrl ? (
            <MediaPreview
              src={mediaUrl}
              mimeType={preview.coverPhoto?.mimeType ?? undefined}
              alt={preview.title}
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
              {preview.isRevision ? <StatChip label="новая редакция" tone="green" icon={<Pencil size={15} />} /> : null}
            </div>
            <div>
              <h3 className="text-2xl font-black leading-tight text-text-primary">{preview.title}</h3>
              {preview.subtitle ? <p className="mt-1 text-sm font-semibold text-text-secondary">{preview.subtitle}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.locationShort ? <StatChip label={preview.locationShort} /> : null}
              {ad.shortSalary ? <StatChip label={ad.shortSalary} tone="green" /> : null}
              {preview.category ? <StatChip label={preview.category} tone="green" /> : null}
            </div>
          </div>
        </div>

        <SectionCard title="Описание">
          {preview.description ? (
            <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{preview.description}</p>
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
  onSaved: (result: UpdateOwnedAdResponse) => void;
}) {
  const initial = useMemo(() => createAdFormFromOwnedAd(ad), [ad]);
  const [form, setForm] = useState(initial.form);
  const [photos, setPhotos] = useState(initial.photos);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <TKey extends keyof AdCategoryFormState>(key: TKey, value: AdCategoryFormState[TKey]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const payload = buildAdRevisionUpdatePayload(ad.type, form, photos);

      if (!photosChanged) {
        delete payload.photos;
      }

      const response = await apiClient.updateMyAd(ad.id, payload);
      onSaved(response.data);
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'my_ads_load'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="Редактирование объявления" onClose={onClose}>
      <div className="grid gap-4 pb-[calc(120px+env(safe-area-inset-bottom))]">
        {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        <FormSection title="Основное">
          <Input label="Название" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
          {ad.type === 'resume' ? (
            <Input
              label="Профессия"
              value={form.specialty}
              placeholder="Например: сварщик, бетонщик, прораб"
              onChange={(event) => updateField('specialty', event.target.value)}
            />
          ) : null}
          {ad.type === 'material' || ad.type === 'tool' ? (
            <Input
              label="Категория"
              value={form.categoryText}
              placeholder={ad.type === 'material' ? 'Например: кирпич, бетон, пиломатериалы' : 'Например: электроинструмент'}
              onChange={(event) => updateField('categoryText', event.target.value)}
            />
          ) : null}
          <Textarea label="Описание" value={form.description} rows={6} onChange={(event) => updateField('description', event.target.value)} />
        </FormSection>


        <FormSection title="Цена, адрес и контакты">
          <Input
            label={ad.type === 'vacancy' ? 'Зарплата от' : ad.type === 'resume' ? 'Желаемая оплата' : 'Цена'}
            value={form.money}
            inputMode="numeric"
            onChange={(event) => updateField('money', event.target.value)}
          />
          <Input label="Контакты" value={form.contact} onChange={(event) => updateField('contact', event.target.value)} />
          <Input label="Адрес / город" value={form.address} onChange={(event) => updateField('address', event.target.value)} />
        </FormSection>

        <FormSection title="Фото и видео">
          <PhotoUploader
            photos={photos}
            maxFiles={8}
            altText={form.name.trim() || ad.title}
            onPhotosChange={(nextPhotos) => {
              setPhotos(nextPhotos);
              setPhotosChanged(true);
            }}
            onBusyChange={setIsMediaBusy}
          />
        </FormSection>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 rounded-panel border border-white/10 bg-surface-900/95 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
          <ActionButton type="button" disabled={saving || isMediaBusy} onClick={() => void save()}>
            {saving ? 'Сохраняем...' : 'Сохранить черновик изменений'}
          </ActionButton>
          <ActionButton type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}

function PromotionSheet({
  ad,
  onClose,
  onPurchased
}: {
  ad: OwnedAdCard;
  onClose: () => void;
  onPurchased: () => void;
}) {
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [purchases, setPurchases] = useState<PromotionPurchase[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busyType, setBusyType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    Promise.all([
      apiClient.listPromotionProductsForAd(ad.id),
      apiClient.listPromotionPurchasesForAd(ad.id)
    ])
      .then(([productsResponse, purchasesResponse]) => {
        if (!active) {
          return;
        }

        setProducts(productsResponse.data);
        setPurchases(purchasesResponse.data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'my_ads_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [ad.id]);

  const buy = async (product: PromotionProduct) => {
    try {
      setBusyType(product.type);
      setError(null);
      const response = await apiClient.createPromotionPurchase(ad.id, product.type);
      const paymentUrl = response.data.payment?.confirmationUrl?.trim();

      if (isValidPaymentConfirmationUrl(paymentUrl)) {
        openExternalUrlWithResult(paymentUrl);
      }

      onPurchased();
    } catch (requestError) {
      setError(getUserFacingError(requestError, 'my_ads_load'));
    } finally {
      setBusyType(null);
    }
  };

  return (
    <Sheet title="Продвинуть объявление" onClose={onClose}>
      <div className="grid gap-4">
        {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}

        <SectionCard title={ad.title} description="Доступные услуги зависят от настроек администратора и типа объявления. Цена берётся только с сервера.">
          <div className="flex flex-wrap gap-2">
            {ad.promotion?.pinned ? <StatChip label="Закреплено" tone="green" /> : null}
            {ad.promotion?.urgent ? <StatChip label="Срочно" tone="green" /> : null}
            {ad.promotion?.recommended ? <StatChip label="Рекомендовано" tone="green" /> : null}
            {ad.promotion?.highlighted ? <StatChip label="Выделено" tone="green" /> : null}
          </div>
        </SectionCard>

        {status === 'loading' ? <LoadingState /> : null}

        {status === 'error' ? (
          <EmptyState
            title="Не удалось загрузить продвижение"
            description={error ?? 'Попробуйте открыть окно ещё раз.'}
          />
        ) : null}

        {status === 'ready' && products.length === 0 ? (
          <EmptyState
            title="Услуги пока не настроены"
            description="Администратор должен включить продукт, цену и срок действия."
          />
        ) : null}

        {status === 'ready' && products.length > 0 ? (
          <section className="grid gap-3">
            {products.map((product) => (
              <div key={product.type} className="rounded-panel border border-white/10 bg-surface-900/92 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-text-primary">{promotionProductLabel(product.type)}</h3>
                    <p className="text-sm leading-5 text-text-secondary">{promotionProductDescription(product.type)}</p>
                  </div>
                  <StatChip label={formatRubAmount(product.price ?? '0.00')} tone="green" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatChip label={product.durationHours ? `срок: ${formatDuration(product.durationHours)}` : 'разовое действие'} />
                  <StatChip label={product.channelBehavior.autoBumpChannels === 'NONE' ? 'Mini App' : 'каналы по настройке'} />
                </div>
                <ActionButton
                  className="mt-3"
                  type="button"
                  icon={<CreditCard size={17} />}
                  disabled={busyType === product.type}
                  onClick={() => void buy(product)}
                >
                  {busyType === product.type ? 'Готовим оплату...' : 'Оплатить'}
                </ActionButton>
              </div>
            ))}
          </section>
        ) : null}

        {purchases.length > 0 ? (
          <SectionCard title="История продвижения" description="Активные и ожидающие оплаты услуги по этому объявлению.">
            <div className="grid gap-2">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="rounded-panel border border-white/10 bg-black/[0.12] p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{promotionProductLabel(purchase.productType)}</strong>
                    <span className="text-text-secondary">{purchase.status}</span>
                  </div>
                  <p className="mt-1 text-text-secondary">
                    {formatRubAmount(purchase.amount)}
                    {purchase.endsAt ? ` до ${formatDateTime(purchase.endsAt)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
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
  const canUseAutoRepeat = ad.status === 'published';
  const effectiveAutoRepeat = canUseAutoRepeat && draft.autoRepeat;

  const updateDraft = <TKey extends keyof PublicationSettings>(key: TKey, value: PublicationSettings[TKey]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = () => {
    onSave(canUseAutoRepeat ? draft : { ...draft, autoRepeat: false });
  };

  return (
    <Sheet title="Пульт управления публикацией" onClose={onClose}>
      <div className="grid gap-4">
        <SectionCard title={ad.title} description="Настройте, как объявление будет жить после публикации.">
          <div className="flex flex-wrap gap-2">
            <StatChip label={status.label} tone={status.tone} icon={status.icon} />
            {effectiveAutoRepeat ? <StatChip label="автопубликация включена" tone="green" icon={<RotateCcw size={15} />} /> : null}
          </div>
        </SectionCard>

        <ToggleRow
          title="Автопубликация"
          description={canUseAutoRepeat ? 'Объявление будет повторяться по выбранному периоду.' : 'Доступна после публикации объявления в канал.'}
          checked={effectiveAutoRepeat}
          disabled={!canUseAutoRepeat}
          onChange={(value) => updateDraft('autoRepeat', value)}
        />

        <Select
          label="Повтор публикации"
          value={draft.repeatPeriod}
          options={repeatPeriodOptions}
          disabled={!effectiveAutoRepeat}
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
          <ActionButton type="button" onClick={saveDraft} icon={<CheckCircle2 size={18} />}>
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
  disabled = false,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center justify-between gap-4 rounded-panel border border-white/10 bg-surface-900/92 p-4 text-left transition ${
        disabled ? 'cursor-not-allowed opacity-65' : 'hover:border-accent-green/35 active:scale-[0.985]'
      }`}
      disabled={disabled}
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

const applicationStatusTabs: Array<{ value: JobApplicationStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'viewed', label: 'Просмотрены' },
  { value: 'contacted', label: 'Связались' },
  { value: 'suitable', label: 'Подходят' },
  { value: 'rejected', label: 'Отказ' },
  { value: 'withdrawn', label: 'Отозваны' }
];

function VacancyApplicationsSheet({ ad, onClose }: { ad: OwnedAdCard; onClose: () => void }) {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<JobApplicationStatus | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listVacancyApplications(ad.id, filter ? { status: filter } : {})
      .then((response) => {
        if (!active) {
          return;
        }

        setApplications(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'applications_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [ad.id, filter, reloadKey]);

  const updateStatus = async (
    application: JobApplication,
    nextStatus: Extract<JobApplicationStatus, 'viewed' | 'contacted' | 'suitable' | 'rejected'>
  ) => {
    setBusyId(application.id);
    setError(null);

    try {
      const response = await apiClient.updateJobApplicationStatus(application.id, nextStatus);
      setApplications((items) => items.map((item) => (item.id === application.id ? response.data : item)));
    } catch (requestError: unknown) {
      setError(getUserFacingError(requestError, 'application_status'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet title="Отклики на вакансию" onClose={onClose}>
      <div className="grid gap-3 pb-3">
        <SectionCard title={ad.title}>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Отклики" value={String(ad.applicationsCount ?? applications.length)} tone="green" icon={<Users size={15} />} />
            <StatChip label={typeLabel(ad.type)} />
          </div>
        </SectionCard>

        <TabRow items={applicationStatusTabs} value={filter} onChange={setFilter} />

        {status === 'loading' ? <LoadingState /> : null}

        {error ? (
          <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
        ) : null}

        {status === 'error' ? (
          <ActionButton variant="secondary" icon={<RefreshCw size={17} />} onClick={() => setReloadKey((value) => value + 1)}>
            Повторить загрузку
          </ActionButton>
        ) : null}

        {status === 'ready' && applications.length === 0 ? (
          <EmptyState title="Откликов пока нет" description="Когда кандидаты откликнутся, они появятся здесь." />
        ) : null}

        {applications.map((application) => (
          <EmployerApplicationCard
            key={application.id}
            application={application}
            busy={busyId === application.id}
            onStatusChange={(nextStatus) => void updateStatus(application, nextStatus)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function EmployerApplicationCard({
  application,
  busy,
  onStatusChange
}: {
  application: JobApplication;
  busy: boolean;
  onStatusChange: (status: Extract<JobApplicationStatus, 'viewed' | 'contacted' | 'suitable' | 'rejected'>) => void;
}) {
  const candidateName =
    application.resumeSnapshot?.title ??
    application.applicant.displayName ??
    application.applicant.firstName ??
    application.applicant.maxUsername ??
    'Кандидат';
  const selectedStatus =
    application.status === 'new' || application.status === 'withdrawn' ? 'viewed' : application.status;

  return (
    <article className="grid gap-3 rounded-panel border border-white/10 bg-surface-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-black text-text-primary">{candidateName}</h3>
          <p className="mt-1 text-xs font-semibold text-text-muted">Отклик от {formatDate(application.createdAt)}</p>
        </div>
        <StatChip label={applicationStatusLabel(application.status)} tone={application.status === 'suitable' ? 'green' : 'neutral'} icon={<Users size={15} />} />
      </div>

      {application.resumeSnapshot ? (
        <div className="rounded-panel border border-white/8 bg-surface-900/80 p-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Резюме кандидата</p>
          <p className="mt-1 text-sm font-extrabold text-text-primary">{application.resumeSnapshot.title}</p>
          {application.resumeSnapshot.subtitle ? <p className="mt-1 text-sm text-text-secondary">{application.resumeSnapshot.subtitle}</p> : null}
          {application.resumeSnapshot.shortSalary ? <p className="mt-2 text-sm font-extrabold text-accent-green">{application.resumeSnapshot.shortSalary}</p> : null}
        </div>
      ) : null}

      {application.coverMessage ? (
        <p className="whitespace-pre-line rounded-panel border border-white/8 bg-surface-900/80 p-3 text-sm leading-6 text-text-secondary">
          {application.coverMessage}
        </p>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Контакты</p>
        {application.contactSnapshot?.contacts.length ? (
          <div className="grid gap-2">
            {application.contactSnapshot.contacts.map((contact) => (
              <div key={`${contact.type}-${contact.value}`} className="rounded-panel border border-white/8 bg-surface-900/80 px-3 py-2">
                <p className="text-xs font-semibold text-text-muted">{contact.label ?? contact.type.toUpperCase()}</p>
                <p className="break-words text-sm font-bold text-text-primary">{contact.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Контакты не указаны в отклике.</p>
        )}
      </div>

      <Select
        label="Статус"
        value={selectedStatus}
        disabled={busy || application.status === 'withdrawn'}
        options={[
          { value: 'viewed', label: 'Просмотрен' },
          { value: 'contacted', label: 'Связались' },
          { value: 'suitable', label: 'Подходит' },
          { value: 'rejected', label: 'Отказ' }
        ]}
        onChange={(event) => onStatusChange(event.target.value as Extract<JobApplicationStatus, 'viewed' | 'contacted' | 'suitable' | 'rejected'>)}
      />
    </article>
  );
}

function applicationStatusLabel(status: JobApplicationStatus): string {
  const labels: Record<JobApplicationStatus, string> = {
    new: 'Новый',
    viewed: 'Просмотрен',
    contacted: 'Связались',
    suitable: 'Подходит',
    rejected: 'Отказ',
    withdrawn: 'Отозван'
  };

  return labels[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
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

function ExternalButtonLike({
  href,
  icon,
  children,
  className
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-extrabold text-surface-950 shadow-glow transition duration-200 active:scale-[0.985] ${className ?? ''}`}
      onClick={(event) => {
        event.preventDefault();
        openExternalUrlWithResult(href);
      }}
    >
      {icon}
      {children}
    </a>
  );
}

function getRevisionPreview(ad: OwnedAdCard) {
  const snapshot = ad.revision?.snapshot;

  if (!snapshot) {
    return {
      isRevision: false,
      title: ad.title,
      subtitle: ad.subtitle,
      description: ad.description,
      locationShort: ad.locationShort,
      category: ad.category,
      coverPhoto: ad.coverPhoto
    };
  }

  return {
    isRevision: true,
    title: snapshot.title,
    subtitle: ad.type === 'resume' ? snapshot.desiredPosition ?? ad.subtitle : ad.subtitle,
    description: snapshot.description,
    locationShort: snapshot.districtText ?? snapshot.city ?? ad.locationShort,
    category: snapshot.categoryText ?? ad.category,
    coverPhoto: snapshot.coverPhoto ?? ad.coverPhoto
  };
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

  if (status === 'payment_pending') {
    return { label: 'Ожидает оплаты', tone: 'neutral', icon: <Clock3 size={15} /> };
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

function revisionStatusLabel(status: AdRevisionSummary['status']): string {
  const labels: Record<AdRevisionSummary['status'], string> = {
    draft: 'Черновик изменений',
    awaiting_payment: 'Ожидает оплаты',
    pending_moderation: 'На модерации',
    approved: 'Одобрена',
    rejected: 'Отклонена',
    cancelled: 'Отменена'
  };

  return labels[status];
}

function isActiveStatus(status: PublicAdStatus) {
  return status === 'published' || status === 'approved';
}

function isHiddenStatus(status: PublicAdStatus) {
  return status === 'hidden';
}

function activeLabel(value: PublicationSettings['activePeriod']) {
  return activePeriodOptions.find((option) => option.value === value)?.label ?? '7 дней';
}

function formatRubAmount(amount: string): string {
  const parsed = Number(amount.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    return `${amount} ₽`;
  }

  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(parsed)} ₽`;
}

function promotionProductLabel(type: PromotionProduct['type']): string {
  const labels: Record<PromotionProduct['type'], string> = {
    BUMP_ONCE: 'Поднять один раз',
    URGENT_BADGE: 'Срочно',
    PIN_CATEGORY: 'Закрепить в категории',
    HIGHLIGHT_CARD: 'Выделить карточку',
    RECOMMENDED: 'Рекомендовано',
    AUTO_BUMP: 'Автоподнятие'
  };

  return labels[type];
}

function promotionProductDescription(type: PromotionProduct['type']): string {
  const descriptions: Record<PromotionProduct['type'], string> = {
    BUMP_ONCE: 'Объявление поднимется выше обычных публикаций.',
    URGENT_BADGE: 'На карточке появится заметка «Срочно».',
    PIN_CATEGORY: 'Объявление будет выше остальных в своём разделе.',
    HIGHLIGHT_CARD: 'Карточка получит аккуратное визуальное выделение.',
    RECOMMENDED: 'Объявление попадёт в приоритетный блок и выше в выдаче.',
    AUTO_BUMP: 'Сервис будет регулярно обновлять позицию в Mini App.'
  };

  return descriptions[type];
}

function formatDuration(hours: number): string {
  if (hours % 24 === 0) {
    return `${hours / 24} дн.`;
  }

  return `${hours} ч.`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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

function formatResubmitNotice(publication: AdLifecycleActionResponse['publication']): string | undefined {
  if (!publication) {
    return undefined;
  }

  if (publication.status === 'published') {
    return 'Объявление повторно опубликовано в канале.';
  }

  if (publication.status === 'skipped') {
    const reason = publication.reason?.toLowerCase() ?? '';

    if (reason.includes('not configured')) {
      return 'Канал для публикации не настроен. Объявление осталось активным в приложении.';
    }

    return 'Объявление уже опубликовано или публикация сейчас выполняется.';
  }

  return 'Не получилось повторно опубликовать объявление в канале. Попробуйте ещё раз.';
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

function clearCreateDraft(type: PublicAdType): void {
  try {
    window.localStorage.removeItem(`rabst24:create:${type}:simple`);
    window.localStorage.removeItem(`rabst24:create:${type}:simple:photos`);
  } catch {
    // Draft cleanup is best-effort; deletion itself has already succeeded.
  }
}
