import { useEffect, useState, type FormEvent } from 'react';
import { Ban, CheckCircle2, Copy, Crown, RefreshCw, Save, Search, ShieldCheck, Sparkles, UserCog, Users } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { TeamUser } from '../features/ads/ad.types.js';
import type { PromotionProduct } from '../features/promotions/promotion.types.js';
import { apiClient } from '../shared/api/client.js';
import type { AdminAdAnalyticsDashboard } from '../shared/api/client.js';
import { ApiError } from '../shared/api/http.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { Select } from '../shared/ui/Select.js';
import { StatChip } from '../shared/ui/StatChip.js';

type TeamRole = TeamUser['role'];
type TeamStatus = TeamUser['status'];

const roleOptions: Array<{ role: TeamRole; label: string }> = [
  { role: 'user', label: 'Пользователь' },
  { role: 'moderator', label: 'Модератор' },
  { role: 'admin', label: 'Админ' }
];

export function TeamPage() {
  const currentUser = useAppStore((state) => state.user);
  const analyticsEnabled = useAppStore((state) => state.features.AD_ANALYTICS_ENABLED);
  const promotionsEnabled = useAppStore((state) => state.features.PROMOTIONS_ENABLED);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setStatus('ready');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listTeamUsers({ q: submittedQuery || undefined })
      .then((response) => {
        if (!active) {
          return;
        }

        setUsers(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getTeamError(requestError));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [isAdmin, reloadKey, submittedQuery]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setSubmittedQuery(query.trim());
  };

  const updateRole = async (user: TeamUser, role: TeamRole) => {
    if (user.role === role || updatingUserId) {
      return;
    }

    setUpdatingUserId(user.id);
    setMessage(null);
    setError(null);

    try {
      const response = await apiClient.updateTeamUserRole(user.id, role);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role: response.data.role } : item))
      );
      setMessage(`${getUserName(user)} теперь: ${getRoleLabel(response.data.role)}. Попросите человека закрыть и открыть mini app, чтобы обновился доступ.`);
    } catch (requestError) {
      setError(getTeamError(requestError));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const updateAccountStatus = async (user: TeamUser, status: Extract<TeamStatus, 'active' | 'blocked'>) => {
    if (user.status === status || updatingUserId) {
      return;
    }

    if (status === 'blocked' && !window.confirm(`Заблокировать ${getUserName(user)}? Пользователь потеряет доступ к приложению.`)) {
      return;
    }

    setUpdatingUserId(user.id);
    setMessage(null);
    setError(null);

    try {
      const response = await apiClient.updateTeamUserStatus(user.id, status);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, status: response.data.status } : item))
      );
      setMessage(`${getUserName(user)} теперь: ${getStatusLabel(response.data.status)}.${formatBlockCleanup(response.data)}`);
    } catch (requestError) {
      setError(getTeamError(requestError));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const copyMaxId = async (maxUserId: string) => {
    try {
      await navigator.clipboard.writeText(maxUserId);
      setMessage(`MAX ID скопирован: ${maxUserId}`);
    } catch {
      setMessage(`MAX ID: ${maxUserId}`);
    }
  };

  if (!isAdmin) {
    return (
      <AppPage>
        <EmptyState
          title="Команда доступна только админам"
          description="Модераторы могут проверять объявления, но назначать роли может только главный админ."
        />
      </AppPage>
    );
  }

  return (
    <AppPage>
      <section className="app-surface app-topline rounded-panel p-4 app-fade-up">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green">
            <Users size={23} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent-green">Админ-панель</p>
            <h1 className="text-2xl font-black leading-tight text-text-primary">Команда</h1>
            <p className="text-sm leading-5 text-text-secondary">
              Назначайте модераторов и админов только тем людям, которые уже открывали mini app или писали боту.
            </p>
          </div>
        </div>
      </section>

      <SectionCard title="Найти человека" description="Можно искать по MAX ID, @username, имени или фамилии. По телефону лучше не назначать права: это контакт объявления, а не аккаунта.">
        <form className="grid gap-3" onSubmit={handleSearch}>
          <Input
            label="Поиск"
            placeholder="MAX ID, username, имя"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ActionButton icon={<Search size={18} />} type="submit">
              Найти
            </ActionButton>
            <ActionButton
              icon={<RefreshCw size={18} />}
              type="button"
              variant="secondary"
              onClick={() => {
                setQuery('');
                setSubmittedQuery('');
                setReloadKey((value) => value + 1);
              }}
            >
              Сброс
            </ActionButton>
          </div>
        </form>
      </SectionCard>

      {analyticsEnabled ? <AdminAnalyticsPanel /> : null}

      {promotionsEnabled ? <PromotionAdminPanel /> : null}

      {message ? (
        <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm font-semibold leading-6 text-accent-green">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-6 text-red-100">
          {error}
        </p>
      ) : null}

      {status === 'loading' ? <LoadingState /> : null}

      {status === 'error' ? (
        <EmptyState
          title="Не удалось загрузить команду"
          description={error ?? 'Попробуйте обновить список ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      ) : null}

      {status === 'ready' && users.length === 0 ? (
        <EmptyState
          title="Пользователь не найден"
          description="Попросите человека открыть mini app или отправить боту команду /id, а потом повторите поиск по MAX ID."
        />
      ) : null}

      {status === 'ready' && users.length > 0 ? (
        <section className="grid gap-3">
          {users.map((user) => (
            <TeamUserCard
              key={user.id}
              user={user}
              currentUserId={currentUser.id}
              updating={updatingUserId === user.id}
              onCopyMaxId={copyMaxId}
              onUpdateRole={updateRole}
              onUpdateStatus={updateAccountStatus}
            />
          ))}
        </section>
      ) : null}
    </AppPage>
  );
}

function TeamUserCard({
  user,
  currentUserId,
  updating,
  onCopyMaxId,
  onUpdateRole,
  onUpdateStatus
}: {
  user: TeamUser;
  currentUserId: string | null;
  updating: boolean;
  onCopyMaxId: (maxUserId: string) => void;
  onUpdateRole: (user: TeamUser, role: TeamRole) => void;
  onUpdateStatus: (user: TeamUser, status: Extract<TeamStatus, 'active' | 'blocked'>) => void;
}) {
  const isSelf = user.id === currentUserId;
  const name = getUserName(user);
  const canBlock = !isSelf && user.status !== 'deleted';

  return (
    <article className="app-surface rounded-panel border border-white/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-black text-text-primary">{name}</h2>
            <RoleChip role={user.role} />
            {isSelf ? <StatChip label="Это вы" tone="green" /> : null}
          </div>
          <p className="text-sm text-text-secondary">
            {user.maxUsername ? `@${user.maxUsername}` : 'username не указан'}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-accent-green"
            onClick={() => onCopyMaxId(user.maxUserId)}
          >
            <Copy size={15} />
            MAX ID: {user.maxUserId}
          </button>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-green/20 bg-accent-greenSoft text-accent-green">
          {user.role === 'admin' ? <Crown size={23} /> : <UserCog size={23} />}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <InfoCell label="Объявлений" value={String(user.adsTotal)} />
        <InfoCell label="Статус" value={getStatusLabel(user.status)} />
        <InfoCell label="Был" value={user.lastSeenAt ? formatDate(user.lastSeenAt) : 'нет'} />
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-text-muted">Права</p>
        <div className="grid grid-cols-3 gap-2">
          {roleOptions.map((option) => {
            const disabled =
              updating ||
              user.role === option.role ||
              (isSelf && option.role !== 'admin');

            return (
              <ActionButton
                key={option.role}
                className="min-h-10 px-2 text-xs"
                disabled={disabled}
                type="button"
                variant={user.role === option.role ? 'primary' : 'secondary'}
                onClick={() => onUpdateRole(user, option.role)}
              >
                {option.label}
              </ActionButton>
            );
          })}
        </div>
        {isSelf ? <p className="text-xs leading-5 text-text-muted">Себе нельзя снять роль админа.</p> : null}
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-text-muted">Доступ</p>
        {user.status === 'blocked' ? (
          <ActionButton
            type="button"
            variant="secondary"
            icon={<CheckCircle2 size={17} />}
            disabled={updating || isSelf}
            onClick={() => onUpdateStatus(user, 'active')}
          >
            Разблокировать
          </ActionButton>
        ) : (
          <ActionButton
            type="button"
            variant="danger"
            icon={<Ban size={17} />}
            disabled={updating || !canBlock}
            onClick={() => onUpdateStatus(user, 'blocked')}
          >
            Заблокировать
          </ActionButton>
        )}
        {isSelf ? <p className="text-xs leading-5 text-text-muted">Свой аккаунт заблокировать нельзя.</p> : null}
      </div>
    </article>
  );
}

function AdminAnalyticsPanel() {
  const [dashboard, setDashboard] = useState<AdminAdAnalyticsDashboard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getAdminAdAnalytics(30)
      .then((response) => {
        if (!active) {
          return;
        }

        setDashboard(response.data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getTeamError(requestError));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <SectionCard title="Аналитика объявлений" description="Агрегаты за 30 дней без раскрытия посетителей владельцам объявлений.">
      <div className="grid gap-3">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? (
          <EmptyState
            title="Не удалось загрузить аналитику"
            description={error ?? 'Попробуйте обновить сводку.'}
            action={
              <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
                Обновить
              </ActionButton>
            }
          />
        ) : null}
        {status === 'ready' && dashboard ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatChip label="активные пользователи" value={String(dashboard.activeUsers)} tone="green" />
              <StatChip label="публичные объявления" value={String(dashboard.publishedAds)} />
              <StatChip label="просмотры" value={String(dashboard.totals.views)} />
              <StatChip label="контакты" value={String(getContactActions(dashboard))} />
              <StatChip label="отклики" value={String(dashboard.totals.applications)} />
              <StatChip label="конверсия в контакт" value={`${dashboard.conversion.viewToContact}%`} tone="green" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <AdminAnalyticsList
                title="Категории"
                empty="Категорий пока нет"
                items={dashboard.popularCategories.map((item) => ({
                  key: `${item.type}-${item.category}`,
                  label: `${item.category} · ${item.type}`,
                  value: item.ads
                }))}
              />
              <AdminAnalyticsList
                title="Профессии"
                empty="Профессий пока нет"
                items={dashboard.popularProfessions.map((item) => ({
                  key: `${item.type}-${item.profession}`,
                  label: `${item.profession} · ${item.type}`,
                  value: item.ads
                }))}
              />
              <AdminAnalyticsList
                title="Top ads"
                empty="Метрик пока нет"
                items={dashboard.topAds.map((item) => ({
                  key: item.id,
                  label: item.title,
                  value: item.totals.views
                }))}
              />
            </div>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

function AdminAnalyticsList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; value: number }>;
}) {
  return (
    <div className="rounded-panel border border-white/10 bg-surface-950/50 p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-text-muted">{title}</p>
      {items.length === 0 ? <p className="mt-2 text-sm text-text-secondary">{empty}</p> : null}
      <div className="mt-2 grid gap-2">
        {items.slice(0, 5).map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 rounded-panel border border-white/8 bg-surface-900/80 px-3 py-2">
            <span className="min-w-0 truncate text-sm font-bold text-text-primary">{item.label}</span>
            <span className="shrink-0 text-sm font-extrabold text-accent-green">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getContactActions(dashboard: AdminAdAnalyticsDashboard): number {
  return (
    dashboard.totals.contactOpens +
    dashboard.totals.phoneClicks +
    dashboard.totals.emailClicks +
    dashboard.totals.maxClicks +
    dashboard.totals.websiteClicks
  );
}

function PromotionAdminPanel() {
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listPromotionAdminProducts()
      .then((response) => {
        if (!active) {
          return;
        }

        setProducts(response.data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getTeamError(requestError));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const updateProduct = (type: PromotionProduct['type'], patch: Partial<PromotionProduct>) => {
    setProducts((current) => current.map((product) => (product.type === type ? { ...product, ...patch } : product)));
  };

  const saveProduct = async (product: PromotionProduct) => {
    setSavingType(product.type);
    setError(null);

    try {
      const response = await apiClient.updatePromotionAdminProduct(product.type, {
        enabled: product.enabled,
        price: product.price,
        durationHours: product.durationHours,
        applicableAdTypes: product.applicableAdTypes,
        configuration: product.configuration,
        channelBehavior: product.channelBehavior
      });
      updateProduct(product.type, response.data);
    } catch (requestError) {
      setError(getTeamError(requestError));
    } finally {
      setSavingType(null);
    }
  };

  return (
    <SectionCard title="Продвижение объявлений" description="Продукты выключены, пока не задана цена и срок. AUTO_BUMP по умолчанию работает только внутри Mini App.">
      <div className="grid gap-3">
        {error ? <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? (
          <EmptyState title="Не удалось загрузить продукты продвижения" description={error ?? 'Попробуйте обновить страницу.'} />
        ) : null}
        {status === 'ready' ? (
          products.map((product) => (
            <div key={product.type} className="rounded-panel border border-white/10 bg-surface-950/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-accent-green" />
                  <strong className="text-text-primary">{promotionProductAdminLabel(product.type)}</strong>
                </div>
                <button
                  type="button"
                  className={`h-8 w-14 rounded-full border transition ${product.enabled ? 'border-accent-green bg-accent-greenSoft' : 'border-white/10 bg-white/[0.04]'}`}
                  onClick={() => updateProduct(product.type, { enabled: !product.enabled })}
                  aria-label="Включить продукт"
                >
                  <span className={`block h-6 w-6 rounded-full transition ${product.enabled ? 'ml-7 bg-accent-green' : 'ml-1 bg-text-muted'}`} />
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Цена, ₽"
                  value={product.price ?? ''}
                  placeholder="Например: 150.00"
                  onChange={(event) => updateProduct(product.type, { price: event.target.value })}
                />
                <Input
                  label="Срок, часов"
                  value={product.durationHours?.toString() ?? ''}
                  placeholder={product.type === 'BUMP_ONCE' ? 'не требуется' : 'Например: 168'}
                  onChange={(event) => updateProduct(product.type, { durationHours: event.target.value ? Number(event.target.value) : null })}
                />
                <Select
                  label="Каналы для auto-bump"
                  value={product.channelBehavior.autoBumpChannels ?? 'NONE'}
                  options={[
                    { value: 'NONE', label: 'Только Mini App' },
                    { value: 'MAX_ONLY', label: 'MAX' },
                    { value: 'TELEGRAM_ONLY', label: 'Telegram' },
                    { value: 'ALL', label: 'MAX и Telegram' }
                  ]}
                  onChange={(event) =>
                    updateProduct(product.type, {
                      channelBehavior: {
                        ...product.channelBehavior,
                        autoBumpChannels: event.target.value as PromotionProduct['channelBehavior']['autoBumpChannels']
                      }
                    })
                  }
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(['vacancy', 'resume', 'equipment', 'material', 'tool'] as const).map((type) => {
                  const checked = product.applicableAdTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`rounded-panel border px-3 py-2 text-xs font-extrabold ${checked ? 'border-accent-green bg-accent-greenSoft text-accent-green' : 'border-white/10 bg-surface-900 text-text-secondary'}`}
                      onClick={() =>
                        updateProduct(product.type, {
                          applicableAdTypes: checked
                            ? product.applicableAdTypes.filter((item) => item !== type)
                            : [...product.applicableAdTypes, type]
                        })
                      }
                    >
                      {type}
                    </button>
                  );
                })}
              </div>

              <ActionButton
                className="mt-3"
                icon={<Save size={17} />}
                disabled={savingType === product.type}
                onClick={() => void saveProduct(product)}
              >
                {savingType === product.type ? 'Сохраняем...' : 'Сохранить продукт'}
              </ActionButton>
            </div>
          ))
        ) : null}
      </div>
    </SectionCard>
  );
}

function RoleChip({ role }: { role: TeamRole }) {
  if (role === 'admin') {
    return <StatChip label="Админ" tone="green" icon={<Crown size={14} />} />;
  }

  if (role === 'moderator') {
    return <StatChip label="Модератор" tone="green" icon={<ShieldCheck size={14} />} />;
  }

  return <StatChip label="Пользователь" tone="neutral" />;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-white/8 bg-black/[0.16] p-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function getUserName(user: TeamUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  if (user.displayName) {
    return user.displayName;
  }

  if (fullName) {
    return fullName;
  }

  if (user.maxUsername) {
    return user.maxUsername;
  }

  return `MAX ${user.maxUserId}`;
}

function getRoleLabel(role: TeamRole): string {
  if (role === 'admin') {
    return 'Админ';
  }

  if (role === 'moderator') {
    return 'Модератор';
  }

  return 'Пользователь';
}

function promotionProductAdminLabel(type: PromotionProduct['type']): string {
  const labels: Record<PromotionProduct['type'], string> = {
    BUMP_ONCE: 'Поднять один раз',
    URGENT_BADGE: 'Срочно',
    PIN_CATEGORY: 'Закрепить в категории',
    HIGHLIGHT_CARD: 'Выделить карточку',
    RECOMMENDED: 'Рекомендуемое',
    AUTO_BUMP: 'Автоподнятие'
  };

  return labels[type];
}

function getStatusLabel(status: TeamUser['status']): string {
  if (status === 'active') {
    return 'активен';
  }

  if (status === 'blocked') {
    return 'заблокирован';
  }

  return 'удалён';
}

function formatBlockCleanup(data: {
  hiddenAdsTotal?: number;
  channelRemoval?: {
    attempted: number;
    removed: number;
    failed: number;
    skipped: number;
  } | null;
}): string {
  if (!data.hiddenAdsTotal && !data.channelRemoval) {
    return '';
  }

  const parts: string[] = [];

  if (data.hiddenAdsTotal) {
    parts.push(`скрыто объявлений: ${data.hiddenAdsTotal}`);
  }

  if (data.channelRemoval?.attempted) {
    parts.push(`удалено из канала: ${data.channelRemoval.removed}/${data.channelRemoval.attempted}`);
  }

  return parts.length ? ` ${parts.join(', ')}.` : '';
}

function getTeamError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Эта страница доступна только админам.';
    }

    return error.message;
  }

  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(value));
}
