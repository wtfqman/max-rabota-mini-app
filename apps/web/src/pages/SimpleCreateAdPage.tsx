import { useEffect, useRef, useState } from 'react';
import {
  VACANCY_MEDIA_FEE_AMOUNT_RUB,
  VACANCY_PUBLICATION_PLANS,
  getVacancyPublicationPaymentAmount,
  requiresVacancyMediaFee,
  requiresAdPayment,
  type VacancyPublicationFundingMode,
  type VacancyPublicationPlanCode
} from '@rabst24/shared';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  ExternalLink,
  FileUser,
  HardHat,
  ImagePlus,
  Loader2,
  Package,
  Send,
  Truck,
  Wrench
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import type { UploadedPhoto } from '../features/vacancies/create-vacancy.types.js';
import {
  initialAdForm,
  submitByKind,
  type AdCategoryFormErrors,
  type AdCategoryFormState,
  type CreateAdKind
} from '../features/ads/form/ad-form.model.js';
import { getCoverMedia, normalizeAdMedia } from '../features/uploads/upload-flow.js';
import { apiClient } from '../shared/api/client.js';
import { ApiError } from '../shared/api/http.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import {
  closeReservedExternalNavigation,
  getMaxWebApp,
  getMaxPlatform,
  isValidPaymentConfirmationUrl,
  openExternalUrlWithResult,
  reserveExternalNavigation
} from '../shared/max/max-bridge.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { FormSection } from '../shared/ui/FormSection.js';
import { Input } from '../shared/ui/Input.js';
import { PhotoUploader } from '../shared/ui/PhotoUploader.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { Textarea } from '../shared/ui/Textarea.js';

export type { CreateAdKind };

type FormErrors = AdCategoryFormErrors;
type SubmitStage = 'idle' | 'uploading' | 'creating';
type VacancyPublicationBalance = {
  purchased: number;
  bonus: number;
  used: number;
  remaining: number;
};
type PendingPaymentLink = {
  url: string;
  adId: string;
  paymentId: string;
  amount: string;
};

interface CreateCopy {
  kind: CreateAdKind;
  title: string;
  label: string;
  intro: string;
  icon: LucideIcon;
  previewType: string;
  previewCategory: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  moneyLabel: string;
  moneyPlaceholder: string;
  contactPlaceholder: string;
  addressLabel?: string;
  addressPlaceholder?: string;
  requiresAddress: boolean;
  maxPhotos: number;
}

const createCopy: Record<CreateAdKind, CreateCopy> = {
  vacancy: {
    kind: 'vacancy',
    title: 'Разместить вакансию',
    label: 'Вакансия',
    intro: 'Шесть понятных полей: кого ищете, что нужно делать, зарплата, контакт и адрес объекта.',
    icon: HardHat,
    previewType: 'Вакансия',
    previewCategory: 'Работа',
    nameLabel: 'Специальность',
    namePlaceholder: 'Например: сварщик, бетонщик, прораб',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Опишите объект, задачи, график и кого вы ищете.',
    moneyLabel: 'Зарплата',
    moneyPlaceholder: 'Например: от 120 000 руб.',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    addressLabel: 'Адрес',
    addressPlaceholder: 'Город, район или адрес объекта',
    requiresAddress: true,
    maxPhotos: 8
  },
  resume: {
    kind: 'resume',
    title: 'Новое резюме',
    label: 'Резюме',
    intro: 'Заполните главное о себе, чтобы работодатель быстро понял ваш опыт и контакт.',
    icon: FileUser,
    previewType: 'Резюме',
    previewCategory: 'Соискатель',
    nameLabel: 'ФИО',
    namePlaceholder: 'Например: Иван Иванов',
    descriptionLabel: 'О себе',
    descriptionPlaceholder: 'Коротко расскажите о себе и какую работу ищете.',
    moneyLabel: 'Желаемая зарплата',
    moneyPlaceholder: 'Например: 100 000 руб.',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    requiresAddress: false,
    maxPhotos: 8
  },
  equipment: {
    kind: 'equipment',
    title: 'Строительная техника',
    label: 'Техника',
    intro: 'Добавьте технику: название, стоимость, место и контакт.',
    icon: Truck,
    previewType: 'Техника',
    previewCategory: 'Строительная техника',
    nameLabel: 'Название техники',
    namePlaceholder: 'Например: экскаватор-погрузчик JCB 3CX',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Коротко опишите технику и важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 15 000 руб. за смену',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    addressLabel: 'Адрес',
    addressPlaceholder: 'Где находится техника',
    requiresAddress: true,
    maxPhotos: 8
  },
  material: {
    kind: 'material',
    title: 'Строительные материалы',
    label: 'Материалы',
    intro: 'Разместите материалы понятно: что продаёте, цена, где забрать и контакт.',
    icon: Package,
    previewType: 'Материал',
    previewCategory: 'Строительные материалы',
    nameLabel: 'Название',
    namePlaceholder: 'Например: кирпич облицовочный, 1200 шт.',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Коротко опишите материал и важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 25 000 руб.',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    addressLabel: 'Адрес',
    addressPlaceholder: 'Где можно посмотреть или забрать',
    requiresAddress: true,
    maxPhotos: 8
  },
  tool: {
    kind: 'tool',
    title: 'Инструменты',
    label: 'Инструменты',
    intro: 'Добавьте инструмент: название, цену, место и контакт.',
    icon: Wrench,
    previewType: 'Инструмент',
    previewCategory: 'Инструменты',
    nameLabel: 'Название',
    namePlaceholder: 'Например: перфоратор Bosch SDS-plus',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Коротко опишите инструмент и важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 2 000 руб. в сутки',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    addressLabel: 'Адрес',
    addressPlaceholder: 'Где находится инструмент',
    requiresAddress: true,
    maxPhotos: 8
  }
};

