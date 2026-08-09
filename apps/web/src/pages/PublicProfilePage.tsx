import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Building2, Mail, MapPin, Phone, RefreshCw, ShieldCheck, Star, UserRound } from 'lucide-react';
import type { PublicAdCard } from '../features/vacancies/vacancy.types.js';
import type { PublicUserProfile, TrustBadge } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';

export function PublicProfilePage() {
  const { userId } = useParams();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setStatus('error');
      setError('Профиль не найден.');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getPublicProfile(userId)
      .then((response) => {
        if (!active) {
          return;
        }

        setProfile(response.data);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey, userId]);

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
          title="Профиль недоступен"
          description={error ?? 'Пользователь удалён, заблокирован или ещё не открыл публичный профиль.'}
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
      <section className="app-surface app-topline rounded-panel p-4">
        <div className="flex items-start gap-3">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-accent-green object-cover p-1" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-accent-green bg-accent-greenSoft text-accent-green">
              {profile.profileType === 'company' ? <Building2 size={28} /> : <UserRound size={28} />}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent-green">
              {profile.profileType === 'company' ? 'Компания' : 'Профиль'}
            </p>
            <h1 className="truncate text-2xl font-black text-text-primary">{profile.displayName}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
              <MapPin size={15} />
              {[profile.city, profile.districtText].filter(Boolean).join(', ') || `В приложении с ${formatDate(profile.registeredAt)}`}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <StatChip label="объявлений" value={String(profile.stats.publishedAdsTotal)} />
          <StatChip label="отзывов" value={String(profile.stats.reviewsTotal)} />
          {profile.stats.ratingAverage ? <StatChip label="рейтинг" value={String(profile.stats.ratingAverage)} tone="green" icon={<Star size={14} />} /> : null}
          {profile.trustBadges.map((badge) => (
            <StatChip key={badge} label={trustBadgeLabel(badge)} tone="green" icon={<ShieldCheck size={14} />} />
          ))}
        </div>
      </section>

      <SectionCard title="Описание">
        <div className="grid gap-2 text-sm leading-6 text-text-secondary">
          {profile.specialization ? <p><strong className="text-text-primary">Специализация:</strong> {profile.specialization}</p> : null}
          {profile.experience ? <p><strong className="text-text-primary">Опыт:</strong> {profile.experience}</p> : null}
          {profile.about ? <p>{profile.about}</p> : <p>Описание пока не заполнено.</p>}
          {profile.companyInfo ? <p>{profile.companyInfo}</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="Контакты">
        {profile.contacts.length ? (
          <div className="grid gap-2">
            {profile.contacts.map((contact) => (
              <a
                key={`${contact.type}-${contact.value}`}
                href={contactHref(contact)}
                className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 text-sm font-semibold text-text-primary"
              >
                {contact.type === 'email' ? <Mail size={18} /> : <Phone size={18} />}
                <span className="min-w-0 truncate">{contact.value}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Публичные контакты скрыты.</p>
        )}
      </SectionCard>

      <AdsSection title="Активные вакансии" ads={profile.activeVacancies} empty="Активных вакансий пока нет." />
      <AdsSection title="Другие объявления" ads={profile.otherActiveAds} empty="Других активных объявлений пока нет." />

      <SectionCard title="Отзывы">
        {profile.reviews.length ? (
          <div className="grid gap-2">
            {profile.reviews.map((review) => (
              <article key={review.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-text-primary">{review.author.displayName ?? 'Пользователь'}</strong>
                  <span className="text-sm font-black text-accent-green">{review.rating}/5</span>
                </div>
                {review.text ? <p className="mt-2 text-sm leading-6 text-text-secondary">{review.text}</p> : null}
                {review.ad ? <p className="mt-2 text-xs text-text-muted">{review.ad.title}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Отзывов пока нет.</p>
        )}
      </SectionCard>
    </AppPage>
  );
}

function AdsSection({ title, ads, empty }: { title: string; ads: PublicAdCard[]; empty: string }) {
  return (
    <SectionCard title={title}>
      {ads.length ? (
        <div className="grid gap-3">
          {ads.map((ad) => (
            <AdCard
              key={ad.id}
              to={adPath(ad)}
              title={ad.title}
              typeLabel={typeLabel(ad.type)}
              description={ad.description}
              subtitle={ad.subtitle}
              coverImageUrl={ad.coverPhoto?.previewUrl ?? ad.coverPhoto?.url ?? null}
              coverMimeType={ad.coverPhoto?.mimeType ?? null}
              price={ad.shortSalary ?? undefined}
              location={ad.locationShort}
              category={ad.category}
              chips={ad.chips}
              promotion={ad.promotion}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{empty}</p>
      )}
    </SectionCard>
  );
}

function adPath(ad: PublicAdCard): string {
  if (ad.type === 'vacancy') {
    return `/vacancies/${ad.id}`;
  }

  if (ad.type === 'resume') {
    return `/resumes/${ad.id}`;
  }

  return `/${ad.type === 'material' ? 'materials' : `${ad.type}s`}/${ad.id}`;
}

function contactHref(contact: { type: string; value: string }): string {
  if (contact.type === 'phone') {
    return `tel:${contact.value.replace(/[^\d+]/g, '')}`;
  }

  if (contact.type === 'email') {
    return `mailto:${contact.value}`;
  }

  if (contact.type === 'website') {
    return contact.value;
  }

  return contact.value.startsWith('@') ? `https://max.ru/${contact.value.slice(1)}` : contact.value;
}

function trustBadgeLabel(badge: TrustBadge): string {
  if (badge === 'phone_confirmed') {
    return 'Телефон подтверждён';
  }

  if (badge === 'company_verified') {
    return 'Компания проверена';
  }

  if (badge === 'reliable_employer') {
    return 'Надёжный работодатель';
  }

  return 'Давно с нами';
}

function typeLabel(type: PublicAdCard['type']): string {
  if (type === 'vacancy') {
    return 'Вакансия';
  }

  if (type === 'resume') {
    return 'Резюме';
  }

  if (type === 'equipment') {
    return 'Техника';
  }

  if (type === 'material') {
    return 'Материалы';
  }

  return 'Инструменты';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}
