import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileText,
  Flag,
  Heart,
  Phone,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  UserPlus,
  X
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { PublicAdContact, PublicVacancyDetail } from '../features/vacancies/vacancy.types.js';
import type { OwnedAdCard } from '../features/ads/ad.types.js';
import { ReportAdSheet } from '../features/reports/ReportAdSheet.js';
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
  const currentUserId = useAppStore((state) => state.user.id);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState('Поделиться');
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
        void apiClient.recordAdAnalyticsEvent({ adId: response.data.id, eventType: 'card_open' }).catch(() => undefined);
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
        void apiClient.recordAdAnalyticsEvent({ adId: vacancy.id, eventType: 'contact_open' }).catch(() => undefined);
        void apiClient.recordAdAnalyticsEvent({ adId: vacancy.id, eventType: 'max_click' }).catch(() => undefined);
        window.location.href = getMaxProfileHref(vacancy.owner.maxUsername);
        return;
      }

      setFavoriteNotice('\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u044b.');
      return;
    }

    const href = getContactHref(contact);
    trackContactAnalytics(vacancy.id, contact);

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

  const handleApplyClick = () => {
    if (!accessToken) {
      setFavoriteNotice('Войдите через MAX mini app, чтобы отправить отклик.');
      return;
    }

    if (currentUserId && vacancy?.owner.id === currentUserId) {
      setFavoriteNotice('На свою вакансию откликнуться нельзя.');
      return;
    }

    setApplicationOpen(true);
  };

  const openReport = () => {
    if (!accessToken) {
      setFavoriteNotice('Войдите через MAX mini app, чтобы отправить жалобу.');
      return;
    }

    if (currentUserId && vacancy?.owner.id === currentUserId) {
      setFavoriteNotice('На свою вакансию пожаловаться нельзя.');
      return;
    }

    setReportOpen(true);
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

      {vacancy.description ? (
        <SectionCard title="Описание">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{vacancy.description}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Контакты" description="Связаться можно напрямую по данным из объявления.">
        {vacancy.contacts.length > 0 ? (
          <div className="grid gap-2">
            {vacancy.contacts.map((contact) => (
              <a
                key={contact.id}
                href={getContactHref(contact)}
                onClick={() => trackContactAnalytics(vacancy.id, contact)}
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

      <SectionCard title="Работодатель">
        <Link
          to={`/users/${vacancy.owner.id}`}
          className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35"
        >
          {vacancy.owner.profile?.avatarUrl ? (
            <img src={vacancy.owner.profile.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-greenSoft text-accent-green">
              <Building2 size={21} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-text-primary">
              {vacancy.owner.profile?.companyName ?? vacancy.owner.displayName ?? vacancy.owner.maxUsername ?? 'Профиль'}
            </span>
            <span className="text-xs text-text-muted">Открыть публичный профиль</span>
          </span>
        </Link>
      </SectionCard>

      <ReviewsBlock subjectUserId={vacancy.owner.id} adId={vacancy.id} adTitle={vacancy.title} />

      <div className="text-center text-sm text-text-muted">
        Опубликовано {formatDate(vacancy.publishedAt ?? vacancy.createdAt)}
      </div>

      {applicationOpen ? (
        <VacancyApplicationSheet vacancy={vacancy} onClose={() => setApplicationOpen(false)} />
      ) : null}

      {reportOpen ? <ReportAdSheet adId={vacancy.id} title={vacancy.title} onClose={() => setReportOpen(false)} /> : null}

      <div className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-30 grid w-[calc(100%-32px)] max-w-xl -translate-x-1/2 grid-cols-[1.1fr_1fr_auto_auto_auto] gap-2 rounded-[22px] border border-white/10 bg-surface-950/88 p-2 shadow-[0_-16px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <ActionButton
          icon={<UserPlus size={18} />}
          onClick={handleApplyClick}
          disabled={Boolean(currentUserId && vacancy.owner.id === currentUserId)}
        >
          Откликнуться
        </ActionButton>
        <ActionButton
          variant="secondary"
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
        <ActionButton variant="secondary" aria-label="Пожаловаться" icon={<Flag size={19} />} onClick={openReport} />
        <ActionButton variant="secondary" aria-label={shareLabel} icon={<Share2 size={19} />} onClick={handleShare} />
      </div>
    </AppPage>
  );
}

function getPrimaryContact(contacts: PublicAdContact[]): PublicAdContact | null {
  return contacts.find((contact) => contact.isPreferred) ?? contacts[0] ?? null;
}

function VacancyApplicationSheet({ vacancy, onClose }: { vacancy: PublicVacancyDetail; onClose: () => void }) {
  const [resumes, setResumes] = useState<OwnedAdCard[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [coverMessage, setCoverMessage] = useState('');
  const [contactValue, setContactValue] = useState('');
  const [contactType, setContactType] = useState<'phone' | 'max' | 'email' | 'website' | 'other'>('phone');
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'sent' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listMyAds({ type: 'resume', perPage: 50 })
      .then((response) => {
        if (!active) {
          return;
        }

        const published = response.data.filter((ad) => ad.status === 'approved' || ad.status === 'published');
        setResumes(published);
        setSelectedResumeId(published[0]?.id ?? '');
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'my_ads_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    const trimmedContact = contactValue.trim();

    if (!selectedResumeId && !trimmedContact) {
      setError('Укажите контакт или выберите опубликованное резюме.');
      return;
    }

    setStatus('submitting');
    setError(null);

    try {
      await apiClient.createJobApplication(vacancy.id, {
        resumeAdId: selectedResumeId || null,
        coverMessage: coverMessage.trim() || null,
        contact: trimmedContact
          ? {
              type: contactType,
              value: trimmedContact
            }
          : null
      });
      setStatus('sent');
    } catch (requestError: unknown) {
      setError(getUserFacingError(requestError, 'application_submit'));
      setStatus('ready');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/62 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[24px] border border-white/10 bg-surface-950 p-4 shadow-[0_-24px_60px_rgba(0,0,0,0.52)]">
        <div className="mx-auto grid max-w-xl gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-text-primary">Отклик на вакансию</h2>
              <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{vacancy.title}</p>
            </div>
            <ActionButton variant="secondary" aria-label="Закрыть" icon={<X size={18} />} onClick={onClose} />
          </div>

          {status === 'loading' ? <LoadingInline /> : null}

          {status === 'sent' ? (
            <div className="grid gap-3 rounded-panel border border-accent-green/25 bg-accent-greenSoft p-4 text-accent-green">
              <CheckCircle2 size={28} />
              <div>
                <p className="font-extrabold">Отклик отправлен</p>
                <p className="mt-1 text-sm">Работодатель получил уведомление и увидит переданный контакт бесплатно.</p>
              </div>
              <Link to="/applications" className="text-sm font-extrabold underline underline-offset-4" onClick={onClose}>
                Мои отклики
              </Link>
            </div>
          ) : null}

          {status !== 'sent' ? (
            <>
              <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/80 p-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-text-primary">
                  <FileText size={17} className="text-accent-green" />
                  Резюме
                </div>
                {resumes.length > 0 ? (
                  <select
                    className="min-h-11 rounded-panel border border-white/10 bg-surface-950 px-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-green"
                    value={selectedResumeId}
                    onChange={(event) => setSelectedResumeId(event.target.value)}
                  >
                    <option value="">Без резюме</option>
                    {resumes.map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        {resume.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid gap-2 rounded-panel border border-white/8 bg-surface-950/70 p-3">
                    <p className="text-sm text-text-secondary">Опубликованного резюме пока нет.</p>
                    <Link to="/create/resume" className="text-sm font-extrabold text-accent-green underline underline-offset-4">
                      Создать резюме
                    </Link>
                  </div>
                )}
              </div>

              <label className="grid gap-2 text-sm font-bold text-text-secondary">
                Сообщение
                <textarea
                  className="min-h-28 resize-none rounded-panel border border-white/10 bg-surface-900/80 px-3 py-3 text-sm font-medium text-text-primary outline-none transition focus:border-accent-green"
                  maxLength={1200}
                  value={coverMessage}
                  onChange={(event) => setCoverMessage(event.target.value)}
                  placeholder="Коротко расскажите, почему вы подходите"
                />
              </label>

              <div className="grid grid-cols-[120px_1fr] gap-2">
                <select
                  className="min-h-11 rounded-panel border border-white/10 bg-surface-900/80 px-3 text-sm font-semibold text-text-primary outline-none focus:border-accent-green"
                  value={contactType}
                  onChange={(event) => setContactType(event.target.value as typeof contactType)}
                >
                  <option value="phone">Телефон</option>
                  <option value="max">MAX</option>
                  <option value="email">Email</option>
                  <option value="website">Сайт</option>
                  <option value="other">Другое</option>
                </select>
                <input
                  className="min-h-11 rounded-panel border border-white/10 bg-surface-900/80 px-3 text-sm font-semibold text-text-primary outline-none transition focus:border-accent-green"
                  value={contactValue}
                  onChange={(event) => setContactValue(event.target.value)}
                  placeholder="Контакт для работодателя"
                />
              </div>

              {error ? (
                <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
              ) : null}

              <ActionButton icon={<Send size={18} />} disabled={status === 'submitting'} onClick={() => void submit()}>
                {status === 'submitting' ? 'Отправляем...' : 'Отправить отклик'}
              </ActionButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadingInline() {
  return (
    <div className="rounded-panel border border-white/10 bg-surface-900/80 p-3 text-sm font-semibold text-text-secondary">
      Загрузка...
    </div>
  );
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

function trackContactAnalytics(adId: string, contact: PublicAdContact): void {
  const eventType = getContactAnalyticsEvent(contact);

  void apiClient.recordAdAnalyticsEvent({ adId, eventType: 'contact_open' }).catch(() => undefined);

  if (eventType) {
    void apiClient.recordAdAnalyticsEvent({ adId, eventType }).catch(() => undefined);
  }
}

function getContactAnalyticsEvent(
  contact: PublicAdContact
): 'phone_click' | 'email_click' | 'max_click' | 'website_click' | null {
  const type = contact.type.toLowerCase();

  if (type === 'phone') {
    return 'phone_click';
  }

  if (type === 'email') {
    return 'email_click';
  }

  if (type === 'max' || contact.value.trim().startsWith('@')) {
    return 'max_click';
  }

  if (type === 'website') {
    return 'website_click';
  }

  return null;
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

