import { useEffect, useState } from 'react';
import { BarChart3, Bell, Copy, CreditCard, Edit3, Eye, FileSearch, FileUser, Gift, Heart, ListChecks, RefreshCw, Save, Share2, ShieldCheck, Upload, Users, X } from 'lucide-react';
import { useAppStore } from '../app/store/app-store.js';
import type { EditableProfile, UserPaymentOperation, UserProfilePayload } from '../features/ads/ad.types.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { Input } from '../shared/ui/Input.js';
import { LinkButton } from '../shared/ui/LinkButton.js';
import { LoadingState } from '../shared/ui/LoadingState.js';
import { ProfileHeader } from '../shared/ui/ProfileHeader.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { Select } from '../shared/ui/Select.js';
import { Textarea } from '../shared/ui/Textarea.js';
import { TileCard } from '../shared/ui/TileCard.js';

type ProfileFormState = {
  displayName: string;
  profileType: 'person' | 'company';
  companyName: string;
  city: string;
  districtText: string;
  about: string;
  avatarUrl: string;
  phone: string;
  email: string;
  website: string;
  maxContact: string;
  specialization: string;
  experience: string;
  companyInfo: string;
  registrationDetails: string;
  privacy: EditableProfile['privacy'];
};

type VerifiedContactItem = {
  id: string;
  maskedValue: string;
  source: string;
  status: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  activeConsent: { id: string } | null;
};

