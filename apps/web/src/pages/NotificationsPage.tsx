import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Circle, RefreshCw, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  NotificationPreferences,
  UserNotification
} from '../features/notifications/notification.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';

type LoadStatus = 'loading' | 'ready' | 'error';

const preferenceLabels: Array<{ key: keyof NotificationPreferences; label: string; critical?: boolean }> = [
  { key: 'adStatusEnabled', label: 'Статусы объявлений' },
  { key: 'applicationsEnabled', label: 'Отклики' },
  { key: 'savedSearchesEnabled', label: 'Сохранённые поиски' },
  { key: 'paymentsEnabled', label: 'Платежи', critical: true },
  { key: 'marketingEnabled', label: 'Маркетинг' }
];

export function NotificationsPage() {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const unreadItems = useMemo(() => items.filter((item) => !item.readAt), [items]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    Promise.all([
      apiClient.listNotifications({ unread: showUnreadOnly, limit: 40 }),
      apiClient.getNotificationPreferences()
    ])
      .then(([notificationsResponse, preferencesResponse]) => {
        if (!active) {
          return;
        }

        setItems(notificationsResponse.data);
        setUnreadTotal(Number(notificationsResponse.meta?.unreadTotal ?? 0));
        setPreferences(preferencesResponse.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey, showUnreadOnly]);

  const markRead = async (notification: UserNotification) => {
    if (notification.readAt) {
      return;
    }

    const response = await apiClient.markNotificationRead(notification.id);
    setItems((current) => current.map((item) => (item.id === notification.id ? response.data : item)));
    setUnreadTotal((value) => Math.max(0, value - 1));
  };

  const markAllRead = async () => {
    await apiClient.markAllNotificationsRead();
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    setUnreadTotal(0);
  };

  const togglePreference = async (key: keyof NotificationPreferences) => {
    if (!preferences) {
      return;
    }

    const nextValue = !preferences[key];
    const response = await apiClient.updateNotificationPreferences({
      [key]: nextValue
    });
    setPreferences(response.data);
  };

  if (status === 'loading') {
    return (
      <AppPage>
        <LoadingState />
      </AppPage>
    );
  }

  if (status === 'error') {
    return (
      <AppPage>
        <EmptyState
          title="Уведомления недоступны"
          description={error ?? 'Попробуйте обновить страницу.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-accent-green">Центр уведомлений</p>
            <h1 className="mt-1 text-2xl font-black text-text-primary">Уведомления</h1>
          </div>
          <div className="flex h-12 min-w-12 items-center justify-center rounded-panel border border-accent-green/30 bg-accent-greenSoft px-3 text-sm font-black text-accent-green">
            {unreadTotal}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            variant={showUnreadOnly ? 'primary' : 'secondary'}
            icon={<Bell size={18} />}
            onClick={() => setShowUnreadOnly((value) => !value)}
          >
            Непрочитанные
          </ActionButton>
          <ActionButton
            variant="secondary"
            icon={<CheckCheck size={18} />}
            onClick={markAllRead}
            disabled={unreadItems.length === 0}
          >
            Прочитать всё
          </ActionButton>
        </div>
      </section>

      <section className="grid gap-2">
        {items.length ? (
          items.map((notification) => (
            <article
              key={notification.id}
              className="grid gap-3 rounded-panel border border-white/10 bg-surface-900/92 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 text-accent-green">
                  <Circle size={notification.readAt ? 10 : 14} fill={notification.readAt ? 'none' : 'currentColor'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="min-w-0 text-sm font-black text-text-primary">{notification.title}</h2>
                    <time className="shrink-0 text-[11px] font-bold text-text-muted">{formatDate(notification.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">{notification.body}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {notification.payload?.deepLink ? (
                  <Link
                    to={notification.payload.deepLink.path}
                    className="rounded-panel border border-accent-green/30 bg-accent-greenSoft px-3 py-2 text-xs font-black text-accent-green"
                    onClick={() => void markRead(notification)}
                  >
                    {notification.payload.deepLink.label}
                  </Link>
                ) : null}
                {!notification.readAt ? (
                  <button
                    type="button"
                    className="rounded-panel border border-white/10 px-3 py-2 text-xs font-black text-text-secondary"
                    onClick={() => void markRead(notification)}
                  >
                    Прочитано
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="Пока пусто" description="Здесь появятся статусы объявлений, оплаты и важные события." />
        )}
      </section>

      {preferences ? (
        <SectionCard title="Настройки" description="Критические события по оплате и безопасности всё равно сохраняются в истории.">
          <div className="grid gap-2">
            {preferenceLabels.map((preference) => (
              <label
                key={preference.key}
                className="flex items-center justify-between gap-3 rounded-panel border border-white/10 bg-surface-950/70 px-3 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-text-secondary">
                  <Settings size={16} />
                  {preference.label}
                </span>
                <input
                  type="checkbox"
                  checked={preferences[preference.key]}
                  onChange={() => void togglePreference(preference.key)}
                  className="h-5 w-5 accent-accent-green"
                />
              </label>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </AppPage>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
