import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
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
import type { CreateEquipmentPayload } from '../features/equipment/create-equipment.types.js';
import type { CreateProductPayload, ProductType } from '../features/products/create-product.types.js';
import type { CreateResumePayload } from '../features/resumes/create-resume.types.js';
import type { CreateVacancyPayload, UploadedPhoto } from '../features/vacancies/create-vacancy.types.js';
import { getCoverMedia, normalizeAdMedia } from '../features/uploads/upload-flow.js';
import { apiClient } from '../shared/api/client.js';
import { getUserFacingError } from '../shared/api/user-facing.js';
import { ActionButton } from '../shared/ui/ActionButton.js';
import { AdCard } from '../shared/ui/AdCard.js';
import { AppPage } from '../shared/ui/AppPage.js';
import { EmptyState } from '../shared/ui/EmptyState.js';
import { FormSection } from '../shared/ui/FormSection.js';
import { Input } from '../shared/ui/Input.js';
import { PhotoUploader } from '../shared/ui/PhotoUploader.js';
import { SectionCard } from '../shared/ui/SectionCard.js';
import { Textarea } from '../shared/ui/Textarea.js';

export type CreateAdKind = 'vacancy' | 'resume' | 'equipment' | ProductType;

interface CreateFormState {
  name: string;
  specialty: string;
  description: string;
  money: string;
  contact: string;
  address: string;
}

type FormErrors = Partial<Record<keyof CreateFormState | 'form', string>>;
type SubmitStage = 'idle' | 'uploading' | 'creating';

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
    moneyPlaceholder: 'Например: от 120 000 ₽',
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
    descriptionPlaceholder: 'Опыт, навыки, чем занимаетесь и какую работу ищете.',
    moneyLabel: 'Желаемая зарплата',
    moneyPlaceholder: 'Например: 100 000 ₽',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    requiresAddress: false,
    maxPhotos: 8
  },
  equipment: {
    kind: 'equipment',
    title: 'Строительная техника',
    label: 'Техника',
    intro: 'Добавьте технику для аренды или продажи: название, цену, место и контакт.',
    icon: Truck,
    previewType: 'Техника',
    previewCategory: 'Строительная техника',
    nameLabel: 'Название техники',
    namePlaceholder: 'Например: экскаватор-погрузчик JCB 3CX',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Состояние, условия аренды или продажи, важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 15 000 ₽ за смену',
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
    descriptionPlaceholder: 'Количество, состояние, доставка, самовывоз и важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 25 000 ₽',
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
    intro: 'Добавьте инструмент для продажи или аренды: название, цена, место и контакт.',
    icon: Wrench,
    previewType: 'Инструмент',
    previewCategory: 'Инструменты',
    nameLabel: 'Название',
    namePlaceholder: 'Например: перфоратор Bosch SDS-plus',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Состояние, комплект, аренда или продажа, важные детали.',
    moneyLabel: 'Цена',
    moneyPlaceholder: 'Например: 2 000 ₽ в сутки',
    contactPlaceholder: 'Телефон, MAX или другой контакт',
    addressLabel: 'Адрес',
    addressPlaceholder: 'Где находится инструмент',
    requiresAddress: true,
    maxPhotos: 8
  }
};

const initialForm: CreateFormState = {
  name: '',
  specialty: '',
  description: '',
  money: '',
  contact: '',
  address: ''
};