export function SimpleCreateAdPage({ kind }: { kind: CreateAdKind }) {
  const copy = createCopy[kind];
  const Icon = copy.icon;
  const isVacancy = kind === 'vacancy';
  const accessToken = useAppStore((state) => state.accessToken);
  const currentUserId = useAppStore((state) => state.user.id);
  const draftKey = `rabst24:create:${kind}:simple`;
  const draftPhotosKey = `${draftKey}:photos`;
  const isSubmittingRef = useRef(false);
  const [selectedPlan, setSelectedPlan] = useState<VacancyPublicationPlanCode>('single');
  const [vacancyFunding, setVacancyFunding] = useState<VacancyPublicationFundingMode>('buy_package');
  const [vacancyBalance, setVacancyBalance] = useState<VacancyPublicationBalance | null>(null);
  const [isVacancyBalanceLoading, setIsVacancyBalanceLoading] = useState(false);
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<AdCategoryFormState>(initialAdForm);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const availableVacancyPublications = vacancyBalance?.remaining ?? 0;
  const mediaFeeRequired = requiresVacancyMediaFee(photos);
  const usesBalanceForVacancy = isVacancy && vacancyFunding === 'use_balance' && availableVacancyPublications > 0;
  const vacancyPaymentAmount = getVacancyPublicationPaymentAmount({
    planCode: selectedPlan,
    usesBalance: usesBalanceForVacancy,
    mediaFeeRequired
  });
  const isPaidPlacement = requiresAdPayment(kind) && (!usesBalanceForVacancy || mediaFeeRequired);
  const isMoneyRequired = kind !== 'resume';
  const priceLabel = formatRubAmount(isVacancy ? vacancyPaymentAmount : '0.00');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPaymentLink, setPendingPaymentLink] = useState<PendingPaymentLink | null>(null);
  const [isPaymentLinkCopied, setIsPaymentLinkCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');
  const [verifiedResumeContact, setVerifiedResumeContact] = useState<{
    verifiedContactId: string;
    contactConsentId: string;
    maskedValue: string;
    expiresAt: string | null;
  } | null>(null);
  const [contactVerificationNotice, setContactVerificationNotice] = useState<string | null>(null);
  const [isContactVerificationBusy, setIsContactVerificationBusy] = useState(false);

  useEffect(() => {
    setMode('form');
    setForm(initialAdForm);
    setPhotos([]);
    setSelectedPlan('single');
    setVacancyFunding('buy_package');
    setVacancyBalance(null);
    setErrors({});
    setSubmitError(null);
    setPendingPaymentLink(null);
    setIsPaymentLinkCopied(false);
    setVerifiedResumeContact(null);
    setContactVerificationNotice(null);

    try {
      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(draftPhotosKey);
    } catch {
      // Draft cleanup is best-effort; the create form must still start empty.
    }
  }, [draftKey, draftPhotosKey]);

  useEffect(() => {
    if (!isVacancy || !accessToken) {
      return;
    }

    let active = true;
    setIsVacancyBalanceLoading(true);

    apiClient
      .getMe()
      .then((response) => {
        if (!active) {
          return;
        }

        const balance = response.data.stats.vacancyPublicationBalance;
        setVacancyBalance(balance);
        setVacancyFunding(balance.remaining > 0 ? 'use_balance' : 'buy_package');
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setVacancyBalance(null);
        setVacancyFunding('buy_package');
      })
      .finally(() => {
        if (active) {
          setIsVacancyBalanceLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, isVacancy]);

  const updatePhotos = (nextPhotos: UploadedPhoto[]) => {
    const normalizedPhotos = normalizeAdMedia(nextPhotos, copy.maxPhotos, 1);

    setPhotos(normalizedPhotos);
    setSubmitError(null);
  };

  const updateField = <TKey extends keyof AdCategoryFormState>(key: TKey, value: AdCategoryFormState[TKey]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
    setSubmitError(null);
    setPendingPaymentLink(null);
    setIsPaymentLinkCopied(false);
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    const minNameLength = copy.kind === 'vacancy' ? 5 : copy.kind === 'resume' ? 2 : 3;
    const minDescriptionLength = 3;

    if (form.name.trim().length < minNameLength) {
      nextErrors.name =
        copy.kind === 'vacancy'
          ? 'Укажите специальность, например “сварщик”.'
          : copy.kind === 'resume'
            ? 'Укажите имя.'
            : 'Укажите название.';
    }

    if (copy.kind === 'resume' && form.specialty.trim().length < 2) {
      nextErrors.specialty = 'Укажите специальность.';
    }

    if ((copy.kind === 'material' || copy.kind === 'tool') && form.categoryText.trim().length < 2) {
      nextErrors.categoryText = 'Укажите категорию.';
    }

    if (form.description.trim().length < minDescriptionLength) {
      nextErrors.description = 'Добавьте короткое описание.';
    }

    if (isMoneyRequired && !form.money.trim()) {
      nextErrors.money = copy.kind === 'vacancy' ? 'Укажите зарплату или диапазон.' : copy.moneyLabel === 'Цена' ? 'Укажите цену.' : 'Укажите зарплату.';
    }

    if (copy.kind === 'resume' && !verifiedResumeContact) {
      nextErrors.contact = 'Подтвердите контакт через MAX.';
    } else if (copy.kind !== 'resume' && form.contact.trim().length < 3) {
      nextErrors.contact = 'Укажите контакт для связи.';
    }

    if (copy.requiresAddress && form.address.trim().length < 2) {
      nextErrors.address = copy.kind === 'vacancy' ? 'Укажите город, район или адрес объекта.' : 'Укажите адрес или район.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Проверьте выделенные поля и попробуйте ещё раз.');
      setMode('form');
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
      return false;
    }

    setSubmitError(null);
    return true;
  };

  const openPreview = () => {
    if (isMediaBusy) {
      setSubmitError('Пожалуйста, дождитесь завершения загрузки файлов.');
      return;
    }

    if (!validate()) {
      return;
    }

    setMode('preview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const verifyResumeContactViaMax = async () => {
    const webApp = getMaxWebApp();

    if (!webApp || typeof webApp.requestContact !== 'function') {
      setContactVerificationNotice('В этой версии MAX requestContact недоступен. Используйте подтверждение через бота.');
      return;
    }

    const maxUserId = webApp.initDataUnsafe?.user?.id;
    if (!maxUserId) {
      setContactVerificationNotice('Не удалось определить MAX пользователя. Откройте мини-приложение внутри MAX.');
      return;
    }

    setIsContactVerificationBusy(true);
    setContactVerificationNotice(null);

    try {
      const contact = await webApp.requestContact();
      const response = await apiClient.verifyMaxMiniAppContact({
        phone: contact.phone,
        authDate: contact.authDate,
        hash: contact.hash,
        userId: maxUserId
      });
      const consentId = response.data.consent.id ?? response.data.contact.activeConsent?.id;

      if (!consentId) {
        throw new Error('Server did not return contact consent');
      }

      setVerifiedResumeContact({
        verifiedContactId: response.data.contact.id,
        contactConsentId: consentId,
        maskedValue: response.data.contact.maskedValue,
        expiresAt: response.data.contact.expiresAt
      });
      setContactVerificationNotice('Контакт подтверждён через MAX.');
      setErrors((current) => ({ ...current, contact: undefined }));
    } catch (error) {
      setContactVerificationNotice(getUserFacingError(error, 'profile_load'));
    } finally {
      setIsContactVerificationBusy(false);
    }
  };

  const requestResumeContactViaBot = async () => {
    setIsContactVerificationBusy(true);
    setContactVerificationNotice(null);

    try {
      await apiClient.requestMaxBotContactVerification();
      setContactVerificationNotice('Мы отправили кнопку подтверждения в MAX-бот. Нажмите «Поделиться контактом», затем вернитесь и обновите статус.');
    } catch (error) {
      setContactVerificationNotice(getUserFacingError(error, 'profile_load'));
    } finally {
      setIsContactVerificationBusy(false);
    }
  };

  const submit = async () => {
    const maxPlatform = getMaxPlatform();

    logPaymentClient('[MAX_PLATFORM]', {
      userId: currentUserId,
      platform: maxPlatform
    });

    logPaymentClient('[PAYMENT_CLICK]', {
      userId: currentUserId,
      draftId: draftKey,
      platform: maxPlatform,
      kind,
      isPaidPlacement,
      tariffId: selectedPlan,
      vacancyFunding,
      hasMedia: mediaFeeRequired,
      amount: vacancyPaymentAmount
    });

    if (isSubmittingRef.current || isSubmitting) {
      logPaymentClient('[PAYMENT_CLICK_IGNORED]', {
        userId: currentUserId,
        draftId: draftKey,
        reason: 'already_submitting'
      });
      return;
    }

    if (!validate()) {
      return;
    }

    if (isMediaBusy) {
      setSubmitError('Пожалуйста, дождитесь завершения загрузки файлов.');
      setMode('form');
      return;
    }

    if (!accessToken) {
      setSubmitError('Откройте приложение из MAX и попробуйте ещё раз.');
      setMode('form');
      return;
    }

    isSubmittingRef.current = true;
    const paymentNavigation = isPaidPlacement ? reserveExternalNavigation() : null;

    try {
      setIsSubmitting(true);
      setSubmitStage('creating');
      setSubmitError(null);
      setPendingPaymentLink(null);
      setIsPaymentLinkCopied(false);

      logPaymentClient('[PAYMENT_REQUEST]', {
        endpoint: kind === 'vacancy' ? 'POST /vacancies' : `POST /${kind}`,
        userId: currentUserId,
        draftId: draftKey,
        kind,
        tariffId: selectedPlan,
        vacancyFunding,
        hasMedia: mediaFeeRequired,
        amount: vacancyPaymentAmount
      });
      const createdAd = await submitByKind(kind, form, photos, selectedPlan, vacancyFunding, verifiedResumeContact);

      logPaymentClient('[PAYMENT_RESPONSE]', {
        endpoint: kind === 'vacancy' ? 'POST /vacancies' : `POST /${kind}`,
        userId: currentUserId,
        adId: createdAd.id,
        status: createdAd.status,
        hasPayment: Boolean(createdAd.payment),
        paymentId: createdAd.payment?.paymentId,
        amount: createdAd.payment?.amount,
        hasConfirmationUrl: Boolean(createdAd.payment?.confirmationUrl)
      });

      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(draftPhotosKey);
      setForm(initialAdForm);
      setPhotos([]);
      setVerifiedResumeContact(null);

      if (createdAd.payment) {
        const confirmationUrl = createdAd.payment.confirmationUrl?.trim() ?? '';

        if (!isValidPaymentConfirmationUrl(confirmationUrl)) {
          logPaymentClient('[PAYMENT_OPEN_ERROR]', {
            stage: 'invalid_confirmation_url',
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            hasConfirmationUrl: Boolean(confirmationUrl)
          });
          setSubmitError('Не удалось открыть страницу оплаты. Попробуйте ещё раз.');
          setMode('form');
          window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
          return;
        }

        const nextPaymentLink = {
          url: confirmationUrl,
          adId: createdAd.id,
          paymentId: createdAd.payment.paymentId,
          amount: createdAd.payment.amount
        };

        setPendingPaymentLink(nextPaymentLink);
        setIsPaymentLinkCopied(false);
        setMode('form');

        logPaymentClient('[PAYMENT_CONFIRMATION_URL]', {
          userId: currentUserId,
          adId: createdAd.id,
          paymentId: createdAd.payment.paymentId,
          amount: createdAd.payment.amount,
          hasConfirmationUrl: true
        });

        try {
          logPaymentClient('[PAYMENT_OPEN_ATTEMPT]', {
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            urlHost: new URL(confirmationUrl).host
          });

          const openResult = openExternalUrlWithResult(confirmationUrl, paymentNavigation);

          logPaymentClient(openResult.method === 'WebApp.openLink' ? '[MAX_EXTERNAL_LINK]' : '[MAX_EXTERNAL_LINK_FALLBACK]', {
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            platform: openResult.platform,
            method: openResult.method,
            reason: openResult.reason
          });

          if (!openResult.opened) {
            throw new Error(`External payment opener returned false: ${openResult.reason ?? 'unknown'}`);
          }

          logPaymentClient('[PAYMENT_NAVIGATION]', {
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            target: 'yookassa',
            platform: openResult.platform,
            method: openResult.method,
            opened: openResult.opened
          });

          logPaymentClient('[PAYMENT_OPEN_SUCCESS]', {
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            platform: openResult.platform,
            method: openResult.method,
            opened: openResult.opened
          });
        } catch (openError) {
          closeReservedExternalNavigation(paymentNavigation);
          logPaymentClient('[PAYMENT_OPEN_ERROR]', {
            stage: 'open',
            userId: currentUserId,
            adId: createdAd.id,
            paymentId: createdAd.payment.paymentId,
            error: openError instanceof Error ? openError.message : String(openError)
          });
          setSubmitError('Не удалось открыть страницу оплаты. Попробуйте ещё раз.');
        }
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
        return;
      }

      closeReservedExternalNavigation(paymentNavigation);
      setMode('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      closeReservedExternalNavigation(paymentNavigation);
      logPaymentClient('[PAYMENT_ERROR]', {
        stage: 'request',
        userId: currentUserId,
        draftId: draftKey,
        kind,
        status: error instanceof ApiError ? error.status : undefined,
        details: error instanceof ApiError ? error.details : undefined,
        error: error instanceof Error ? error.message : String(error)
      });
      setSubmitError(
        isPaidPlacement && !(error instanceof ApiError && (error.status === 401 || error.status === 403))
          ? 'Не удалось создать платёж. Попробуйте ещё раз.'
          : getUserFacingError(error, submitErrorScope(kind))
      );
      setMode('form');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setSubmitStage('idle');
    }
  };

  const openPendingPayment = () => {
    if (!pendingPaymentLink) {
      return;
    }

    try {
      logPaymentClient('[PAYMENT_OPEN_ATTEMPT]', {
        userId: currentUserId,
        adId: pendingPaymentLink.adId,
        paymentId: pendingPaymentLink.paymentId,
        platform: getMaxPlatform(),
        retry: true
      });
      const openResult = openExternalUrlWithResult(pendingPaymentLink.url);

      logPaymentClient(openResult.method === 'WebApp.openLink' ? '[MAX_EXTERNAL_LINK]' : '[MAX_EXTERNAL_LINK_FALLBACK]', {
        userId: currentUserId,
        adId: pendingPaymentLink.adId,
        paymentId: pendingPaymentLink.paymentId,
        platform: openResult.platform,
        method: openResult.method,
        reason: openResult.reason,
        retry: true
      });

      if (!openResult.opened) {
        throw new Error(`External payment opener returned false: ${openResult.reason ?? 'unknown'}`);
      }

      logPaymentClient('[PAYMENT_NAVIGATION]', {
        userId: currentUserId,
        adId: pendingPaymentLink.adId,
        paymentId: pendingPaymentLink.paymentId,
        target: 'yookassa',
        platform: openResult.platform,
        method: openResult.method,
        opened: openResult.opened,
        retry: true
      });

      logPaymentClient('[PAYMENT_OPEN_SUCCESS]', {
        userId: currentUserId,
        adId: pendingPaymentLink.adId,
        paymentId: pendingPaymentLink.paymentId,
        platform: openResult.platform,
        method: openResult.method,
        opened: openResult.opened,
        retry: true
      });

      setSubmitError(null);
    } catch (error) {
      logPaymentClient('[PAYMENT_OPEN_ERROR]', {
        stage: 'open_retry',
        userId: currentUserId,
        adId: pendingPaymentLink.adId,
        paymentId: pendingPaymentLink.paymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      setSubmitError('Не удалось открыть страницу оплаты. Попробуйте ещё раз.');
    }
  };

  const copyPendingPaymentLink = () => {
    if (!pendingPaymentLink) {
      return;
    }

    void navigator.clipboard?.writeText(pendingPaymentLink.url).then(() => {
      setIsPaymentLinkCopied(true);
      window.setTimeout(() => setIsPaymentLinkCopied(false), 2000);
    });
  };

  const submitStatusText = getSubmitStatusText(submitStage, isPaidPlacement);
  const coverMedia = getCoverMedia(photos);
  const pendingPaymentNotice = pendingPaymentLink ? (
    <div aria-live="polite" className="grid gap-3 rounded-panel border border-accent-green/25 bg-accent-greenSoft/80 px-4 py-3 text-sm font-semibold text-text-primary">
      <div>
        <p className="font-black">Оплата создана</p>
        <p className="mt-1 text-text-secondary">Если страница YooKassa не открылась автоматически, откройте оплату кнопкой ниже или скопируйте ссылку.</p>
      </div>
      <a
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-extrabold text-surface-950 shadow-glow transition active:scale-[0.985]"
        href={pendingPaymentLink.url}
        onClick={(event) => {
          event.preventDefault();
          openPendingPayment();
        }}
      >
        <ExternalLink size={18} />
        Открыть страницу оплаты {formatRubAmount(pendingPaymentLink.amount)}
      </a>
      <ActionButton type="button" variant="secondary" icon={<Copy size={18} />} onClick={copyPendingPaymentLink}>
        {isPaymentLinkCopied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </ActionButton>
      <p className="break-all rounded-panel border border-white/10 bg-surface-950/70 px-3 py-2 text-xs font-bold text-text-secondary">
        {pendingPaymentLink.url}
      </p>
    </div>
  ) : null;

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title={kind === 'resume' ? 'Резюме отправлено на модерацию' : 'Объявление отправлено на модерацию'}
          description="После проверки оно появится в ленте."
          action={
            <div className="grid w-full gap-2">
              <Link
                to="/my-ads"
                className="inline-flex min-h-11 items-center justify-center rounded-panel bg-[linear-gradient(135deg,#6ee7b7,#22c55e)] px-3 text-sm font-extrabold text-surface-950 shadow-glow transition active:scale-[0.985]"
              >
                Мои объявления
              </Link>
              <Link
                to="/create"
                className="inline-flex min-h-11 items-center justify-center rounded-panel border border-white/10 bg-surface-800/92 px-3 text-sm font-extrabold text-text-primary transition hover:border-accent-green/45 active:scale-[0.985]"
              >
                Создать ещё
              </Link>
            </div>
          }
        />
      </AppPage>
    );
  }

  if (mode === 'preview') {
    return (
      <AppPage>
        <Link to="/create" className="inline-flex items-center gap-2 text-sm font-extrabold text-text-secondary">
          <ArrowLeft size={17} />
          К выбору типа
        </Link>

        <section className="app-surface app-topline space-y-3 overflow-hidden rounded-panel p-4 app-fade-up">
          <div className="flex h-11 w-11 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green">
            <Eye size={23} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent-green">Предпросмотр</p>
            <h1 className="text-2xl font-black leading-tight text-text-primary">{form.name}</h1>
            <p className="text-sm leading-5 text-text-secondary">
              {getPreviewSubmitDescription(isVacancy, isPaidPlacement, usesBalanceForVacancy, priceLabel)}
            </p>
          </div>
        </section>

        <AdCard
          to="#"
          typeLabel={copy.previewType}
          title={form.name.trim()}
          subtitle={kind === 'resume' ? form.specialty.trim() : null}
          coverImageUrl={coverMedia?.previewUrl ?? coverMedia?.url ?? null}
          coverMimeType={coverMedia?.mimeType}
          location={copy.requiresAddress ? form.address.trim() : undefined}
          price={form.money.trim()}
          category={kind === 'material' || kind === 'tool' ? form.categoryText.trim() || copy.previewCategory : copy.previewCategory}
          description={form.description.trim()}
        />

        <SectionCard title="Контакт">
          <div className="rounded-panel border border-white/10 bg-surface-900/92 p-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Связаться</p>
            <p className="mt-1 text-base font-bold text-text-primary">
              {kind === 'resume' ? (verifiedResumeContact?.maskedValue ?? 'Контакт ожидает подтверждения') : form.contact.trim()}
            </p>
          </div>
        </SectionCard>

        {submitStatusText ? (
          <div aria-live="polite" className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/80 px-4 py-3 text-sm font-semibold text-text-primary">
            {submitStatusText}
          </div>
        ) : null}

        {pendingPaymentNotice}

        <div className="sticky bottom-[calc(86px+env(safe-area-inset-bottom))] z-[130] grid grid-cols-[auto_1fr] gap-2 rounded-panel border border-white/10 bg-surface-950/88 p-2 shadow-[0_-14px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <ActionButton type="button" variant="secondary" disabled={isSubmitting} onClick={() => setMode('form')}>
            Править
          </ActionButton>
          <ActionButton type="button" icon={isPaidPlacement ? <CreditCard size={18} /> : <Send size={18} />} disabled={isSubmitting || isMediaBusy} onClick={submit}>
            {isSubmitting
              ? getSubmitButtonLabel(submitStage, isPaidPlacement)
              : getSubmitActionLabel(isPaidPlacement, priceLabel, usesBalanceForVacancy)}
          </ActionButton>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <Link to="/create" className="inline-flex items-center gap-2 text-sm font-extrabold text-text-secondary">
        <ArrowLeft size={17} />
        К выбору типа
      </Link>

      <section className="app-surface app-topline relative overflow-hidden rounded-panel p-4 app-fade-up">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent-green/12 blur-3xl" />
        <div className="relative space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft text-accent-green shadow-[0_0_28px_rgba(52,211,153,0.14)]">
            <Icon size={23} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent-green">{copy.label}</p>
            <h1 className="max-w-sm text-2xl font-black leading-tight text-text-primary">{copy.title}</h1>
            <p className="max-w-md text-sm leading-5 text-text-secondary">{copy.intro}</p>
          </div>
        </div>
      </section>

      {submitError ? (
        <div aria-live="polite" className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
          {submitError}
        </div>
      ) : null}

      {submitStatusText ? (
        <div aria-live="polite" className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/80 px-4 py-3 text-sm font-semibold text-text-primary">
          {submitStatusText}
        </div>
      ) : null}

      {pendingPaymentNotice}

      <form className="grid gap-3 pb-[calc(8rem+env(safe-area-inset-bottom))]" onSubmit={(event) => event.preventDefault()}>
        {isVacancy ? (
          <p className="text-sm font-semibold text-text-muted">
            Поля со звёздочкой обязательны. Заполните коротко: объявление должно читаться за пару секунд.
          </p>
        ) : null}

        <FormSection title={isVacancy ? 'О вакансии' : 'Главное'}>
          <Input
            label={requiredLabel(copy.nameLabel)}
            placeholder={copy.namePlaceholder}
            value={form.name}
            error={errors.name}
            required
            onChange={(event) => updateField('name', event.target.value)}
          />
          {copy.kind === 'resume' ? (
            <Input
              label="Специальность"
              placeholder="Например: отделочник, электрик, водитель"
              value={form.specialty}
              error={errors.specialty}
              onChange={(event) => updateField('specialty', event.target.value)}
            />
          ) : null}
          {copy.kind === 'material' || copy.kind === 'tool' ? (
            <Input
              label={requiredLabel('Категория')}
              placeholder={copy.kind === 'material' ? 'Например: кирпич, бетон, пиломатериалы' : 'Например: электроинструмент, ручной инструмент'}
              value={form.categoryText}
              error={errors.categoryText}
              required
              onChange={(event) => updateField('categoryText', event.target.value)}
            />
          ) : null}
          <Textarea
            label={requiredLabel(copy.descriptionLabel)}
            placeholder={copy.descriptionPlaceholder}
            value={form.description}
            error={errors.description}
            required
            onChange={(event) => updateField('description', event.target.value)}
          />
        </FormSection>

        <FormSection title="Условия и связь">
          <Input
            label={isMoneyRequired ? requiredLabel(copy.moneyLabel) : copy.moneyLabel}
            placeholder={copy.moneyPlaceholder}
            value={form.money}
            error={errors.money}
            required={isMoneyRequired}
            onChange={(event) => updateField('money', event.target.value)}
          />
          {copy.kind === 'resume' ? (
            <div className="grid gap-3 rounded-panel border border-white/10 bg-surface-900/92 p-3">
              <div>
                <p className="text-sm font-black text-text-primary">Контакт для связи</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Подтверждение доказывает, что контакт был привязан к вашему MAX аккаунту. Номер не передаётся покупателю автоматически.
                </p>
              </div>
              {verifiedResumeContact ? (
                <div className="rounded-panel border border-accent-green/25 bg-accent-greenSoft px-3 py-2">
                  <p className="text-sm font-black text-accent-green">Контакт подтверждён через MAX</p>
                  <p className="mt-1 text-sm text-text-primary">{verifiedResumeContact.maskedValue}</p>
                </div>
              ) : null}
              {errors.contact ? <p className="text-sm font-semibold text-red-100">{errors.contact}</p> : null}
              {contactVerificationNotice ? (
                <p className="rounded-panel border border-white/10 bg-surface-950/60 px-3 py-2 text-sm font-semibold text-text-secondary">
                  {contactVerificationNotice}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <ActionButton
                  type="button"
                  icon={isContactVerificationBusy ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  disabled={isContactVerificationBusy}
                  onClick={() => void verifyResumeContactViaMax()}
                >
                  Подтвердить через MAX
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  icon={<Send size={18} />}
                  disabled={isContactVerificationBusy}
                  onClick={() => void requestResumeContactViaBot()}
                >
                  Через бота
                </ActionButton>
              </div>
            </div>
          ) : (
            <Input
              label={requiredLabel('Контакты')}
              placeholder={copy.contactPlaceholder}
              value={form.contact}
              error={errors.contact}
              required
              onChange={(event) => updateField('contact', event.target.value)}
            />
          )}
          {copy.requiresAddress ? (
            <Input
              label={requiredLabel(copy.addressLabel ?? 'Адрес')}
              placeholder={copy.addressPlaceholder}
              value={form.address}
              error={errors.address}
              required
              onChange={(event) => updateField('address', event.target.value)}
            />
          ) : null}
        </FormSection>

        <FormSection
          title="Медиа"
          description={isVacancy ? 'Добавьте до 8 фото объекта и одно видео. Если файла нет, можно отправить без него.' : 'Добавьте до 8 фото и одно видео. Первое фото станет обложкой.'}
        >
          <PhotoUploader
            photos={photos}
            maxFiles={copy.maxPhotos}
            altText={form.name.trim() || copy.label}
            onPhotosChange={updatePhotos}
            onBusyChange={setIsMediaBusy}
          />
          <div className="flex items-center gap-2 rounded-panel border border-white/10 bg-white/[0.03] px-3 py-3 text-sm leading-5 text-text-secondary">
            <ImagePlus size={18} className="shrink-0 text-accent-green" />
            Первое фото будет обложкой. Можно добавить до 8 фото и одно видео MP4/MOV/WebM. Видео не заменяет фото и не сбрасывает уже добавленные файлы.
          </div>
        </FormSection>

        {isVacancy ? (
          <FormSection title="Публикация вакансии" description="Используйте доступную публикацию или купите пакет для раздела «Вакансии».">
            {isVacancyBalanceLoading ? (
              <div className="rounded-panel border border-white/10 bg-surface-900/92 px-3 py-3 text-sm font-bold text-text-secondary">
                Проверяем баланс публикаций...
              </div>
            ) : null}
            {availableVacancyPublications > 0 ? (
              <div className="grid gap-2">
                <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/70 px-3 py-3 text-sm font-bold leading-5 text-text-secondary">
                  Доступно публикаций: {availableVacancyPublications}
                </div>
                <button
                  type="button"
                  className={`flex min-h-14 items-center justify-between rounded-panel border px-3 text-left transition active:scale-[0.985] ${
                    vacancyFunding === 'use_balance'
                      ? 'border-accent-green/60 bg-accent-greenSoft text-text-primary'
                      : 'border-white/10 bg-surface-900/92 text-text-secondary'
                  }`}
                  onClick={() => setVacancyFunding('use_balance')}
                >
                  <span className="text-sm font-extrabold">Использовать 1 публикацию</span>
                  <span className="text-base font-black text-accent-green">0 руб.</span>
                </button>
                <button
                  type="button"
                  className={`flex min-h-14 items-center justify-between rounded-panel border px-3 text-left transition active:scale-[0.985] ${
                    vacancyFunding === 'buy_package'
                      ? 'border-accent-green/60 bg-accent-greenSoft text-text-primary'
                      : 'border-white/10 bg-surface-900/92 text-text-secondary'
                  }`}
                  onClick={() => setVacancyFunding('buy_package')}
                >
                  <span className="text-sm font-extrabold">Купить ещё публикации</span>
                  <span className="text-base font-black text-accent-green">1 / 3 / 7</span>
                </button>
              </div>
            ) : (
              <div className="rounded-panel border border-white/10 bg-surface-900/92 px-3 py-3 text-sm font-bold text-text-secondary">
                У вас нет доступных публикаций. Выберите пакет.
              </div>
            )}
            {vacancyFunding === 'buy_package' ? (
              <div className="grid gap-2">
                {Object.values(VACANCY_PUBLICATION_PLANS).map((plan) => {
                  const active = selectedPlan === plan.code;

                  return (
                    <button
                      key={plan.code}
                      type="button"
                      className={`flex min-h-14 items-center justify-between rounded-panel border px-3 text-left transition active:scale-[0.985] ${
                        active
                          ? 'border-accent-green/60 bg-accent-greenSoft text-text-primary'
                          : 'border-white/10 bg-surface-900/92 text-text-secondary'
                      }`}
                      onClick={() => setSelectedPlan(plan.code)}
                    >
                      <span className="text-sm font-extrabold">{plan.label}</span>
                      <span className="text-base font-black text-accent-green">{formatRubAmount(plan.amountValue)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/70 px-3 py-3 text-sm font-bold leading-5 text-text-secondary">
                После отправки будет списана 1 публикация. Если модератор отклонит вакансию, публикация вернётся в остаток.
              </div>
            )}
            <div className="flex items-center gap-2 rounded-panel border border-accent-green/25 bg-accent-greenSoft/70 px-3 py-3 text-sm font-bold leading-5 text-text-primary">
              <CreditCard size={18} className="shrink-0 text-accent-green" />
              Добавление фото или видео — +50 руб. к стоимости публикации.
            </div>
            <VacancyPaymentSummary
              selectedPlan={selectedPlan}
              usesBalanceForVacancy={usesBalanceForVacancy}
              mediaFeeRequired={mediaFeeRequired}
              paymentAmount={vacancyPaymentAmount}
            />
          </FormSection>
        ) : null}

        {!isVacancy ? (
          <SectionCard
            title="Перед отправкой"
            description="Мы проверим объявление. После модерации оно появится в нужной ленте."
          >
            <div className="grid gap-2">
              <Fact
                icon={CheckCircle2}
                text={
                  copy.kind === 'resume'
                    ? 'Поля короткие, но важные: имя, специальность, описание и контакт.'
                    : 'Поля короткие, но важные: название, описание, цена и контакт.'
                }
              />
              <Fact icon={CheckCircle2} text="Если нужно, позже можно будет обновить объявление." />
            </div>
          </SectionCard>
        ) : null}

        {isVacancy ? (
          <div className="sticky bottom-[calc(86px+env(safe-area-inset-bottom))] z-[130] grid grid-cols-[auto_1fr] gap-2 rounded-panel border border-white/10 bg-surface-950/90 p-1.5 shadow-[0_-10px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} disabled={isSubmitting || isMediaBusy} onClick={openPreview}>
              Проверить
            </ActionButton>
            <ActionButton type="button" className="min-h-11 rounded-panel" disabled={isSubmitting || isMediaBusy} onClick={submit}>
              {isSubmitting ? <Loader2 className="animate-spin" size={19} /> : isPaidPlacement ? <CreditCard size={19} /> : <Send size={19} />}
              {isSubmitting
                ? getSubmitButtonLabel(submitStage, isPaidPlacement)
                : getSubmitActionLabel(isPaidPlacement, priceLabel, usesBalanceForVacancy)}
            </ActionButton>
          </div>
        ) : (
          <div className="sticky bottom-[calc(86px+env(safe-area-inset-bottom))] z-[130] grid grid-cols-[auto_1fr] gap-2 rounded-panel border border-white/10 bg-surface-950/88 p-1.5 shadow-[0_-14px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} disabled={isSubmitting || isMediaBusy} onClick={openPreview}>
              Проверить
            </ActionButton>
            <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting || isMediaBusy} onClick={submit}>
              {isSubmitting ? getSubmitButtonLabel(submitStage, false) : getSubmitActionLabel(false, priceLabel)}
            </ActionButton>
          </div>
        )}
      </form>
    </AppPage>
  );
}

function VacancyPaymentSummary({
  selectedPlan,
  usesBalanceForVacancy,
  mediaFeeRequired,
  paymentAmount
}: {
  selectedPlan: VacancyPublicationPlanCode;
  usesBalanceForVacancy: boolean;
  mediaFeeRequired: boolean;
  paymentAmount: string;
}) {
  const plan = VACANCY_PUBLICATION_PLANS[selectedPlan];

  return (
    <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/92 px-3 py-3 text-sm leading-5">
      <div className="flex items-center justify-between gap-3 text-text-secondary">
        <span>{usesBalanceForVacancy ? 'Публикация из пакета' : `Пакет: ${plan.label}`}</span>
        <span className="shrink-0 font-black text-text-primary">
          {usesBalanceForVacancy ? '1 С€С‚.' : formatRubAmount(plan.amountValue)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-text-secondary">
        <span>Фото/видео</span>
        <span className="shrink-0 font-black text-text-primary">
          {mediaFeeRequired ? formatRubAmount(VACANCY_MEDIA_FEE_AMOUNT_RUB) : '0 руб.'}
        </span>
      </div>
      <div className="h-px bg-white/10" />
      <div className="flex items-center justify-between gap-3 text-base font-black text-text-primary">
        <span>К оплате</span>
        <span className="shrink-0 text-accent-green">{formatRubAmount(paymentAmount)}</span>
      </div>
    </div>
  );
}

function requiredLabel(label: string): string {
  return `${label} *`;
}

function getSubmitStatusText(stage: SubmitStage, isPaidPlacement: boolean): string | null {
  if (stage === 'uploading') {
    return 'Фотографии загружаются. Пожалуйста, дождитесь завершения загрузки файлов.';
  }

  if (stage === 'creating') {
    return isPaidPlacement ? 'Создаём объявление и готовим оплату...' : 'Отправляем объявление на модерацию...';
  }

  return null;
}

function getSubmitButtonLabel(stage: SubmitStage, isPaidPlacement: boolean): string {
  if (stage === 'uploading') {
    return 'Загружаем фото...';
  }

  return isPaidPlacement ? 'Открываем оплату...' : 'Отправляем...';
}

function getSubmitActionLabel(isPaidPlacement: boolean, priceLabel: string, usesBalanceForVacancy = false): string {
  if (usesBalanceForVacancy && !isPaidPlacement) {
    return 'Отправить на модерацию';
  }

  return isPaidPlacement ? `Оплатить ${priceLabel}` : 'Отправить на модерацию';
}

function getPreviewSubmitDescription(
  isVacancy: boolean,
  isPaidPlacement: boolean,
  usesBalanceForVacancy: boolean,
  priceLabel: string
): string {
  if (!isVacancy) {
    return 'Проверьте, как объявление будет выглядеть в ленте.';
  }

  if (usesBalanceForVacancy && !isPaidPlacement) {
    return 'После отправки вакансия уйдёт на модерацию за 1 публикацию из баланса.';
  }

  return `После отправки откроется оплата ${priceLabel}. После оплаты объявление уйдёт на модерацию.`;
}

function formatRubAmount(amount: string): string {
  const parsed = parseRubAmount(amount);

  if (!Number.isFinite(parsed)) {
    return `${amount} руб.`;
  }

  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(parsed)} руб.`;
}

function parseRubAmount(amount: string): number {
  return Number(amount.replace(',', '.'));
}

function logPaymentClient(label: string, details: Record<string, unknown>): void {
  if (!label.startsWith('[PAYMENT_') && !label.startsWith('[MAX_')) {
    return;
  }

  console.info(label, details);
}

function Fact({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-panel border border-white/8 bg-surface-900/92 p-3 text-sm leading-5 text-text-secondary">
      <Icon size={17} className="mt-0.5 shrink-0 text-accent-green" />
      <span>{text}</span>
    </div>
  );
}

function submitErrorScope(kind: CreateAdKind) {
  if (kind === 'vacancy') {
    return 'vacancy_submit';
  }

  if (kind === 'resume') {
    return 'resume_submit';
  }

  if (kind === 'equipment') {
    return 'equipment_submit';
  }

  return 'product_submit';
}