export function ProfilePage() {
  const accessToken = useAppStore((state) => state.accessToken);
  const notificationsEnabled = useAppStore((state) => state.features.USER_NOTIFICATIONS_ENABLED);
  const savedSearchesEnabled = useAppStore((state) => state.features.SAVED_SEARCHES_ENABLED);
  const applicationsEnabled = useAppStore((state) => state.features.APPLICATIONS_ENABLED);
  const contactVerificationEnabled = useAppStore((state) => state.features.CONTACT_VERIFICATION_ENABLED);
  const financeDashboardEnabled = useAppStore((state) => state.features.FINANCE_DASHBOARD_ENABLED);
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [verifiedContacts, setVerifiedContacts] = useState<VerifiedContactItem[]>([]);
  const [verifiedContactsStatus, setVerifiedContactsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [verifiedContactsReloadKey, setVerifiedContactsReloadKey] = useState(0);
  const [isReferralCopied, setIsReferralCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

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

        setProfile(normalizeProfilePayload(response.data));
        setForm(createProfileForm(normalizeProfilePayload(response.data)));
        setStatus('ready');
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getUserFacingError(requestError, 'profile_load'));
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!accessToken || !contactVerificationEnabled) {
      setVerifiedContacts([]);
      setVerifiedContactsStatus('idle');
      return;
    }

    let active = true;
    setVerifiedContactsStatus('loading');

    apiClient
      .listVerifiedContacts()
      .then((response) => {
        if (!active) {
          return;
        }

        setVerifiedContacts(response.data);
        setVerifiedContactsStatus('ready');
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setVerifiedContacts([]);
        setVerifiedContactsStatus('error');
      });

    return () => {
      active = false;
    };
  }, [accessToken, contactVerificationEnabled, verifiedContactsReloadKey]);

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
  const referralInviteUrl = profile.referral.inviteUrl || `https://max.ru/id694201221191_1_bot?startapp=${encodeURIComponent(profile.referral.code)}`;
  const copyReferralLink = () => {
    const markCopied = () => {
      setIsReferralCopied(true);
      window.setTimeout(() => setIsReferralCopied(false), 1800);
    };

    if (navigator.clipboard) {
      void navigator.clipboard.writeText(referralInviteUrl).then(markCopied);
      return;
    }

    markCopied();
  };
  const shareReferralLink = () => {
    if (!navigator.share) {
      copyReferralLink();
      return;
    }

    void navigator.share({
      title: 'Rabst24',
      text: 'Открой строительную биржу Rabst24 в MAX',
      url: referralInviteUrl
    });
  };
  const updateField = <TField extends keyof ProfileFormState>(field: TField, value: ProfileFormState[TField]) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setFormError(null);
    setSaveNotice(null);
  };
  const updatePrivacy = (field: keyof ProfileFormState['privacy'], value: boolean) => {
    setForm((current) =>
      current
        ? {
            ...current,
            privacy: {
              ...current.privacy,
              [field]: value
            }
          }
        : current
    );
    setFormError(null);
    setSaveNotice(null);
  };
  const uploadAvatar = async (fileList: FileList | null) => {
    const file = fileList?.[0];

    if (!file || !form) {
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Загрузите JPG, PNG или WebP.');
      return;
    }

    setIsUploadingAvatar(true);
    setFormError(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await apiClient.uploadPhoto({
        fileName: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        dataUrl,
        altText: 'Аватар профиля'
      });
      updateField('avatarUrl', response.data.url);
    } catch (uploadError) {
      setFormError(getUserFacingError(uploadError, 'photo_upload'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };
  const saveProfile = async () => {
    if (!form || isSavingProfile) {
      return;
    }

    const validationError = validateProfileForm(form);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSavingProfile(true);
    setFormError(null);
    setSaveNotice(null);

    try {
      const [userResponse, profileResponse] = await Promise.all([
        apiClient.updateMe({ displayName: form.displayName.trim() || undefined }),
        apiClient.updateMyProfile({
          profileType: form.profileType,
          companyName: emptyToNull(form.companyName),
          city: emptyToNull(form.city),
          districtText: emptyToNull(form.districtText),
          about: emptyToNull(form.about),
          avatarUrl: emptyToNull(form.avatarUrl),
          phone: emptyToNull(form.phone),
          email: emptyToNull(form.email),
          website: emptyToNull(form.website),
          maxContact: emptyToNull(form.maxContact),
          specialization: emptyToNull(form.specialization),
          experience: emptyToNull(form.experience),
          companyInfo: emptyToNull(form.companyInfo),
          registrationDetails: emptyToNull(form.registrationDetails),
          privacy: form.privacy
        })
      ]);
      const nextProfile = normalizeProfilePayload({
        ...profile,
        displayName: userResponse.data.displayName,
        profile: profileResponse.data
      });
      setProfile(nextProfile);
      setForm(createProfileForm(nextProfile));
      setEditing(false);
      setPreviewing(false);
      setSaveNotice('Профиль сохранён.');
    } catch (saveError) {
      setFormError(getUserFacingError(saveError, 'profile_load'));
    } finally {
      setIsSavingProfile(false);
    }
  };
  const name = primaryName || profile.maxUsername || 'Профиль';

  return (
    <AppPage>
      <ProfileHeader
        name={name}
        subtitle={profile.profile?.city ? `${profile.profile.city} в MAX` : 'Ваш кабинет в MAX'}
        avatarUrl={profile.profile?.avatarUrl ?? undefined}
        stats={[
          { label: 'объявления', value: String(profile.stats.adsTotal) },
          { label: 'избранное', value: String(profile.stats.favoritesTotal) },
          { label: 'публикации', value: String(profile.stats.vacancyPublicationBalance.remaining) }
        ]}
      />

      {error ? (
        <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm text-accent-green">
          {error}
        </div>
      ) : null}

      {saveNotice ? (
        <div className="rounded-panel border border-accent-green/20 bg-accent-greenSoft px-4 py-3 text-sm font-semibold text-accent-green">
          {saveNotice}
        </div>
      ) : null}

      <SectionCard>
        <div className="grid gap-2">
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <BalanceChip label="куп." value={profile.stats.vacancyPublicationBalance.purchased} />
            <BalanceChip label="исп." value={profile.stats.vacancyPublicationBalance.used} />
            <BalanceChip label="ост." value={profile.stats.vacancyPublicationBalance.remaining} />
            <BalanceChip label="бонус" value={profile.stats.vacancyPublicationBalance.bonus} />
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <BalanceChip label="пригл." value={profile.referral.referredTotal} />
            <BalanceChip label="оплат." value={profile.referral.rewardedTotal} />
            <BalanceChip label="реф." value={profile.referral.bonusPublications} />
          </div>
          <div className="rounded-panel border border-white/10 bg-surface-900/92 px-2.5 py-2">
            <p className="text-[11px] font-extrabold uppercase text-text-muted">Реферальная ссылка</p>
            <p className="mt-1 line-clamp-2 break-all text-[11px] font-bold leading-4 text-text-secondary">{referralInviteUrl}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton icon={isReferralCopied ? <Gift size={17} /> : <Copy size={17} />} onClick={copyReferralLink}>
              {isReferralCopied ? 'Скопировано' : 'Копировать'}
            </ActionButton>
            <ActionButton variant="secondary" icon={<Share2 size={17} />} onClick={shareReferralLink}>
              Поделиться
            </ActionButton>
          </div>
        </div>
      </SectionCard>

      {form ? (
        <SectionCard title="Профиль" description="Имя, описание, контакты и публичность профиля.">
          <div className="grid gap-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <ActionButton type="button" icon={<Edit3 size={18} />} onClick={() => setEditing((value) => !value)}>
                {editing ? 'Закрыть' : 'Редактировать'}
              </ActionButton>
              <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} onClick={() => setPreviewing((value) => !value)}>
                Preview
              </ActionButton>
              {editing ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  icon={<X size={18} />}
                  onClick={() => {
                    setForm(createProfileForm(profile));
                    setEditing(false);
                    setPreviewing(false);
                    setFormError(null);
                  }}
                >
                  Сброс
                </ActionButton>
              ) : null}
            </div>

            {formError ? (
              <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
                {formError}
              </p>
            ) : null}

            {editing ? (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Отображаемое имя" value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} />
                  <Select
                    label="Тип профиля"
                    value={form.profileType}
                    options={[
                      { value: 'person', label: 'Человек' },
                      { value: 'company', label: 'Компания' }
                    ]}
                    onChange={(event) => updateField('profileType', event.target.value as 'person' | 'company')}
                  />
                  <Input label="Компания" value={form.companyName} onChange={(event) => updateField('companyName', event.target.value)} />
                  <Input label="Город" value={form.city} onChange={(event) => updateField('city', event.target.value)} />
                  <Input label="Район" value={form.districtText} onChange={(event) => updateField('districtText', event.target.value)} />
                  <Input label="Специализация" value={form.specialization} onChange={(event) => updateField('specialization', event.target.value)} />
                  <Input label="Опыт" value={form.experience} onChange={(event) => updateField('experience', event.target.value)} />
                  <Input label="Сайт" value={form.website} onChange={(event) => updateField('website', event.target.value)} />
                </div>

                <div className="grid gap-3">
                  <Textarea label="О себе / о компании" value={form.about} onChange={(event) => updateField('about', event.target.value)} />
                  <Textarea label="Информация о компании" value={form.companyInfo} onChange={(event) => updateField('companyInfo', event.target.value)} />
                  <Textarea
                    label="Регистрационные данные"
                    value={form.registrationDetails}
                    onChange={(event) => updateField('registrationDetails', event.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Телефон" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                  <Input label="Email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
                  <Input label="MAX contact" value={form.maxContact} onChange={(event) => updateField('maxContact', event.target.value)} />
                  <Input label="Avatar/logo URL" value={form.avatarUrl} onChange={(event) => updateField('avatarUrl', event.target.value)} />
                </div>

                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-panel border border-white/10 bg-surface-900/92 px-3 py-3 text-sm font-extrabold text-text-primary transition hover:border-accent-green/35">
                  <Upload size={18} />
                  {isUploadingAvatar ? 'Загрузка...' : 'Загрузить avatar/logo'}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isUploadingAvatar}
                    onChange={(event) => void uploadAvatar(event.target.files)}
                  />
                </label>

                <div className="grid gap-2 rounded-panel border border-white/10 bg-surface-900/92 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">Privacy</p>
                  <PrivacyToggle label="Показывать телефон" checked={form.privacy.showPhone} onChange={(value) => updatePrivacy('showPhone', value)} />
                  <PrivacyToggle label="Показывать email" checked={form.privacy.showEmail} onChange={(value) => updatePrivacy('showEmail', value)} />
                  <PrivacyToggle label="Показывать сайт" checked={form.privacy.showWebsite} onChange={(value) => updatePrivacy('showWebsite', value)} />
                  <PrivacyToggle label="Показывать MAX contact" checked={form.privacy.showMaxContact} onChange={(value) => updatePrivacy('showMaxContact', value)} />
                  <PrivacyToggle
                    label="Разрешить ссылку на профиль из резюме"
                    checked={form.privacy.allowResumePublicProfile}
                    onChange={(value) => updatePrivacy('allowResumePublicProfile', value)}
                  />
                </div>

                <ActionButton type="button" icon={<Save size={18} />} disabled={isSavingProfile || isUploadingAvatar} onClick={() => void saveProfile()}>
                  {isSavingProfile ? 'Сохраняем...' : 'Сохранить'}
                </ActionButton>
              </div>
            ) : null}

            {previewing ? <ProfilePreview form={form} registeredAt={profile.createdAt} /> : null}
          </div>
        </SectionCard>
      ) : null}

      {contactVerificationEnabled ? (
        <VerifiedContactsSection
          items={verifiedContacts}
          status={verifiedContactsStatus}
          onReload={() => setVerifiedContactsReloadKey((value) => value + 1)}
        />
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
        {profile.role === 'admin' && financeDashboardEnabled ? (
          <TileCard
            to="/finance"
            title="Финансы"
            description="Выручка, возвраты, net revenue и CSV export"
            icon={<BarChart3 size={23} />}
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
        {applicationsEnabled ? (
        <TileCard
          to="/applications"
          title="Мои отклики"
          description="Вакансии, на которые вы откликнулись, и статусы работодателя"
          icon={<FileSearch size={23} />}
          tone="green"
        />
        ) : null}
        {notificationsEnabled ? (
          <TileCard
            to="/notifications"
            title="Уведомления"
            description="Статусы объявлений, платежи и важные события"
            icon={<Bell size={23} />}
            tone="green"
          />
        ) : null}
        {savedSearchesEnabled ? (
          <TileCard
            to="/saved-searches"
            title="Сохранённые поиски"
            description="Подписки на новые объявления по фильтрам"
            icon={<FileSearch size={23} />}
            tone="green"
          />
        ) : null}
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
      </section>

      <SectionCard title="О профиле" description="Информация, которая помогает объявлениям выглядеть доверительно.">
        <div className="grid gap-2 text-sm leading-6 text-text-secondary">
          <p>В приложении с {formatDate(profile.createdAt)}</p>
          {profile.profile?.districtText ? <p>Район: {profile.profile.districtText}</p> : null}
          {profile.profile?.about ? <p>{profile.profile.about}</p> : null}
        </div>
      </SectionCard>

      <PaymentHistorySection />

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

function PaymentHistorySection() {
  const [items, setItems] = useState<UserPaymentOperation[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    apiClient
      .listPaymentHistory({ perPage: 10 })
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.data.filter((item) => !item.test));
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
  }, [reloadKey]);

  return (
    <SectionCard title="История операций" description="Платежи, возвраты и связанные объявления без секретных платёжных данных.">
      <div className="grid gap-3">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? (
          <div className="grid gap-2">
            <p className="rounded-panel border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
              {error}
            </p>
            <ActionButton type="button" variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setReloadKey((value) => value + 1)}>
              Обновить
            </ActionButton>
          </div>
        ) : null}
        {status === 'ready' && items.length === 0 ? <p className="text-sm text-text-secondary">Операций пока нет.</p> : null}
        {status === 'ready' && items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item) => (
              <article key={item.id} className="rounded-panel border border-white/8 bg-surface-900/92 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-text-primary">{item.purposeLabel}</p>
                    <p className="mt-1 text-xs text-text-muted">{formatDate(item.createdAt)} · {item.yooKassaPaymentIdMasked}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-text-primary">{item.amount} {item.currency}</p>
                    {Number(item.refundAmount) > 0 ? <p className="text-xs font-bold text-red-100">refund {item.refundAmount}</p> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">{paymentStatusLabel(item.status)}</span>
                  {item.packagePublications > 0 ? <span className="rounded-full border border-accent-green/25 px-2 py-1 text-xs font-bold text-accent-green">+{item.packagePublications} публикаций</span> : null}
                  {item.includesMediaFee ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">media fee</span> : null}
                  {item.isResumeContactUnlock ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">contact unlock</span> : null}
                  {item.isPromotion ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-text-secondary">promotion</span> : null}
                  {item.test ? <span className="rounded-full border border-amber-300/25 px-2 py-1 text-xs font-bold text-amber-100">test</span> : null}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <p className="min-w-0 truncate text-xs text-text-muted">{item.ad.title}</p>
                  <LinkButton to={getAdPath(item.ad)} variant="secondary" icon={<CreditCard size={16} />}>
                    Открыть объявление
                  </LinkButton>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function VerifiedContactsSection({
  items,
  status,
  onReload
}: {
  items: VerifiedContactItem[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  onReload: () => void;
}) {
  return (
    <SectionCard title="Подтверждённые контакты">
      <div className="grid gap-3">
        <div className="flex items-start gap-3 rounded-panel border border-white/10 bg-surface-900/92 p-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent-green" />
          <div className="min-w-0">
            <p className="text-sm font-black text-text-primary">MAX-проверка для резюме</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Для платной связи используется безопасный режим: покупатель получает возможность отправить запрос автору, сырой номер не раскрывается автоматически.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Статус</p>
          <ActionButton type="button" variant="secondary" icon={<RefreshCw size={16} />} onClick={onReload}>
            Обновить
          </ActionButton>
        </div>

        {status === 'loading' ? <p className="text-sm text-text-secondary">Проверяем контакты...</p> : null}
        {status === 'error' ? <p className="text-sm text-red-100">Не удалось загрузить подтверждённые контакты.</p> : null}
        {status !== 'loading' && status !== 'error' && items.length === 0 ? (
          <p className="text-sm leading-6 text-text-secondary">
            Подтверждённых контактов пока нет. При создании резюме нажмите «Подтвердить через MAX» или используйте кнопку через бота.
          </p>
        ) : null}

        {items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-panel border border-white/10 bg-surface-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-black text-text-primary">{item.maskedValue}</p>
                  <span className="shrink-0 rounded-full border border-accent-green/25 px-2 py-1 text-xs font-bold text-accent-green">
                    {contactStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs leading-5 text-text-secondary">
                  <p>Источник: {contactSourceLabel(item.source)}</p>
                  {item.verifiedAt ? <p>Проверен: {formatDate(item.verifiedAt)}</p> : null}
                  {item.expiresAt ? <p>Действует до: {formatDate(item.expiresAt)}</p> : null}
                  <p>{item.activeConsent ? 'Согласие на организацию связи активно.' : 'Согласие для резюме не найдено.'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

function normalizeProfilePayload(profile: UserProfilePayload): UserProfilePayload {
  const partial = profile as Partial<UserProfilePayload>;
  const stats = partial.stats;
  const balance = stats?.vacancyPublicationBalance;
  const referral = partial.referral;
  const rawProfile = profile.profile;

  return {
    ...profile,
    profile: rawProfile
      ? {
          ...rawProfile,
          profileType: rawProfile.profileType ?? 'person',
          companyName: rawProfile.companyName ?? null,
          phone: rawProfile.phone ?? null,
          email: rawProfile.email ?? null,
          website: rawProfile.website ?? null,
          maxContact: rawProfile.maxContact ?? null,
          specialization: rawProfile.specialization ?? null,
          experience: rawProfile.experience ?? null,
          companyInfo: rawProfile.companyInfo ?? null,
          registrationDetails: rawProfile.registrationDetails ?? null,
          privacy: {
            showPhone: rawProfile.privacy?.showPhone ?? false,
            showEmail: rawProfile.privacy?.showEmail ?? false,
            showWebsite: rawProfile.privacy?.showWebsite ?? true,
            showMaxContact: rawProfile.privacy?.showMaxContact ?? true,
            allowResumePublicProfile: rawProfile.privacy?.allowResumePublicProfile ?? true
          }
        }
      : rawProfile,
    stats: {
      adsTotal: stats?.adsTotal ?? 0,
      favoritesTotal: stats?.favoritesTotal ?? 0,
      reviewsTotal: stats?.reviewsTotal ?? 0,
      adsByStatus: stats?.adsByStatus ?? {},
      adsByType: stats?.adsByType ?? {},
      vacancyPublicationBalance: {
        purchased: balance?.purchased ?? 0,
        bonus: balance?.bonus ?? 0,
        used: balance?.used ?? 0,
        remaining: balance?.remaining ?? 0
      }
    },
    referral: {
      code: referral?.code ?? '',
      inviteUrl: referral?.inviteUrl ?? '',
      referredTotal: referral?.referredTotal ?? 0,
      rewardedTotal: referral?.rewardedTotal ?? 0,
      bonusPublications: referral?.bonusPublications ?? 0
    }
  };
}

function BalanceChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-panel border border-white/10 bg-surface-900/92 px-1.5 py-2">
      <p className="text-base font-black leading-none text-text-primary">{value}</p>
      <p className="mt-1 truncate text-[10px] font-bold leading-3 text-text-muted">{label}</p>
    </div>
  );
}

function createProfileForm(profile: UserProfilePayload): ProfileFormState {
  const profileData = profile.profile;

  return {
    displayName: profile.displayName ?? [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    profileType: profileData?.profileType ?? 'person',
    companyName: profileData?.companyName ?? '',
    city: profileData?.city ?? '',
    districtText: profileData?.districtText ?? '',
    about: profileData?.about ?? '',
    avatarUrl: profileData?.avatarUrl ?? '',
    phone: profileData?.phone ?? '',
    email: profileData?.email ?? '',
    website: profileData?.website ?? '',
    maxContact: profileData?.maxContact ?? (profile.maxUsername ? `@${profile.maxUsername}` : ''),
    specialization: profileData?.specialization ?? '',
    experience: profileData?.experience ?? '',
    companyInfo: profileData?.companyInfo ?? '',
    registrationDetails: profileData?.registrationDetails ?? '',
    privacy: {
      showPhone: profileData?.privacy?.showPhone ?? false,
      showEmail: profileData?.privacy?.showEmail ?? false,
      showWebsite: profileData?.privacy?.showWebsite ?? true,
      showMaxContact: profileData?.privacy?.showMaxContact ?? true,
      allowResumePublicProfile: profileData?.privacy?.allowResumePublicProfile ?? true
    }
  };
}

function ProfilePreview({ form, registeredAt }: { form: ProfileFormState; registeredAt: string }) {
  const publicName = form.profileType === 'company' && form.companyName.trim() ? form.companyName : form.displayName || 'Профиль';
  const contacts = [
    form.privacy.showPhone && form.phone ? `Телефон: ${form.phone}` : null,
    form.privacy.showEmail && form.email ? `Email: ${form.email}` : null,
    form.privacy.showWebsite && form.website ? `Сайт: ${form.website}` : null,
    form.privacy.showMaxContact && form.maxContact ? `MAX: ${form.maxContact}` : null
  ].filter(Boolean);

  return (
    <div className="rounded-panel border border-white/10 bg-surface-950/50 p-4">
      <div className="flex items-start gap-3">
        {form.avatarUrl ? (
          <img src={form.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full border border-accent-green/35 object-cover" />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-full border border-accent-green/35 bg-accent-greenSoft" />
        )}
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black text-text-primary">{publicName}</h3>
          <p className="text-sm text-text-secondary">
            {[form.city, form.districtText, form.specialization].filter(Boolean).join(' · ') || 'Публичный профиль'}
          </p>
          <p className="mt-1 text-xs text-text-muted">В приложении с {formatDate(registeredAt)}</p>
        </div>
      </div>
      {form.about ? <p className="mt-3 text-sm leading-6 text-text-secondary">{form.about}</p> : null}
      {contacts.length ? (
        <div className="mt-3 grid gap-1 text-sm font-semibold text-text-primary">
          {contacts.map((contact) => (
            <p key={contact}>{contact}</p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">Публичные контакты скрыты.</p>
      )}
    </div>
  );
}

function PrivacyToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-panel border border-white/8 bg-surface-950/50 px-3 py-2 text-sm font-semibold text-text-primary">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function validateProfileForm(form: ProfileFormState): string | null {
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return 'Проверьте email.';
  }

  if (form.website && !/^https?:\/\/.+/i.test(form.website)) {
    return 'Сайт должен начинаться с http:// или https://.';
  }

  if (form.avatarUrl && !/^https?:\/\/.+/i.test(form.avatarUrl)) {
    return 'Avatar/logo URL должен начинаться с http:// или https://.';
  }

  return null;
}

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function getAdPath(ad: UserPaymentOperation['ad']): string {
  if (ad.type === 'vacancy') {
    return `/vacancies/${ad.id}`;
  }

  if (ad.type === 'resume') {
    return `/resumes/${ad.id}`;
  }

  if (ad.type === 'material') {
    return `/materials/${ad.id}`;
  }

  if (ad.type === 'tool') {
    return `/tools/${ad.id}`;
  }

  return `/equipment/${ad.id}`;
}

function paymentStatusLabel(status: UserPaymentOperation['status']): string {
  const labels: Record<UserPaymentOperation['status'], string> = {
    PENDING: 'ожидает',
    SUCCEEDED: 'успешно',
    CANCELED: 'отменён',
    REFUND_PENDING: 'возврат в обработке',
    PARTIALLY_REFUNDED: 'частичный возврат',
    REFUNDED: 'возврат',
    FAILED: 'ошибка'
  };

  return labels[status];
}

function contactStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'ожидает',
    VERIFIED: 'подтверждён',
    EXPIRED: 'истёк',
    REVOKED: 'отозван',
    DISPUTED: 'спор'
  };

  return labels[status] ?? status.toLowerCase();
}

function contactSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    MAX_MINI_APP: 'MAX Mini App',
    MAX_BOT: 'MAX Bot',
    SMS_OTP: 'SMS',
    ADMIN_VERIFIED: 'Администратор'
  };

  return labels[source] ?? source;
}