export function SimpleCreateAdPage({ kind }: { kind: CreateAdKind }) {
  const copy = createCopy[kind];
  const Icon = copy.icon;
  const isVacancy = kind === 'vacancy';
  const accessToken = useAppStore((state) => state.accessToken);
  const draftKey = `rabst24:create:${kind}:simple`;
  const draftPhotosKey = `${draftKey}:photos`;
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<CreateFormState>(() => loadDraft(draftKey));
  const [photos, setPhotos] = useState<UploadedPhoto[]>(() => normalizeAdMedia(loadDraftPhotos(draftPhotosKey), copy.maxPhotos, 1));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form]);

  useEffect(() => {
    window.localStorage.setItem(draftPhotosKey, JSON.stringify(photos));
  }, [draftPhotosKey, photos]);

  const updatePhotos = (nextPhotos: UploadedPhoto[]) => {
    const normalizedPhotos = normalizeAdMedia(nextPhotos, copy.maxPhotos, 1);

    setPhotos(normalizedPhotos);
    setSubmitError(null);

    try {
      window.localStorage.setItem(draftPhotosKey, JSON.stringify(normalizedPhotos));
    } catch {
      // Local draft persistence is a convenience; upload state still lives in React.
    }
  };

  const updateField = <TKey extends keyof CreateFormState>(key: TKey, value: CreateFormState[TKey]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
    setSubmitError(null);
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

    if (form.description.trim().length < minDescriptionLength) {
      nextErrors.description = 'Добавьте короткое описание.';
    }

    if (!form.money.trim()) {
      nextErrors.money = copy.kind === 'vacancy' ? 'Укажите зарплату или диапазон.' : copy.moneyLabel === 'Цена' ? 'Укажите цену.' : 'Укажите зарплату.';
    }

    if (form.contact.trim().length < 3) {
      nextErrors.contact = 'Укажите контакт для связи.';
    }

    if (copy.requiresAddress && form.address.trim().length < 2) {
      nextErrors.address = copy.kind === 'vacancy' ? 'Укажите город, район или адрес объекта.' : 'Укажите адрес или район.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setSubmitError('Проверьте выделенные поля и попробуйте ещё раз.');
      setMode('form');
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

  const submit = async () => {
    if (isSubmitting) {
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

    try {
      setIsSubmitting(true);
      setSubmitStage('creating');
      setSubmitError(null);

      await submitByKind(kind, form, photos);

      window.localStorage.removeItem(draftKey);
      window.localStorage.removeItem(draftPhotosKey);
      setForm(initialForm);
      setPhotos([]);
      setMode('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(getUserFacingError(error, submitErrorScope(kind)));
      setMode('form');
    } finally {
      setIsSubmitting(false);
      setSubmitStage('idle');
    }
  };

  const submitStatusText = getSubmitStatusText(submitStage);
  const coverMedia = getCoverMedia(photos);

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title="Объявление отправлено на модерацию"
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
              Проверьте, как объявление будет выглядеть в ленте.
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
          category={copy.previewCategory}
          description={form.description.trim()}
        />

        <SectionCard title="Контакт">
          <div className="rounded-panel border border-white/10 bg-surface-900/92 p-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted">Связаться</p>
            <p className="mt-1 text-base font-bold text-text-primary">{form.contact.trim()}</p>
          </div>
        </SectionCard>

        {submitStatusText ? (
          <div aria-live="polite" className="rounded-panel border border-accent-green/20 bg-accent-greenSoft/80 px-4 py-3 text-sm font-semibold text-text-primary">
            {submitStatusText}
          </div>
        ) : null}

        <div className="sticky bottom-[88px] z-10 grid grid-cols-[auto_1fr] gap-2 rounded-panel border border-white/10 bg-surface-950/88 p-2 shadow-[0_-14px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <ActionButton type="button" variant="secondary" disabled={isSubmitting} onClick={() => setMode('form')}>
            Править
          </ActionButton>
          <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting || isMediaBusy} onClick={submit}>
            {isSubmitting ? getSubmitButtonLabel(submitStage) : 'Отправить'}
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

      <form className="grid gap-4 pb-32" onSubmit={(event) => event.preventDefault()}>
        {isVacancy ? (
          <p className="text-sm font-semibold text-text-muted">
            Поля со звёздочкой обязательны. Заполните коротко: объявление должно читаться за пару секунд.
          </p>
        ) : null}

        <FormSection
          title="Фото"
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
            label={requiredLabel(copy.moneyLabel)}
            placeholder={copy.moneyPlaceholder}
            value={form.money}
            error={errors.money}
            required
            onChange={(event) => updateField('money', event.target.value)}
          />
          <Input
            label={requiredLabel('Контакты')}
            placeholder={copy.contactPlaceholder}
            value={form.contact}
            error={errors.contact}
            required
            onChange={(event) => updateField('contact', event.target.value)}
          />
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

        {isVacancy ? (
          <div className="rounded-panel border border-accent-green/18 bg-accent-greenSoft/70 px-4 py-3 text-sm leading-6 text-text-secondary">
            После отправки объявление уйдёт на модерацию. После проверки оно появится в ленте вакансий.
          </div>
        ) : (
          <SectionCard title="Перед отправкой" description="Мы проверим объявление. После модерации оно появится в нужной ленте.">
            <div className="grid gap-2">
              <Fact icon={CheckCircle2} text="Поля короткие, но важные: название, описание, цена и контакт." />
              <Fact icon={CheckCircle2} text="Если нужно, позже можно будет обновить объявление." />
            </div>
          </SectionCard>
        )}

        {isVacancy ? (
          <div className="sticky bottom-[88px] z-20 rounded-panel border border-white/10 bg-surface-950/90 p-2 shadow-[0_-16px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <ActionButton type="button" className="min-h-11 w-full rounded-panel" disabled={isSubmitting || isMediaBusy} onClick={submit}>
              {isSubmitting ? <Loader2 className="animate-spin" size={19} /> : <Send size={19} />}
              {isSubmitting ? getSubmitButtonLabel(submitStage) : 'Отправить на модерацию'}
            </ActionButton>
          </div>
        ) : (
          <div className="sticky bottom-[88px] z-10 grid grid-cols-[auto_1fr] gap-2 rounded-panel border border-white/10 bg-surface-950/88 p-2 shadow-[0_-14px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} disabled={isSubmitting || isMediaBusy} onClick={openPreview}>
              Проверить
            </ActionButton>
            <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting || isMediaBusy} onClick={submit}>
              {isSubmitting ? getSubmitButtonLabel(submitStage) : 'На модерацию'}
            </ActionButton>
          </div>
        )}
      </form>
    </AppPage>
  );
}

function requiredLabel(label: string): string {
  return `${label} *`;
}

