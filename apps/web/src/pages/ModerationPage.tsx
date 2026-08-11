import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  CheckCircle2,
  CreditCard,
  Eye,
  Flag,
  Phone,
  RefreshCw,
  Radio,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import { useSearchParams } from 'react-router-dom';
import type { ChannelRemovalResult, ModerationAdDetail, ModerationQueueStatus, PublicAdDetail } from '../features/ads/ad.types.js';
import type { AdReportAction, AdReportStatus, ModerationAdReport } from '../features/reports/report.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { MediaPreview } from '../shared/ui/MediaPreview.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { Textarea } from '../shared/ui/Textarea.js';

const queueTabs: Array<{ value: ModerationQueueStatus; label: string }> = [
  { value: 'pending_moderation', label: 'На модерации' },
  { value: 'payment_pending', label: 'Ожидают оплаты' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'approved', label: 'Одобренные' },
  { value: 'hidden', label: 'Скрытые' },
  { value: 'archived', label: 'Архив' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: 'deleted', label: 'Удалённые' },
  { value: 'test', label: 'Тестовые' }
];

const moderationViewTabs: Array<{ value: 'ads' | 'reports'; label: string }> = [
  { value: 'ads', label: 'Объявления' },
  { value: 'reports', label: 'Жалобы' }
];

const moderationContactText = {
  title: '\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0430',
  empty: '\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d.',
  call: '\u041f\u043e\u0437\u0432\u043e\u043d\u0438\u0442\u044c',
  contact: '\u041a\u043e\u043d\u0442\u0430\u043a\u0442',
  phone: '\u0422\u0435\u043b\u0435\u0444\u043e\u043d',
  preferred: '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439'
};

const moderationAccountText = {
  title: '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0430\u0432\u0442\u043e\u0440\u0430',
  name: '\u0418\u043c\u044f',
  maxId: 'MAX ID',
  username: 'MAX username',
  internalId: '\u0412\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0439 ID',
  noUsername: '\u0411\u0435\u0437 username'
};

