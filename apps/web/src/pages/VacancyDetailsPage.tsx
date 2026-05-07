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
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCardSkeleton } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';

export function VacancyDetailsPage() {
  const { adId } = useParams();
  const [vacancy, setVacancy] = useState<PublicVacancyDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareLabel, setShareLabel] = useState('Поделиться');

  useEffect(() => {
    apiClient
      .listFavorites()
      .then((response) => {
        setIsFavorite(Boolean(adId && response.data.some((item) => item.ad.id === adId)));
      })
      .catch(() => {
        setIsFavorite(false);
      });
  }, [adId]);

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

  const heroPhoto = vacancy?.photos[0] ?? vacancy?.coverPhoto ?? null;
  const facts = useMemo(() => (vacancy ? buildFacts(vacancy) : []), [vacancy]);

  const handleShare = async () => {
    if (!vacancy) {
      return;
    }

    const url = window.location.href;
    const shareData = {
      title: vacancy.title,
      text: vacancy.subtitle ?? 'Вакансия в Rabst24',
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
    if (!vacancy) {
      return;
    }

    const previous = isFavorite;
    setIsFavorite(!previous);

    try {
      if (previous) {
        await apiClient.removeFavorite(vacancy.id);
      } else {
        await apiClient.addFavorite(vacancy.id);
      }
    } catch {
      setIsFavorite(previous);
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

      <section className="overflow-hidden rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.98),rgba(10,15,13,0.98))] shadow-glow app-fade-up">
        <div className="relative aspect-[4/3] bg-surface-800">
          {heroPhoto ? (
            <img
              src={heroPhoto.url}
              alt={heroPhoto.altText ?? vacancy.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(52,211,153,0.22),transparent_32%),linear-gradient(135deg,#101719,#050708)] text-accent-green">
              <BriefcaseBusiness size={54} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface-950/90 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
            <StatChip label="Вакансия" tone="green" />
            <StatChip label="Проверено" tone="cyan" icon={<ShieldCheck size={15} />} />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-black leading-tight text-text-primary">{vacancy.title}</h1>
            {vacancy.subtitle ? (
              <p className="flex items-center gap-2 text-base font-semibold text-text-secondary">
                <Building2 size={18} className="text-accent-green" />
                {vacancy.subtitle}
              </p>
            ) : null}
            {vacancy.shortSalary ? <p className="text-2xl font-black text-accent-green">{vacancy.shortSalary}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <p className="text-xs font-semibold uppercase text-text-muted">{fact.label}</p>
                <p className="mt-1 text-sm font-bold text-text-primary">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                className="flex items-center justify-between gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Phone size={18} className="shrink-0 text-accent-green" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type.toUpperCase()}</p>
                    <p className="truncate text-sm text-text-secondary">{contact.value}</p>
                  </div>
                </div>
                {contact.isPreferred ? <StatChip label="Основной" tone="green" /> : null}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Контакты появятся здесь, когда работодатель их добавит.</p>
        )}
      </SectionCard>

      <div className="text-center text-sm text-text-muted">
        Опубликовано {formatDate(vacancy.publishedAt ?? vacancy.createdAt)}
      </div>

      <div className="sticky bottom-20 z-10 grid grid-cols-[1fr_auto_auto] gap-2">
        <ActionButton icon={<Send size={18} />}>Связаться</ActionButton>
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
    { label: 'Локация', value: vacancy.locationShort },
    { label: 'Категория', value: vacancy.category },
    { label: 'График', value: vacancy.vacancy.schedule },
    { label: 'Опыт', value: vacancy.vacancy.experience }
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

function getContactHref(contact: PublicAdContact): string {
  if (contact.type === 'phone') {
    return `tel:${contact.value.replace(/[^\d+]/g, '')}`;
  }

  if (contact.type === 'email') {
    return `mailto:${contact.value}`;
  }

  if (contact.type === 'website') {
    return contact.value.startsWith('http') ? contact.value : `https://${contact.value}`;
  }

  return '#';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}