function getSubmitStatusText(stage: SubmitStage): string | null {
  if (stage === 'uploading') {
    return 'Фотографии загружаются. Пожалуйста, дождитесь завершения загрузки файлов.';
  }

  if (stage === 'creating') {
    return 'Отправляем объявление на модерацию...';
  }

  return null;
}

function getSubmitButtonLabel(stage: SubmitStage): string {
  if (stage === 'uploading') {
    return 'Загружаем фото...';
  }

  return 'Отправляем...';
}

function Fact({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-panel border border-white/8 bg-surface-900/92 p-3 text-sm leading-5 text-text-secondary">
      <Icon size={17} className="mt-0.5 shrink-0 text-accent-green" />
      <span>{text}</span>
    </div>
  );
}

async function submitByKind(kind: CreateAdKind, form: CreateFormState, uploadedPhotos: UploadedPhoto[]) {
  if (kind === 'vacancy') {
    await apiClient.createVacancy(buildVacancyPayload(form, uploadedPhotos));
    return;
  }

  if (kind === 'resume') {
    await apiClient.createResume(buildResumePayload(form, uploadedPhotos));
    return;
  }

  if (kind === 'equipment') {
    await apiClient.createEquipment(buildEquipmentPayload(form, uploadedPhotos));
    return;
  }

  const payload = buildProductPayload(form, uploadedPhotos);
  if (kind === 'material') {
    await apiClient.createMaterial(payload);
    return;
  }

  await apiClient.createTool(payload);
}

function buildVacancyPayload(form: CreateFormState, uploadedPhotos: UploadedPhoto[]): CreateVacancyPayload {
  return {
    title: form.name.trim(),
    companyName: 'Работодатель',
    city: 'Не указан',
    address: form.address.trim(),
    districtText: undefined,
    categoryText: form.name.trim(),
    schedule: 'По договоренности',
    workPeriods: [],
    workPeriodDescription: undefined,
    experience: 'Обсуждается',
    salaryText: form.money.trim(),
    salaryFrom: parseMoney(form.money),
    salaryTo: undefined,
    salaryPeriod: undefined,
    isSalaryNegotiable: false,
    description: form.description.trim(),
    requirements: [],
    responsibilities: [],
    benefits: [],
    metroStations: [],
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

function buildResumePayload(form: CreateFormState, uploadedPhotos: UploadedPhoto[]): CreateResumePayload {
  return {
    name: form.name.trim(),
    profession: form.specialty.trim(),
    description: form.description.trim(),
    experienceText: form.description.trim(),
    expectedSalary: parseMoney(form.money),
    districtText: undefined,
    address: undefined,
    categoryText: 'Резюме',
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

function buildEquipmentPayload(form: CreateFormState, uploadedPhotos: UploadedPhoto[]): CreateEquipmentPayload {
  return {
    title: form.name.trim(),
    categoryText: 'Строительная техника',
    equipmentGroupText: form.name.trim(),
    description: appendMoney(form.description, form.money),
    districtText: undefined,
    address: form.address.trim(),
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

function buildProductPayload(form: CreateFormState, uploadedPhotos: UploadedPhoto[]): CreateProductPayload {
  return {
    title: form.name.trim(),
    categoryText: undefined,
    description: form.description.trim(),
    priceAmount: parseMoney(form.money),
    districtText: undefined,
    address: form.address.trim(),
    contacts: [buildContact(form.contact)],
    photos: mapPhotos(uploadedPhotos)
  };
}

function buildContact(value: string) {
  return {
    type: 'PHONE' as const,
    label: 'Контакты',
    value: value.trim(),
    isPreferred: true
  };
}

function mapPhotos(photos: UploadedPhoto[]) {
  return normalizeAdMedia(photos, 8, 1).map((photo) => ({
    storageKey: photo.storageKey,
    url: photo.url,
    previewUrl: photo.previewUrl ?? undefined,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    altText: photo.altText ?? undefined
  }));
}

function parseMoney(value: string): number | undefined {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function appendMoney(description: string, money: string): string {
  const cleanDescription = description.trim();
  const cleanMoney = money.trim();
  return cleanMoney ? `${cleanDescription}\n\nЦена: ${cleanMoney}` : cleanDescription;
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

function loadDraft(draftKey: string): CreateFormState {
  try {
    const raw = window.localStorage.getItem(draftKey);

    if (!raw) {
      return initialForm;
    }

    return {
      ...initialForm,
      ...JSON.parse(raw)
    } as CreateFormState;
  } catch {
    return initialForm;
  }
}

function loadDraftPhotos(draftPhotosKey: string): UploadedPhoto[] {
  try {
    const raw = window.localStorage.getItem(draftPhotosKey);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isUploadedPhoto);
  } catch {
    return [];
  }
}

function isUploadedPhoto(value: unknown): value is UploadedPhoto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const photo = value as Record<string, unknown>;

  return (
    typeof photo.storageKey === 'string' &&
    typeof photo.url === 'string' &&
    typeof photo.mimeType === 'string' &&
    typeof photo.sizeBytes === 'number'
  );
}
