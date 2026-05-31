import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Heart,
  Phone,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { PublicAdContact, PublicVacancyDetail } from '../features/vacancies/vacancy.types.js';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { MediaPreview } from '../shared/ui/MediaPreview.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { ReviewsBlock } from '../features/reviews/ReviewsBlock.js';

export function VacancyDetailsPage() {
  const { adId } = useParams();
  const [vacancy, setVacancy] = useState<PublicVacancyDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const accessToken = useAppStore((state) => state.accessToken);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState('Поделиться');

  useEffect(() => {
    if (!accessToken) {
      setIsFavorite(false);
      return;
    }

    apiClient
      .listFavorites()
      .then((response) => {
        setIsFavorite(Boolean(adId && response.data.some((item) => item.ad.id === adId)));
      })
      .catch(() => {
        setIsFavorite(false);
      });
  }, [accessToken, adId]);

  useEffect(() => {
    if (!adId) {
      setStatus('error');
      setError('Вакансия не найдена.');
      return;
    }

    let isActive = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getVacancyDetails(adId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        setVacancy(response.data);
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        setError(getUserFacingError(requestError, 'vacancy_load'));
        setStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [adId, reloadKey]);

  const heroPhoto = vacancy?.coverPhoto ?? vacancy?.photos[0] ?? null;
  const facts = useMemo(() => (vacancy ? buildFacts(vacancy) : []), [vacancy]);

  const handleShare = async () => {
    if (!vacancy) {
      return;
    }

    const url = window.location.href;
    const shareData = {
      title: vacancy.title,
      text: vacancy.subtitle ?? 'Вакансия в MAX',
      url
    };
    const maybeNavigator = navigator as Navigator & {
      share?: (data: typeof shareData) => Promise<void>;
    };

    try {
      if (maybeNavigator.share) {
        await maybeNavigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setShareLabel('Ссылка скопирована');
        window.setTimeout(() => setShareLabel('Поделиться'), 1800);
      }
    } catch {
      setShareLabel('Не получилось');
      window.setTimeout(() => setShareLabel('Поделиться'), 1800);
    }
  };

  const toggleFavorite = async () => {
    if (!accessToken) {
      setFavoriteNotice('Лайки и отзывы доступны после входа через MAX mini app.');
      return;
    }

    if (!vacancy) {
      return;
    }

    const previous = isFavorite;
    setIsFavorite(!previous);
    setFavoriteNotice(null);

    try {
      if (previous) {
        await apiClient.removeFavorite(vacancy.id);
      } else {
        await apiClient.addFavorite(vacancy.id);
      }
    } catch {
      setIsFavorite(previous);
      setFavoriteNotice('Не удалось обновить избранное. Попробуйте ещё раз.');
    }
  };

  const handleContact = async () => {
    if (!vacancy) {
      return;
    }

    const contact = getPrimaryContact(vacancy.contacts);

    if (!contact) {
      if (vacancy.owner.maxUsername) {
        window.location.href = getMaxProfileHref(vacancy.owner.maxUsername);
        return;
      }

      setFavoriteNotice('\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u044b.');
      return;
    }

    const href = getContactHref(contact);

    if (href !== '#') {
      window.location.href = href;
      return;
    }

    try {
      await navigator.clipboard.writeText(contact.value);
      setFavoriteNotice('\u041a\u043e\u043d\u0442\u0430\u043a\u0442 \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d.');
    } catch {
      setFavoriteNotice(contact.value);
    }
  };

  if (status === 'loading') {
    return (
      <AppPage>
        <Link to="/vacancies" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
          <ArrowLeft size={17} />
          К вакансиям
        </Link>
        <AdCardSkeleton />
        <AdCardSkeleton />
      </AppPage>
    );
  }

  if (status === 'error' || !vacancy) {
    return (
      <AppPage>
        <Link to="/vacancies" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
          <ArrowLeft size={17} />
          К вакансиям
        </Link>
        <EmptyState
          title="Не удалось открыть вакансию"
          description={error ?? 'Вернитесь в список и попробуйте снова.'}
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
      <Link to="/vacancies" className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <ArrowLeft size={17} />
        К вакансиям
      </Link>

      <section className="app-surface app-topline relative overflow-hidden rounded-panel p-4 shadow-glow app-fade-up">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-accent-green/12 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green">
              <BriefcaseBusiness size={23} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <StatChip label="Вакансия" tone="green" />
              <StatChip label="Проверено" tone="green" icon={<ShieldCheck size={15} />} />
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-black leading-tight tracking-normal text-text-primary">{vacancy.title}</h1>
            {vacancy.subtitle ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Building2 size={18} className="shrink-0 text-accent-green" />
                {vacancy.subtitle}
              </p>
            ) : null}
            {vacancy.shortSalary ? <p className="text-2xl font-black text-accent-green">{vacancy.shortSalary}</p> : null}
          </div>

          {facts.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-panel border border-white/10 bg-black/[0.18] p-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-muted">{fact.label}</p>
                  <p className="mt-1 text-sm font-extrabold leading-tight text-text-primary">{fact.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {favoriteNotice ? (
        <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {favoriteNotice}
        </p>
      ) : null}

      {vacancy.photos.length > 0 || heroPhoto ? (
        <SectionCard title="Медиа" description="Все фото и видео из объявления. Первое фото используется как обложка.">
          <VacancyMediaGallery media={vacancy.photos.length > 0 ? vacancy.photos : heroPhoto ? [heroPhoto] : []} title={vacancy.title} />
        </SectionCard>
      ) : null}

      {vacancy.vacancy.metroStations.length > 0 ? (
        <SectionCard title="Метро">
          <div className="grid gap-2">
            {vacancy.vacancy.metroStations.map((metro) => (
              <div key={metro.id} className="flex items-center justify-between gap-3 rounded-panel bg-surface-900/92 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: metro.lineColor ?? '#3ddbd9' }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-text-primary">{metro.name}</p>
                    {metro.lineName ? <p className="truncate text-xs text-text-muted">{metro.lineName}</p> : null}
                  </div>
                </div>
                {metro.walkingMinutes ? (
                  <span className="text-sm font-semibold text-text-secondary">{metro.walkingMinutes} мин</span>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {vacancy.description ? (
        <SectionCard title="Описание">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{vacancy.description}</p>
        </SectionCard>
      ) : null}

      <TextListSection title="Что важно от кандидата" items={vacancy.requirements} />
      <TextListSection title="Что нужно делать" items={vacancy.responsibilities} />
      <TextListSection title="Что предлагает работодатель" items={vacancy.benefits} />

      <SectionCard title="Контакты" description="Связаться можно напрямую по данным из объявления.">
        {vacancy.contacts.length > 0 ? (
          <div className="grid gap-2">
            {vacancy.contacts.map((contact) => (
              <a
                key={contact.id}
                href={getContactHref(contact)}
                className="flex flex-col items-start gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex w-full min-w-0 items-center gap-3">
                  <Phone size={18} className="shrink-0 text-accent-green" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type.toUpperCase()}</p>
                    <p className="break-words text-sm text-text-secondary">{contact.value}</p>
                  </div>
                </div>
                {contact.isPreferred ? (
                  <span className="shrink-0">
                    <StatChip label="Основной" tone="green" />
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Контакты появятся здесь, когда работодатель их добавит.</p>
        )}
      </SectionCard>

      <ReviewsBlock subjectUserId={vacancy.owner.id} adId={vacancy.id} adTitle={vacancy.title} />

      <div className="text-center text-sm text-text-muted">
        Опубликовано {formatDate(vacancy.publishedAt ?? vacancy.createdAt)}
      </div>

      <div className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-30 grid w-[calc(100%-32px)] max-w-xl -translate-x-1/2 grid-cols-[1fr_auto_auto] gap-2 rounded-[22px] border border-white/10 bg-surface-950/88 p-2 shadow-[0_-16px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <ActionButton
          icon={<Send size={18} />}
          onClick={() => void handleContact()}
          disabled={!vacancy.contacts.length && !vacancy.owner.maxUsername}
        >
          Связаться
        </ActionButton>
        <ActionButton
          variant="secondary"
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          icon={<Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={19} />}
          onClick={() => void toggleFavorite()}
        />
        <ActionButton variant="secondary" aria-label={shareLabel} icon={<Share2 size={19} />} onClick={handleShare} />
      </div>
    </AppPage>
  );
}

function getPrimaryContact(contacts: PublicAdContact[]): PublicAdContact | null {
  return contacts.find((contact) => contact.isPreferred) ?? contacts[0] ?? null;
}

function VacancyMediaGallery({ media, title }: { media: PublicVacancyDetail['photos']; title: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {media.map((item) => (
        <div key={item.id} className="h-40 overflow-hidden rounded-[18px] border border-white/10 bg-surface-900">
          <MediaPreview
            src={item.previewUrl ?? item.url}
            mimeType={item.mimeType}
            alt={item.altText ?? title}
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function TextListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <SectionCard title={title}>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-base leading-6 text-text-secondary">
            <CheckCircle2 size={18} className="mt-1 shrink-0 text-accent-green" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function buildFacts(vacancy: PublicVacancyDetail) {
  return [
    { label: 'Локация', value: vacancy.locationShort }
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

function getContactHref(contact: PublicAdContact): string {
  const value = contact.value.trim();
  const type = contact.type.toLowerCase();

  if (!value) {
    return '#';
  }

  if (type === 'phone') {
    return `tel:${value.replace(/[^\d+]/g, '')}`;
  }

  if (type === 'email') {
    return `mailto:${value}`;
  }

  if (type === 'website') {
    return value.startsWith('http') ? value : `https://${value}`;
  }

  if (type === 'max' || value.startsWith('@')) {
    return getMaxProfileHref(value);
  }

  return '#';
}

function getMaxProfileHref(value: string): string {
  const username = value.replace(/^@/, '').trim();
  return username ? `https://max.ru/${encodeURIComponent(username)}` : '#';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