export function ModerationPage() {
  const role = useAppStore((state) => state.user.role);
  const [searchParams] = useSearchParams();
  const targetAdId = searchParams.get('adId');
  const [view, setView] = useState<'ads' | 'reports'>('ads');
  const [queueStatus, setQueueStatus] = useState<ModerationQueueStatus>('pending_moderation');
  const [ads, setAds] = useState<ModerationAdDetail[]>([]);
  const [selected, setSelected] = useState<ModerationAdDetail | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (role !== 'admin' && role !== 'moderator') {
      setStatus('ready');
      return;
    }

    if (view === 'reports') {
      setStatus('ready');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listModerationQueue({ status: queueStatus, page: 1, perPage: 30 })
      .then((response) => {
        if (!active) {
          return;
        }

        setAds(response.data);
        setSelected((current) => {
          const targetAd = targetAdId ? response.data.find((ad) => ad.id === targetAdId) : null;
          return targetAd ?? response.data.find((ad) => ad.id === current?.id) ?? response.data[0] ?? null;
        });
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'moderation_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [queueStatus, role, reloadKey, targetAdId, view]);

  const stats = useMemo(() => {
    const published = ads.filter((ad) => ad.status === 'published' || ad.status === 'approved').length;
    const pending = ads.filter((ad) => ad.status === 'pending_moderation' || ad.revision?.status === 'pending_moderation').length;
    const hidden = ads.filter((ad) => ad.status === 'hidden' || ad.status === 'archived').length;

    return { published, pending, hidden, total: ads.length };
  }, [ads]);

  if (role !== 'admin' && role !== 'moderator') {
    return (
      <AppPage>
        <EmptyState title="Нет доступа" description="Раздел модерации доступен только администраторам и модераторам." />
      </AppPage>
    );
  }

  const reload = () => setReloadKey((value) => value + 1);

  const runAction = async (key: string, action: () => Promise<string>) => {
    try {
      setBusyAction(key);
      setActionMessage(null);
      const message = await action();
      setReason('');
      setActionMessage(message);
      reload();
    } catch (requestError) {
      setActionMessage(getUserFacingError(requestError, 'moderation_action'));
    } finally {
      setBusyAction(null);
    }
  };

  const approve = (adId: string) =>
    runAction(`approve-${adId}`, async () => {
      const response = await apiClient.approveModerationAd(adId);
      const publication = response.data.publication;

      if (publication?.status === 'published') {
        return publication.mediaStrategy === 'reusable_max_media_token'
          ? 'Объявление опубликовано в приложении и канале. Фото отправлено через сохранённый MAX media token.'
          : 'Объявление опубликовано в приложении и канале.';
      }

      if (publication?.status === 'failed') {
        return `Объявление одобрено, но публикация в канал не прошла: ${publication.error ?? 'ошибка отправки'}.`;
      }

      if (publication?.status === 'skipped') {
        return 'Объявление одобрено. Повторная публикация в канал пропущена защитой от дубля или из-за смены статуса.';
      }

      return 'Объявление одобрено.';
    });

  const reject = (adId: string) => {
    if (reason.trim().length < 3) {
      setActionMessage('Укажите причину отклонения.');
      return;
    }

    void runAction(`reject-${adId}`, async () => {
      const response = await apiClient.rejectModerationAd(adId, reason.trim());
      return `Объявление отклонено. Автоматический возврат не запускался.${formatChannelRemoval(response.data.channelRemoval)}`;
    });
  };

  const hide = (adId: string) =>
    runAction(`hide-${adId}`, async () => {
      const response = await apiClient.hideModerationAd(adId, reason.trim() || undefined);
      return `Объявление больше не отображается в общей ленте.${formatChannelRemoval(response.data.channelRemoval)}`;
    });

  const unpublish = (adId: string) =>
    runAction(`unpublish-${adId}`, async () => {
      const response = await apiClient.unpublishModerationAd(adId, reason.trim() || undefined);
      return `Объявление снято с публикации.${formatChannelRemoval(response.data.channelRemoval)}`;
    });

  const archive = (adId: string) => {
    if (!window.confirm('Архивировать объявление? Оно будет скрыто из общей ленты и по возможности снято из канала.')) {
      return;
    }

    void runAction(`archive-${adId}`, async () => {
      const response = await apiClient.archiveModerationAd(adId, reason.trim() || undefined);
      return `Объявление архивировано.${formatChannelRemoval(response.data.channelRemoval)}`;
    });
  };

  const deleteAd = (adId: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить объявление? Объявление будет скрыто из приложения и по возможности удалено из канала.')) {
      return;
    }

    void runAction(`delete-${adId}`, async () => {
      const response = await apiClient.deleteModerationAd(adId, reason.trim() || undefined);
      return `Объявление удалено.${formatChannelRemoval(response.data.channelRemoval)}`;
    });
  };

  const removeFromChannel = (adId: string) => {
    if (!window.confirm('Снять пост объявления из канала и выключить автопубликацию? Само объявление в приложении останется в текущем статусе.')) {
      return;
    }

    void runAction(`remove-channel-${adId}`, async () => {
      const response = await apiClient.removeModerationAdFromChannel(adId);
      return `Проверили публикации в канале и выключили автопубликацию.${formatChannelRemoval(response.data.channelRemoval)}`;
    });
  };

  const selectedPreview = selected ? getModerationRevisionPreview(selected) : null;

  return (
    <AppPage>
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase text-accent-green">Подтверждение</p>
        <h1 className="text-2xl font-black text-text-primary">Модерация объявлений</h1>
        <p className="text-sm leading-5 text-text-secondary">
          Проверяйте заявки, снимайте ошибочные публикации и быстро чистите тестовые объявления.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip label="в списке" value={String(stats.total)} tone="green" />
        <StatChip label="опубликовано" value={String(stats.published)} tone="green" />
        <StatChip label="на модерации" value={String(stats.pending)} />
        <StatChip label="скрыто/архив" value={String(stats.hidden)} />
      </div>

      <TabRow items={moderationViewTabs} value={view} onChange={setView} />

      {view === 'reports' ? <ReportModerationPanel /> : null}

      {view === 'ads' ? (
      <TabRow
        items={queueTabs}
        value={queueStatus}
        onChange={(value) => {
          setQueueStatus(value);
          setSelected(null);
          setActionMessage(null);
        }}
      />
      ) : null}

      {view === 'ads' && actionMessage ? (
        <p className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {actionMessage}
        </p>
      ) : null}

      {view === 'ads' && status === 'loading' ? <LoadingState /> : null}

      {view === 'ads' && status === 'error' ? (
        <EmptyState
          title="Очередь не загрузилась"
          description={error ?? 'Попробуйте ещё раз.'}
          action={<ActionButton icon={<RefreshCw size={18} />} onClick={reload}>Повторить</ActionButton>}
        />
      ) : null}

      {view === 'ads' && status === 'ready' && ads.length === 0 ? (
        <EmptyState title="Список пуст" description={emptyDescription(queueStatus)} />
      ) : null}

      {view === 'ads' && status === 'ready' && ads.length > 0 ? (
        <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
          <section className="grid min-w-0 max-w-full gap-2">
            {ads.map((ad) => {
              const preview = getModerationRevisionPreview(ad);

              return (
              <button
                key={ad.id}
                type="button"
                className={`w-full max-w-full overflow-hidden rounded-panel border p-3 text-left transition ${
                  selected?.id === ad.id ? 'border-accent-green bg-accent-greenSoft' : 'border-line bg-surface-850'
                }`}
                onClick={() => setSelected(ad)}
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-base font-bold text-text-primary">{preview.title}</p>
                    <p className="text-sm text-text-secondary">{preview.isRevision ? '\u041d\u043e\u0432\u0430\u044f \u0440\u0435\u0434\u0430\u043a\u0446\u0438\u044f' : typeLabel(ad.type)}</p>
                  </div>
                  <span className="max-w-full">
                    <StatChip label={statusLabel(ad.revision?.status ?? ad.status)} tone={isPublicStatus(ad.status) ? 'green' : 'neutral'} />
                  </span>
                  {ad.revision ? (
                    <span className="max-w-full">
                      <StatChip label={`\u0420\u0435\u0434\u0430\u043a\u0446\u0438\u044f #${ad.revision.version}`} tone="green" />
                    </span>
                  ) : null}
                  <span className="max-w-full">
                    <StatChip label={paymentLabel(ad.payment)} tone={ad.payment?.status === 'succeeded' ? 'green' : 'neutral'} />
                  </span>
                </div>
              </button>
              );
            })}
          </section>

          {selected && selectedPreview ? (
            <SectionCard title={selectedPreview.title} description={selectedPreview.subtitle ?? typeLabel(selected.type)}>
              <div className="grid gap-3">
                {selectedPreview.coverPhoto ? (
                  <MediaPreview
                    src={selectedPreview.coverPhoto.previewUrl ?? selectedPreview.coverPhoto.url}
                    mimeType={selectedPreview.coverPhoto.mimeType}
                    alt={selectedPreview.title}
                    className="aspect-[16/9] w-full rounded-panel object-cover"
                  />
                ) : null}
                <div className="flex max-w-full min-w-0 flex-wrap gap-2 overflow-hidden">
                  <span className="max-w-full">
                    <StatChip label={typeLabel(selected.type)} tone="green" icon={<ShieldCheck size={15} />} />
                  </span>
                  <span className="max-w-full">
                    <StatChip label={statusLabel(selected.revision?.status ?? selected.status)} tone={isPublicStatus(selected.status) ? 'green' : 'neutral'} />
                  </span>
                  {selected.revision ? (
                    <span className="max-w-full">
                      <StatChip label={`\u0420\u0435\u0434\u0430\u043a\u0446\u0438\u044f #${selected.revision.version}`} tone="green" />
                    </span>
                  ) : null}
                  {selectedPreview.category ? (
                    <span className="max-w-full">
                      <StatChip label={selectedPreview.category} />
                    </span>
                  ) : null}
                  {selectedPreview.locationShort ? (
                    <span className="max-w-full">
                      <StatChip label={selectedPreview.locationShort} tone="green" />
                    </span>
                  ) : null}
                </div>
                <ModerationAccountBlock owner={selected.owner} />
                <ModerationPaymentBlock payment={selected.payment} />
                <ModerationContactBlock contacts={selected.contacts} />
                {selectedPreview.description ? (
                  <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{selectedPreview.description}</p>
                ) : null}
                <Textarea
                  label="Причина, если отклоняете, скрываете или удаляете"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="grid gap-2">
                  <ActionButton
                    className="min-h-11"
                    icon={<CheckCircle2 size={18} />}
                    disabled={isBusy(busyAction) || (selected.status === 'published' && !selected.revision)}
                    onClick={() => void approve(selected.id)}
                  >
                    Одобрить и опубликовать
                  </ActionButton>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      variant="danger"
                      icon={<XCircle size={18} />}
                      disabled={isBusy(busyAction)}
                      onClick={() => reject(selected.id)}
                    >
                      Отклонить
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      icon={<Eye size={18} />}
                      disabled={isBusy(busyAction) || selected.status === 'hidden'}
                      onClick={() => void hide(selected.id)}
                    >
                      Скрыть
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      icon={<Ban size={18} />}
                      disabled={isBusy(busyAction) || !isPublicStatus(selected.status)}
                      onClick={() => void unpublish(selected.id)}
                    >
                      Снять с публикации
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      icon={<Radio size={18} />}
                      disabled={isBusy(busyAction)}
                      onClick={() => removeFromChannel(selected.id)}
                    >
                      Снять из канала
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      icon={<Archive size={18} />}
                      disabled={isBusy(busyAction) || selected.status === 'archived'}
                      onClick={() => archive(selected.id)}
                    >
                      Архивировать
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      icon={<Trash2 size={18} />}
                      disabled={isBusy(busyAction) || selected.status === 'deleted'}
                      onClick={() => deleteAd(selected.id)}
                    >
                      Удалить
                    </ActionButton>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </AppPage>
  );
}

function ReportModerationPanel() {
  const [reports, setReports] = useState<ModerationAdReport[]>([]);
  const [selected, setSelected] = useState<ModerationAdReport | null>(null);
  const [filter, setFilter] = useState<AdReportStatus>('OPEN');
  const [action, setAction] = useState<AdReportAction>('no_violation');
  const [resolution, setResolution] = useState('');
  const [tempBlockDays, setTempBlockDays] = useState(7);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listModerationReports({ status: filter, page: 1, perPage: 30 })
      .then((response) => {
        if (!active) {
          return;
        }

        setReports(response.data);
        setSelected((current) => response.data.find((report) => report.id === current?.id) ?? response.data[0] ?? null);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'moderation_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [filter, reloadKey]);

  const resolve = async () => {
    if (!selected) {
      return;
    }

    if (resolution.trim().length < 3) {
      setMessage('Укажите решение модератора.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await apiClient.resolveAdReport(selected.id, {
        action,
        resolution: resolution.trim(),
        tempBlockDays: action === 'temp_block_user' ? tempBlockDays : undefined
      });
      setSelected(response.data);
      setResolution('');
      setMessage('Решение по жалобе сохранено.');
      setReloadKey((value) => value + 1);
    } catch (requestError: unknown) {
      setMessage(getUserFacingError(requestError, 'moderation_action'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <TabRow
        items={[
          { value: 'OPEN', label: 'Открытые' },
          { value: 'IN_REVIEW', label: 'В работе' },
          { value: 'RESOLVED_ACTION_TAKEN', label: 'С мерами' },
          { value: 'RESOLVED_NO_VIOLATION', label: 'Без нарушения' },
          { value: 'CANCELLED', label: 'Отменены' }
        ]}
        value={filter}
        onChange={setFilter}
      />

      {message ? (
        <p className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {message}
        </p>
      ) : null}

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Жалобы не загрузились"
          description={error ?? 'Попробуйте обновить список.'}
          action={<ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>Обновить</ActionButton>}
        />
      ) : null}

      {status === 'ready' && reports.length === 0 ? (
        <EmptyState title="Жалоб нет" description="В выбранном статусе пока нет жалоб." />
      ) : null}

      {status === 'ready' && reports.length > 0 ? (
        <div className="grid gap-4">
          <section className="grid gap-2">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                className={`rounded-panel border p-3 text-left transition ${
                  selected?.id === report.id ? 'border-accent-green bg-accent-greenSoft' : 'border-line bg-surface-850'
                }`}
                onClick={() => setSelected(report)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-text-primary">{report.ad.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">{reportReasonLabel(report.reason)} / {formatDateTime(report.createdAt)}</p>
                  </div>
                  <StatChip label={reportStatusLabel(report.status)} tone={report.status === 'OPEN' ? 'green' : 'neutral'} icon={<Flag size={15} />} />
                </div>
              </button>
            ))}
          </section>

          {selected ? (
            <SectionCard title={selected.ad.title} description={`${reportReasonLabel(selected.reason)} / ${reportStatusLabel(selected.status)}`}>
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  <StatChip label={selected.ad.type} />
                  <StatChip label={selected.ad.status} />
                  <StatChip label="других жалоб" value={String(selected.otherReportsCount)} />
                  <StatChip label="отклоненных объявлений" value={String(selected.rejectedAdsCount)} />
                  <StatChip label={`автор: ${selected.reportedUser.status}`} />
                </div>

                <InfoBlock title="Комментарий жалобщика" empty="Комментарий не указан" items={selected.comment ? [selected.comment] : []} />
                <InfoBlock
                  title="История жалобы"
                  empty="Истории пока нет"
                  items={selected.history.map((item) => `${formatDateTime(item.createdAt)} / ${item.action}: ${item.statusFrom ?? 'new'} -> ${item.statusTo}${item.reason ? ` / ${item.reason}` : ''}`)}
                />
                <InfoBlock
                  title="Moderation logs"
                  empty="Логов по объявлению нет"
                  items={selected.moderationLogs.map((log) => `${formatDateTime(log.createdAt)} / ${log.action}: ${log.statusFrom ?? '-'} -> ${log.statusTo ?? '-'}${log.reason ? ` / ${log.reason}` : ''}`)}
                />

                {selected.status === 'OPEN' || selected.status === 'IN_REVIEW' ? (
                  <div className="grid gap-3 rounded-panel border border-white/10 bg-surface-900/80 p-3">
                    <label className="grid gap-2 text-sm font-bold text-text-secondary">
                      Действие
                      <select
                        className="min-h-11 rounded-panel border border-white/10 bg-surface-950 px-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-green"
                        value={action}
                        onChange={(event) => setAction(event.target.value as AdReportAction)}
                      >
                        <option value="no_violation">Нет нарушения</option>
                        <option value="hide_ad">Скрыть объявление</option>
                        <option value="send_to_moderation">На повторную модерацию</option>
                        <option value="delete_ad">Удалить объявление</option>
                        <option value="warn_user">Предупредить пользователя</option>
                        <option value="temp_block_user">Временно заблокировать</option>
                        <option value="block_user">Заблокировать</option>
                      </select>
                    </label>
                    {action === 'temp_block_user' ? (
                      <label className="grid gap-2 text-sm font-bold text-text-secondary">
                        Дней блокировки
                        <input
                          className="min-h-11 rounded-panel border border-white/10 bg-surface-950 px-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-green"
                          type="number"
                          min={1}
                          max={30}
                          value={tempBlockDays}
                          onChange={(event) => setTempBlockDays(Number(event.target.value))}
                        />
                      </label>
                    ) : null}
                    <Textarea
                      label="Решение и причина"
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                    />
                    <ActionButton icon={<CheckCircle2 size={18} />} disabled={busy} onClick={() => void resolve()}>
                      Сохранить решение
                    </ActionButton>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({ title, empty, items }: { title: string; empty: string; items: string[] }) {
  return (
    <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/80 p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">{title}</p>
      {items.length === 0 ? <p className="text-sm text-text-secondary">{empty}</p> : null}
      {items.map((item) => (
        <p key={item} className="whitespace-pre-line break-words rounded-panel border border-white/8 bg-surface-950/70 px-3 py-2 text-sm leading-5 text-text-secondary">
          {item}
        </p>
      ))}
    </div>
  );
}

function getModerationRevisionPreview(ad: ModerationAdDetail) {
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

function ModerationAccountBlock({ owner }: { owner: PublicAdDetail['owner'] }) {
  const fullName = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  const username = owner.maxUsername?.trim();
  const displayUsername = username ? (username.startsWith('@') ? username : `@${username}`) : moderationAccountText.noUsername;
  const displayName = owner.displayName?.trim() || fullName || username || `MAX ${owner.maxUserId}`;

  return (
    <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/80 p-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-text-primary">
        <UserRound size={16} className="shrink-0 text-accent-green" />
        {moderationAccountText.title}
      </div>
      <div className="grid gap-2">
        <ModerationInfoRow label={moderationAccountText.name} value={displayName} />
        <ModerationInfoRow label={moderationAccountText.maxId} value={owner.maxUserId} />
        <ModerationInfoRow label={moderationAccountText.username} value={displayUsername} />
        <ModerationInfoRow label={moderationAccountText.internalId} value={owner.id} />
      </div>
    </div>
  );
}

function ModerationPaymentBlock({ payment }: { payment: ModerationAdDetail['payment'] }) {
  if (!payment) {
    return (
      <div className="grid gap-2 rounded-panel border border-yellow-400/20 bg-yellow-500/10 p-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-text-primary">
          <CreditCard size={16} className="shrink-0 text-yellow-200" />
          Оплата
        </div>
        <ModerationInfoRow label="Статус" value="Платёж не создан" />
      </div>
    );
  }

  const paidAt = payment.paidAt ? formatDateTime(payment.paidAt) : null;
  const refundedAt = payment.refundedAt ? formatDateTime(payment.refundedAt) : null;

  return (
    <div className="grid gap-2 rounded-panel border border-accent-green/20 bg-accent-greenSoft/55 p-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-text-primary">
        <CreditCard size={16} className="shrink-0 text-accent-green" />
        Оплата
      </div>
      <div className="grid gap-2">
        <ModerationInfoRow label="Статус" value={paymentStatusLabel(payment.status)} />
        <ModerationInfoRow label="Сумма" value={`${payment.amount} ${payment.currency}`} />
        <ModerationInfoRow label="YooKassa" value={payment.paymentId} />
        {paidAt ? <ModerationInfoRow label="Оплачено" value={paidAt} /> : null}
        {refundedAt ? <ModerationInfoRow label="Возврат" value={refundedAt} /> : null}
      </div>
    </div>
  );
}

function ModerationInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[92px_1fr] gap-2 rounded-panel border border-white/8 bg-black/[0.14] px-3 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="min-w-0 break-words font-bold text-text-primary">{value}</span>
    </div>
  );
}

function ModerationContactBlock({ contacts }: { contacts: PublicAdDetail['contacts'] }) {
  const visibleContacts = contacts.filter((contact) => contact.value.trim());

  return (
    <div className="grid gap-2 rounded-panel border border-accent-green/20 bg-accent-greenSoft/55 p-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-text-primary">
        <Phone size={16} className="shrink-0 text-accent-green" />
        {moderationContactText.title}
      </div>

      {visibleContacts.length > 0 ? (
        <div className="grid gap-2">
          {visibleContacts.map((contact) => {
            const phoneHref = getPhoneHref(contact.value);
            const content = (
              <>
                <span className="min-w-0">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-muted">
                    {contact.label?.trim() || contactTypeLabel(contact.type)}
                    {contact.isPreferred ? ` / ${moderationContactText.preferred}` : null}
                  </span>
                  <span className="block break-words text-sm font-bold text-text-primary">{contact.value}</span>
                </span>
                {phoneHref ? (
                  <span className="shrink-0 rounded-full border border-accent-green/25 bg-surface-950/50 px-2.5 py-1 text-xs font-extrabold text-accent-green">
                    {moderationContactText.call}
                  </span>
                ) : null}
              </>
            );

            return phoneHref ? (
              <a
                key={contact.id}
                href={phoneHref}
                className="flex min-w-0 items-center justify-between gap-2 rounded-panel border border-white/10 bg-surface-900/78 px-3 py-2 transition hover:border-accent-green/35"
              >
                {content}
              </a>
            ) : (
              <div
                key={contact.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-panel border border-white/10 bg-surface-900/78 px-3 py-2"
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm leading-5 text-text-secondary">{moderationContactText.empty}</p>
      )}
    </div>
  );
}

function TabRow<TValue extends string>({
  items,
  value,
  onChange
}: {
  items: Array<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="flex max-w-full min-w-0 gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <button
          key={item.value}
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

function formatChannelRemoval(result?: ChannelRemovalResult): string {
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

function emptyDescription(status: ModerationQueueStatus): string {
  if (status === 'test') {
    return 'Тестовых объявлений сейчас не найдено.';
  }

  if (status === 'pending_moderation') {
    return 'Новых заявок на подтверждение нет. После отправки объявления появятся здесь автоматически.';
  }

  if (status === 'payment_pending') {
    return 'Объявлений, ожидающих оплату, сейчас нет.';
  }

  return 'В выбранном статусе объявлений нет.';
}

function isBusy(value: string | null): boolean {
  return value !== null;
}

function isPublicStatus(status: string): boolean {
  return status === 'approved' || status === 'published';
}

function contactTypeLabel(type: string): string {
  return type.toLowerCase() === 'phone' ? moderationContactText.phone : moderationContactText.contact;
}

function getPhoneHref(value: string): string | null {
  const digits = value.match(/\d/g) ?? [];

  if (digits.length < 5) {
    return null;
  }

  const normalized = value.trim().replace(/[^\d+]/g, '');
  return normalized ? `tel:${normalized}` : null;
}

function typeLabel(type: string): string {
  if (type === 'resume') {
    return 'Резюме';
  }

  if (type === 'equipment') {
    return 'Техника';
  }

  if (type === 'material') {
    return 'Материалы';
  }

  if (type === 'tool') {
    return 'Инструменты';
  }

  return 'Вакансия';
}

function statusLabel(status: string): string {
  if (status === 'awaiting_payment') {
    return '\u041e\u0436\u0438\u0434\u0430\u0435\u0442 \u043e\u043f\u043b\u0430\u0442\u044b';
  }

  if (status === 'cancelled') {
    return '\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u0430';
  }

  const labels: Record<string, string> = {
    draft: 'Черновик',
    payment_pending: 'Ожидает оплаты',
    pending_moderation: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    published: 'Опубликовано',
    hidden: 'Скрыто',
    archived: 'Архивировано',
    deleted: 'Удалено'
  };

  return labels[status] ?? 'На модерации';
}

function paymentLabel(payment: ModerationAdDetail['payment']): string {
  if (!payment) {
    return 'Нет платежа';
  }

  if (payment.status === 'succeeded') {
    return 'Оплачено';
  }

  if (payment.status === 'refunded') {
    return 'Возврат';
  }

  if (payment.status === 'canceled') {
    return 'Отменён';
  }

  return 'Не оплачено';
}

function paymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Ожидает оплаты',
    waiting_for_capture: 'Ожидает подтверждения',
    succeeded: 'Оплачено',
    canceled: 'Отменён',
    refunded: 'Возврат'
  };

  return labels[status] ?? status;
}

function reportReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    FRAUD: 'Мошенничество',
    FALSE_INFORMATION: 'Недостоверная информация',
    NOT_ACTUAL: 'Неактуально',
    WRONG_PRICE: 'Неверная цена',
    SPAM: 'Спам',
    PROHIBITED_CONTENT: 'Запрещенный контент',
    OTHER: 'Другое'
  };

  return labels[reason] ?? reason;
}

function reportStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    OPEN: 'Открыта',
    IN_REVIEW: 'В работе',
    RESOLVED_ACTION_TAKEN: 'Меры приняты',
    RESOLVED_NO_VIOLATION: 'Нарушения нет',
    CANCELLED: 'Отменена'
  };

  return labels[status] ?? status;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
