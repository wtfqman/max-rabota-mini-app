import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CreditCard, ExternalLink, Flag, Heart, Phone, RefreshCw, Send } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { isValidPaymentConfirmationUrl, openExternalUrlWithResult } from '../shared/max/max-bridge.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { MediaPreview } from '../shared/ui/MediaPreview.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { StatChip } from '../shared/ui/StatChip.js';
import type { PublicAdContact } from '../features/vacancies/vacancy.types.js';
import type { PublicAdDetail } from '../features/ads/ad.types.js';
import { ReportAdSheet } from '../features/reports/ReportAdSheet.js';
import { ReviewsBlock } from '../features/reviews/ReviewsBlock.js';

export function AdDetailsPage() {
  const { adId } = useParams();
  const [ad, setAd] = useState<PublicAdDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [contactPurchaseNotice, setContactPurchaseNotice] = useState<string | null>(null);
  const [contactPaymentUrl, setContactPaymentUrl] = useState<string | null>(null);
  const [isContactPurchaseBusy, setIsContactPurchaseBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const accessToken = useAppStore((state) => state.accessToken);
  const currentUserId = useAppStore((state) => state.user.id);

  useEffect(() => {
    if (!adId) {
      setStatus('error');
      setError('Объявление не найдено.');
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .getAdDetails(adId)
      .then((response) => {
        if (!active) {
          return;
        }
        setAd(response.data);
        setStatus('ready');
        void apiClient.recordAdAnalyticsEvent({ adId: response.data.id, eventType: 'card_open' }).catch(() => undefined);

        if (response.data.contacts.length > 0 || (response.data.type === 'resume' && response.data.contactAccess)) {
          void apiClient.recordAdAnalyticsEvent({ adId: response.data.id, eventType: 'contact_open' }).catch(() => undefined);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        setError(getUserFacingError(requestError, 'ad_load'));
        setStatus('error');
      });

    if (accessToken) {
      apiClient
        .listFavorites()
        .then((response) => setIsFavorite(response.data.some((item) => item.ad.id === adId)))
        .catch(() => setIsFavorite(false));
    } else {
      setIsFavorite(false);
    }

    return () => {
      active = false;
    };
  }, [accessToken, adId, reloadKey]);

  const toggleFavorite = async () => {
    if (!accessToken) {
      setFavoriteNotice('Лайки и отзывы доступны после входа через MAX mini app.');
      return;
    }

    if (!ad) {
      return;
    }

    const previous = isFavorite;
    setIsFavorite(!previous);
    setFavoriteNotice(null);

    try {
      if (previous) {
        await apiClient.removeFavorite(ad.id);
      } else {
        await apiClient.addFavorite(ad.id);
      }
    } catch {
      setIsFavorite(previous);
      setFavoriteNotice('Не удалось обновить избранное. Попробуйте ещё раз.');
    }
  };

  const unlockResumeContact = async () => {
    if (!ad || ad.type !== 'resume') {
      return;
    }

    if (!accessToken) {
      setContactPurchaseNotice('Откройте приложение через MAX и войдите, чтобы оплатить доступ к контакту.');
      return;
    }

    try {
      setIsContactPurchaseBusy(true);
      setContactPurchaseNotice(null);
      const response = await apiClient.createResumeContactPurchase(ad.id);

      if (response.data.alreadyPurchased) {
        setContactPurchaseNotice('Доступ к связи уже активирован.');
        setReloadKey((value) => value + 1);
        return;
      }

      const confirmationUrl = response.data.payment?.confirmationUrl?.trim() ?? '';

      if (!isValidPaymentConfirmationUrl(confirmationUrl)) {
        setContactPurchaseNotice('Платёж создан, но YooKassa не вернула корректную ссылку. Попробуйте ещё раз.');
        return;
      }

      setContactPaymentUrl(confirmationUrl);
      setContactPurchaseNotice('Оплата создана. После оплаты вернитесь и нажмите “Проверить”.');
      openExternalUrlWithResult(confirmationUrl);
    } catch (requestError) {
      setContactPurchaseNotice(getUserFacingError(requestError, 'ad_load'));
    } finally {
      setIsContactPurchaseBusy(false);
    }
  };

  const sendResumeConnectionRequest = async () => {
    if (!ad || ad.type !== 'resume') {
      return;
    }

    try {
      setIsContactPurchaseBusy(true);
      setContactPurchaseNotice(null);
      await apiClient.sendResumeConnectionRequest(ad.id);
      setContactPurchaseNotice('Автору отправлен запрос на связь.');
    } catch (requestError) {
      setContactPurchaseNotice(getUserFacingError(requestError, 'ad_load'));
    } finally {
      setIsContactPurchaseBusy(false);
    }
  };

  const trackContactClick = (contact: PublicAdContact) => {
    const eventType = getContactAnalyticsEvent(contact);

    if (!ad || !eventType) {
      return;
    }

    void apiClient.recordAdAnalyticsEvent({ adId: ad.id, eventType }).catch(() => undefined);
  };

  const openReport = () => {
    if (!accessToken) {
      setFavoriteNotice('Войдите через MAX mini app, чтобы отправить жалобу.');
      return;
    }

    if (ad?.owner.id === currentUserId) {
      setFavoriteNotice('На свое объявление пожаловаться нельзя.');
      return;
    }

    setReportOpen(true);
  };

  if (status === 'loading') {
    return (
      <AppPage>
        <LoadingState />
      </AppPage>
    );
  }

  if (status === 'error' || !ad) {
    return (
      <AppPage>
        <EmptyState
          title="Не удалось открыть объявление"
          description={error ?? 'Попробуйте вернуться назад и открыть его ещё раз.'}
          action={
            <ActionButton icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          }
        />
      </AppPage>
    );
  }

  const resumeContactAccess = ad.type === 'resume' ? ad.contactAccess : undefined;
  const shouldShowResumeContactAccess = Boolean(
    resumeContactAccess &&
      (!resumeContactAccess.canViewContacts || Boolean(resumeContactAccess.maskedContact) || (ad.contacts.length === 0 && resumeContactAccess.verified))
  );

  return (
    <AppPage>
      <Link to={getBackUrl(ad.type)} className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <ArrowLeft size={17} />
        Назад
      </Link>

      <section className="overflow-hidden rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.98),rgba(10,15,13,0.98))] shadow-glow app-fade-up">
        {ad.coverPhoto ? (
          <MediaPreview
            src={ad.coverPhoto.previewUrl ?? ad.coverPhoto.url}
            mimeType={ad.coverPhoto.mimeType}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
        ) : null}
        <div className="grid gap-2.5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-green">{typeLabel(ad.type)}</p>
              <h1 className="text-2xl font-black text-text-primary">{ad.title}</h1>
              {ad.subtitle ? <p className="text-sm text-text-secondary">{ad.subtitle}</p> : null}
            </div>
            <ActionButton
              variant="secondary"
              aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              icon={<Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={19} />}
              onClick={() => void toggleFavorite()}
            />
            <ActionButton
              variant="secondary"
              aria-label="Пожаловаться"
              icon={<Flag size={19} />}
              onClick={openReport}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ad.category ? <StatChip label={ad.category} tone="green" /> : null}
            {ad.locationShort ? <StatChip label={ad.locationShort} tone="green" /> : null}
            {ad.shortSalary ? <StatChip label={ad.shortSalary} /> : null}
          </div>
        </div>
      </section>

      {favoriteNotice ? (
        <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {favoriteNotice}
        </p>
      ) : null}

      {ad.description ? (
        <SectionCard title={ad.type === 'resume' ? 'О себе' : 'Описание'}>
          <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">{ad.description}</p>
        </SectionCard>
      ) : null}

      {ad.photos.length > 0 ? (
        <SectionCard title="Медиа" description="Все фото и видео из объявления. Первое фото используется как обложка.">
          <MediaGallery media={ad.photos} title={ad.title} />
        </SectionCard>
      ) : null}
      {ad.type === 'vacancy' ? (
        <SectionCard title="Детали вакансии">
          <DetailGrid
            items={[
              ['Зарплата', ad.shortSalary],
              ['Адрес', ad.address ?? ad.locationShort]
            ]}
          />
        </SectionCard>
      ) : null}

      {ad.type === 'resume' ? (
        <SectionCard title="Детали резюме">
          <DetailGrid
            items={[
              ['Профессия', ad.resume.profession ?? ad.resume.desiredPosition],
              ['Желаемая сумма', ad.shortSalary]
            ]}
          />
        </SectionCard>
      ) : null}

      {ad.type === 'equipment' ? (
        <SectionCard title="Детали техники">
          <DetailGrid
            items={[
              ['Стоимость', ad.shortSalary],
              ['Адрес', ad.address ?? ad.locationShort]
            ]}
          />
        </SectionCard>
      ) : null}

      {ad.type === 'material' || ad.type === 'tool' ? (
        <SectionCard title="Детали объявления">
          <DetailGrid
            items={[
              ['Категория', ad.product.category],
              ['Цена', ad.product.price ? `${ad.product.price} ${ad.product.currency}` : null],
              ['Адрес', ad.product.address]
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Контакты">
        {shouldShowResumeContactAccess && resumeContactAccess ? (
          <div className="grid gap-3">
            <div className="rounded-panel border border-white/10 bg-surface-900/92 p-3">
              <p className="text-xs font-semibold uppercase text-text-muted">
                {resumeContactAccess.verified ? 'Контакт подтверждён через MAX' : 'Контакт скрыт'}
              </p>
              <p className="mt-1 text-lg font-black text-text-primary">{resumeContactAccess.maskedContact ?? '+7 *** ***-**-**'}</p>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                {resumeContactAccess.canViewContacts
                  ? 'Контакт подтверждён. Полный номер не показывается в карточке, связь идёт через MAX-запрос.'
                  : resumeContactAccess.alreadyPurchased
                  ? 'Доступ активирован. Отправьте автору запрос на связь через MAX, номер телефона не раскрывается автоматически.'
                  : resumeContactAccess.canPurchaseContact
                    ? 'Можно получить возможность связаться за 20 ₽. Сырой номер не передаётся покупателю автоматически.'
                    : 'Покупка связи сейчас недоступна: автору нужно подтвердить контакт или обновить согласие.'}
              </p>
            </div>
            {!resumeContactAccess.canViewContacts ? (
              <>
                {contactPurchaseNotice ? (
                  <p className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-3 py-2 text-sm font-semibold text-accent-green">
                    {contactPurchaseNotice}
                  </p>
                ) : null}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  {resumeContactAccess.alreadyPurchased ? (
                    <ActionButton type="button" icon={<Send size={18} />} disabled={isContactPurchaseBusy} onClick={() => void sendResumeConnectionRequest()}>
                      {isContactPurchaseBusy ? 'Отправляем...' : 'Отправить запрос автору'}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      type="button"
                      icon={<CreditCard size={18} />}
                      disabled={isContactPurchaseBusy || !resumeContactAccess.canPurchaseContact}
                      onClick={() => void unlockResumeContact()}
                    >
                      {isContactPurchaseBusy ? 'Создаём оплату...' : 'Связаться за 20 ₽'}
                    </ActionButton>
                  )}
                  <ActionButton type="button" variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
                    Проверить
                  </ActionButton>
                </div>
                {contactPaymentUrl ? (
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-panel border border-white/10 bg-surface-900/92 px-3 text-sm font-extrabold text-text-primary"
                    href={contactPaymentUrl}
                    onClick={(event) => {
                      event.preventDefault();
                      openExternalUrlWithResult(contactPaymentUrl);
                    }}
                  >
                    <ExternalLink size={18} />
                    Открыть ссылку оплаты
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        ) : ad.contacts.length ? (
          <div className="grid gap-2">
            {ad.contacts.map((contact) => (
              <a
                key={contact.id}
                href={getContactHref(contact)}
                onClick={() => trackContactClick(contact)}
                className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35 active:scale-[0.985]"
              >
                <Phone size={18} className="shrink-0 text-accent-green" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type}</p>
                  <p className="truncate text-sm text-text-secondary">{contact.value}</p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Контакты пока не указаны.</p>
        )}
      </SectionCard>

      {ad.type !== 'resume' || ad.owner.profile?.allowResumePublicProfile ? (
        <SectionCard title={ad.type === 'resume' ? 'Соискатель' : 'Автор'}>
          <Link
            to={`/users/${ad.owner.id}`}
            className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/92 p-3 transition hover:border-accent-green/35"
          >
            {ad.owner.profile?.avatarUrl ? (
              <img src={ad.owner.profile.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-greenSoft text-accent-green">
                <Building2 size={21} />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-text-primary">
                {ad.owner.profile?.companyName ?? ad.owner.displayName ?? ad.owner.maxUsername ?? 'Профиль'}
              </span>
              <span className="text-xs text-text-muted">Открыть публичный профиль</span>
            </span>
          </Link>
        </SectionCard>
      ) : null}

      <ReviewsBlock subjectUserId={ad.owner.id} adId={ad.id} adTitle={ad.title} />

      {reportOpen ? <ReportAdSheet adId={ad.id} title={ad.title} onClose={() => setReportOpen(false)} /> : null}
    </AppPage>
  );
}

function MediaGallery({ media, title }: { media: PublicAdDetail['photos']; title: string }) {
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

function typeLabel(type: string): string {
  if (type === 'resume') {
    return 'Резюме';
  }

  if (type === 'equipment') {
    return 'Строительная техника';
  }

  if (type === 'material') {
    return 'Строительные материалы';
  }

  if (type === 'tool') {
    return 'Инструменты';
  }

  return 'Вакансия';
}

function getBackUrl(type: string): string {
  if (type === 'resume') {
    return '/resumes';
  }

  if (type === 'equipment') {
    return '/equipment';
  }

  if (type === 'material') {
    return '/materials';
  }

  if (type === 'tool') {
    return '/tools';
  }

  return '/vacancies';
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

  if (contact.type === 'max') {
    const value = contact.value.trim();
    return value.startsWith('http') ? value : `https://max.ru/${value.replace(/^@/, '')}`;
  }

  return '#';
}

function getContactAnalyticsEvent(
  contact: PublicAdContact
): 'phone_click' | 'email_click' | 'max_click' | 'website_click' | null {
  if (contact.type === 'phone') {
    return 'phone_click';
  }

  if (contact.type === 'email') {
    return 'email_click';
  }

  if (contact.type === 'max') {
    return 'max_click';
  }

  if (contact.type === 'website') {
    return 'website_click';
  }

  return null;
}

function DetailGrid({ items }: { items: Array<[string, string | null]> }) {
  const visible = items.filter((item): item is [string, string] => Boolean(item[1]));

  if (!visible.length) {
    return <p className="text-sm text-text-secondary">Подробности указаны в описании.</p>;
  }

  return (
    <div className="grid gap-2">
      {visible.map(([label, value]) => (
        <div key={label} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
          <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}
