import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  CheckCircle2,
  Eye,
  Phone,
  RefreshCw,
  Radio,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { ChannelRemovalResult, ModerationQueueStatus, PublicAdDetail } from '../features/ads/ad.types.js';
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
  { value: 'published', label: 'Опубликованные' },
  { value: 'approved', label: 'Одобренные' },
  { value: 'hidden', label: 'Скрытые' },
  { value: 'archived', label: 'Архив' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: 'deleted', label: 'Удалённые' },
  { value: 'test', label: 'Тестовые' }
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
  const [queueStatus, setQueueStatus] = useState<ModerationQueueStatus>('pending_moderation');
  const [ads, setAds] = useState<PublicAdDetail[]>([]);
  const [selected, setSelected] = useState<PublicAdDetail | null>(null);
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
        setSelected((current) => response.data.find((ad) => ad.id === current?.id) ?? response.data[0] ?? null);
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
  }, [queueStatus, role, reloadKey]);

  const stats = useMemo(() => {
    const published = ads.filter((ad) => ad.status === 'published' || ad.status === 'approved').length;
    const pending = ads.filter((ad) => ad.status === 'pending_moderation').length;
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

      return 'Объявление одобрено.';
    });

  const reject = (adId: string) => {
    if (reason.trim().length < 3) {
      setActionMessage('Укажите причину отклонения.');
      return;
    }

    void runAction(`reject-${adId}`, async () => {
      await apiClient.rejectModerationAd(adId, reason.trim());
      return 'Объявление отклонено.';
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
    if (!window.confirm('Снять пост объявления из канала? Само объявление в приложении останется в текущем статусе.')) {
      return;
    }

    void runAction(`remove-channel-${adId}`, async () => {
      const response = await apiClient.removeModerationAdFromChannel(adId);
      return `Проверили публикации в канале.${formatChannelRemoval(response.data.channelRemoval)}`;
    });
  };

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

      <TabRow
        items={queueTabs}
        value={queueStatus}
        onChange={(value) => {
          setQueueStatus(value);
          setSelected(null);
          setActionMessage(null);
        }}
      />

      {actionMessage ? (
        <p className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {actionMessage}
        </p>
      ) : null}

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Очередь не загрузилась"
          description={error ?? 'Попробуйте ещё раз.'}
          action={<ActionButton icon={<RefreshCw size={18} />} onClick={reload}>Повторить</ActionButton>}
        />
      ) : null}

      {status === 'ready' && ads.length === 0 ? (
        <EmptyState title="Список пуст" description={emptyDescription(queueStatus)} />
      ) : null}

      {status === 'ready' && ads.length > 0 ? (
        <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
          <section className="grid min-w-0 max-w-full gap-2">
            {ads.map((ad) => (
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
                    <p className="truncate text-base font-bold text-text-primary">{ad.title}</p>
                    <p className="text-sm text-text-secondary">{typeLabel(ad.type)}</p>
                  </div>
                  <span className="max-w-full">
                    <StatChip label={statusLabel(ad.status)} tone={isPublicStatus(ad.status) ? 'green' : 'neutral'} />
                  </span>
                </div>
              </button>
            ))}
          </section>

          {selected ? (
            <SectionCard title={selected.title} description={selected.subtitle ?? typeLabel(selected.type)}>
              <div className="grid gap-3">
                {selected.coverPhoto ? (
                  <MediaPreview
                    src={selected.coverPhoto.previewUrl ?? selected.coverPhoto.url}
                    mimeType={selected.coverPhoto.mimeType}
                    alt={selected.title}
                    className="aspect-[16/9] w-full rounded-panel object-cover"
                  />
                ) : null}
                <div className="flex max-w-full min-w-0 flex-wrap gap-2 overflow-hidden">
                  <span className="max-w-full">
                    <StatChip label={typeLabel(selected.type)} tone="green" icon={<ShieldCheck size={15} />} />
                  </span>
                  <span className="max-w-full">
                    <StatChip label={statusLabel(selected.status)} tone={isPublicStatus(selected.status) ? 'green' : 'neutral'} />
                  </span>
                  {selected.category ? (
                    <span className="max-w-full">
                      <StatChip label={selected.category} />
                    </span>
                  ) : null}
                  {selected.locationShort ? (
                    <span className="max-w-full">
                      <StatChip label={selected.locationShort} tone="green" />
                    </span>
                  ) : null}
                </div>
                <ModerationAccountBlock owner={selected.owner} />
                <ModerationContactBlock contacts={selected.contacts} />
                {selected.description ? (
                  <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{selected.description}</p>
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
                    disabled={isBusy(busyAction) || selected.status === 'published'}
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
  const labels: Record<string, string> = {
    draft: 'Черновик',
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
