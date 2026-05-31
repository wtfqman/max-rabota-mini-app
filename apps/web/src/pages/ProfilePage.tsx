import { useEffect, useState } from 'react';
import { Bell, FileUser, Heart, ListChecks, Megaphone, RefreshCw, Settings2, Users } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { UserProfilePayload } from '../features/ads/ad.types.js';
import type { AuthProfile } from '../features/auth/auth.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { ProfileHeader } from '../shared/ui/ProfileHeader.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { TileCard } from '../shared/ui/TileCard.js';

export function ProfilePage() {
  const currentUser = useAppStore((state) => state.user);
  const sessionProfile = useAppStore((state) => state.profile);
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getMe()
      .then((response) => {
        if (!active) {
          return;
        }

        setProfile(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        const fallbackProfile = buildFallbackProfile(currentUser, sessionProfile);

        if (fallbackProfile) {
          setProfile(fallbackProfile);
          setError(getUserFacingError(requestError, 'profile_load'));
          setStatus('ready');
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [currentUser, reloadKey, sessionProfile]);

  if (status === 'loading') {
    return (
      <AppPage>
        <LoadingState />
      </AppPage>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <AppPage>
        <EmptyState
          title="Профиль пока недоступен"
          description={error ?? 'Попробуйте открыть приложение ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      </AppPage>
    );
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const primaryName = profile.displayName ?? fullName;
  const name = primaryName || profile.maxUsername || 'Профиль';

  return (
    <AppPage>
      <ProfileHeader
        name={name}
        subtitle={profile.profile?.city ? `${profile.profile.city} в MAX` : 'Ваш кабинет в MAX'}
        avatarUrl={profile.profile?.avatarUrl ?? undefined}
        stats={[
          { label: 'объявления', value: String(profile.stats.adsTotal) },
          { label: 'избранное', value: String(profile.stats.favoritesTotal) }
        ]}
      />

      {error ? (
        <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm text-accent-green">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3">
        {profile.role === 'admin' || profile.role === 'moderator' ? (
          <TileCard
            to="/moderation"
            title="Подтверждение модерации"
            description="Проверить и опубликовать новые объявления"
            icon={<ListChecks size={23} />}
            tone="green"
          />
        ) : null}
        {profile.role === 'admin' ? (
          <TileCard
            to="/team"
            title="Команда"
            description="Назначать админов и модераторов по MAX ID или username"
            icon={<Users size={23} />}
            tone="green"
          />
        ) : null}
        <TileCard
          to="/my-ads"
          title="Мои объявления"
          description="Редактировать, скрывать, повторно публиковать"
          icon={<ListChecks size={23} />}
          tone="green"
        />
        <TileCard
          to="/create/resume"
          title="Создать резюме"
          description="ФИО, специальность, опыт, контакт и зарплата"
          icon={<FileUser size={23} />}
          tone="green"
        />
        <TileCard
          to="/favorites"
          title="Избранное"
          description="Сохранённые вакансии, техника и материалы"
          icon={<Heart size={23} />}
          tone="green"
        />
        <TileCard
          to="/my-ads"
          title="Пульт публикации"
          description="Автопубликация, срок размещения и напоминания"
          icon={<Settings2 size={23} />}
          tone="green"
        />
      </section>

      <SectionCard
        title="Пульт управления публикацией"
        description="В карточках ваших объявлений можно включить автопубликацию, выбрать повтор, срок размещения и напоминание перед отключением."
      >
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/92 p-3">
            <div className="flex items-center gap-2 text-base font-extrabold text-text-primary">
              <Megaphone size={18} className="text-accent-green" />
              Управление без лишних слов
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              В кабинете показываются только понятные статусы: активно, на модерации, скрыто или завершено.
            </p>
          </div>
          <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/92 p-3">
            <div className="flex items-center gap-2 text-base font-extrabold text-text-primary">
              <Bell size={18} className="text-accent-green" />
              Напоминания
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              Если включить напоминание, объявление заранее подскажет, что срок размещения подходит к концу.
            </p>
          </div>
          <LinkButton to="/my-ads" variant="primary" icon={<Settings2 size={18} />}>
            Открыть пульт
          </LinkButton>
        </div>
      </SectionCard>

      <SectionCard title="О профиле" description="Информация, которая помогает объявлениям выглядеть доверительно.">
        <div className="grid gap-2 text-sm leading-6 text-text-secondary">
          <p>В приложении с {formatDate(profile.createdAt)}</p>
          {profile.profile?.districtText ? <p>Район: {profile.profile.districtText}</p> : null}
          {profile.profile?.about ? <p>{profile.profile.about}</p> : null}
        </div>
      </SectionCard>

      {profile.role === 'admin' || profile.role === 'moderator' ? (
        <SectionCard title="Для модерации" description="Этот блок виден только пользователям с расширенными правами.">
          <LinkButton to="/moderation" variant="secondary" icon={<ListChecks size={18} />}>
            Очередь модерации
          </LinkButton>
        </SectionCard>
      ) : null}
    </AppPage>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

function buildFallbackProfile(
  user: ReturnType<typeof useAppStore.getState>['user'],
  profile: AuthProfile | null
): UserProfilePayload | null {
  if (!user.id) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return {
    id: user.id,
    maxUserId: '',
    maxUsername: null,
    firstName: null,
    lastName: null,
    displayName: user.displayName,
    role: user.role,
    status: user.status ?? 'active',
    createdAt: nowIso,
    profile: profile
      ? {
          id: profile.id,
          city: profile.city,
          districtText: profile.districtText,
          about: profile.about,
          avatarUrl: profile.avatarUrl,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        }
      : null,
    stats: {
      adsTotal: 0,
      favoritesTotal: 0,
      reviewsTotal: 0,
      adsByStatus: {},
      adsByType: {}
    }
  };
}
