import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Copy, Crown, RefreshCw, Search, ShieldCheck, UserCog, Users } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { TeamUser } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { ApiError } from '../shared/api/http.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';

type TeamRole = TeamUser['role'];

const roleOptions: Array<{ role: TeamRole; label: string }> = [
  { role: 'user', label: 'Пользователь' },
  { role: 'moderator', label: 'Модератор' },
  { role: 'admin', label: 'Админ' }
];

export function TeamPage() {
  const currentUser = useAppStore((state) => state.user);
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

  const adminsCount = useMemo(() => users.filter((user) => user.role === 'admin').length, [users]);

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
              adminsCount={adminsCount}
              updating={updatingUserId === user.id}
              onCopyMaxId={copyMaxId}
              onUpdateRole={updateRole}
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
  adminsCount,
  updating,
  onCopyMaxId,
  onUpdateRole
}: {
  user: TeamUser;
  currentUserId: string | null;
  adminsCount: number;
  updating: boolean;
  onCopyMaxId: (maxUserId: string) => void;
  onUpdateRole: (user: TeamUser, role: TeamRole) => void;
}) {
  const isSelf = user.id === currentUserId;
  const isLastAdmin = user.role === 'admin' && adminsCount <= 1;
  const name = getUserName(user);

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
              (isSelf && option.role !== 'admin') ||
              (isLastAdmin && option.role !== 'admin');

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
        {isLastAdmin ? <p className="text-xs leading-5 text-text-muted">Последнего админа снять нельзя.</p> : null}
      </div>
    </article>
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

function getStatusLabel(status: TeamUser['status']): string {
  if (status === 'active') {
    return 'активен';
  }

  if (status === 'blocked') {
    return 'заблокирован';
  }

  return 'удалён';
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
