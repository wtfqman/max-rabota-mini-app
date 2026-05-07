import { useEffect, useState } from 'react';
import { FileUser, Heart, ListChecks, RefreshCw } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { ProfileHeader } from '../shared/ui/ProfileHeader.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { TileCard } from '../shared/ui/TileCard.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import type { UserProfilePayload } from '../features/ads/ad.types.js';
import type { AuthProfile } from '../features/auth/auth.types.js';

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
  const name = primaryName || profile.maxUsername || 'Профиль Rabst24';

  return (
    <AppPage>
      <ProfileHeader
        name={name}
        subtitle={profile.profile?.city ? `${profile.profile.city} в MAX` : 'Ваш рабочий профиль в MAX'}
        avatarUrl={profile.profile?.avatarUrl ?? undefined}
        stats={[
          { label: 'объявления', value: String(profile.stats.adsTotal) },
          { label: 'избранное', value: String(profile.stats.favoritesTotal) },
          { label: 'отзывы', value: String(profile.stats.reviewsTotal) }
        ]}
      />

      <SectionCard title="О профиле" description="Короткая информация, которую можно использовать в объявлениях.">
        <div className="grid gap-2 text-sm leading-6 text-text-secondary">
          <p>В Rabst24 с {formatDate(profile.createdAt)}</p>
          {profile.profile?.districtText ? <p>Район: {profile.profile.districtText}</p> : null}
          {profile.profile?.about ? <p>{profile.profile.about}</p> : null}
        </div>
      </SectionCard>

      <section className="grid grid-cols-2 gap-3">
        <TileCard to="/my-ads" title="Мои объявления" description="Ваши публикации" icon={<ListChecks size={22} />} />
        <TileCard to="/create/resume" title="Резюме" description="Создать или обновить" icon={<FileUser size={22} />} tone="cyan" />
        <TileCard to="/favorites" title="Избранное" description="Сохранённые объявления" icon={<Heart size={22} />} tone="green" />
      </section>

      <SectionCard title="Кабинет" description="Самое нужное для работы с объявлениями.">
        <div className="grid gap-2">
          <LinkButton to="/my-ads" variant="secondary" icon={<ListChecks size={18} />}>
            Мои объявления
          </LinkButton>
          <LinkButton to="/create/resume" variant="secondary" icon={<FileUser size={18} />}>
            Создать резюме
          </LinkButton>
          <LinkButton to="/favorites" variant="secondary" icon={<Heart size={18} />}>
            Избранное
          </LinkButton>
          {profile.role === 'admin' || profile.role === 'moderator' ? (
            <LinkButton to="/moderation" variant="secondary" icon={<ListChecks size={18} />}>
              Очередь модерации
            </LinkButton>
          ) : null}
        </div>
      </SectionCard>
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
