import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, ImagePlus, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  contactTypeOptions,
  createVacancyPayloadSchema,
  salaryPeriodOptions,
  type CreateVacancyPayload,
  type UploadedPhoto
} from '../features/vacancies/create-vacancy.types.js';
import { uploadVacancyPhotos } from '../features/vacancies/upload-flow.js';
import { useAppStore } from '../app/store/app-store.js';
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
import { Select } from '../shared/ui/Select.js';
import { StatChip } from '../shared/ui/StatChip.js';
import { SuggestionInput } from '../shared/ui/SuggestionInput.js';
import { Textarea } from '../shared/ui/Textarea.js';

const DRAFT_KEY = 'rabst24:create-vacancy:draft';
const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

interface VacancyFormState {
  title: string;
  companyName: string;
  city: string;
  address: string;
  districtText: string;
  categoryText: string;
  schedule: string;
  workPeriods: string[];
  workPeriodDescription: string;
  experience: string;
  salaryText: string;
  salaryFrom: string;
  salaryTo: string;
  salaryPeriod: '' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'PROJECT';
  isSalaryNegotiable: boolean;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  metroStations: Array<{
    name: string;
    lineName: string;
    walkingMinutes: string;
  }>;
  contacts: Array<{
    type: 'MAX' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'OTHER';
    label: string;
    value: string;
    isPreferred: boolean;
  }>;
}

type FieldErrors = Partial<Record<keyof CreateVacancyPayload | 'form', string[]>>;

const initialForm: VacancyFormState = {
  title: '',
  companyName: '',
  city: '',
  address: '',
  districtText: '',
  categoryText: '',
  schedule: '',
  workPeriods: [''],
  workPeriodDescription: '',
  experience: '',
  salaryText: '',
  salaryFrom: '',
  salaryTo: '',
  salaryPeriod: 'MONTH',
  isSalaryNegotiable: false,
  description: '',
  requirements: [''],
  responsibilities: [''],
  benefits: [''],
  metroStations: [],
  contacts: [
    {
      type: 'PHONE',
      label: 'Телефон',
      value: '',
      isPreferred: true
    }
  ]
};

export function CreateVacancyPage() {
  const accessToken = useAppStore((state) => state.accessToken);
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<VacancyFormState>(() => loadDraft());
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const previewCover = useMemo(() => (photos[0] ? URL.createObjectURL(photos[0]) : null), [photos]);
  const hasValidationErrors = Object.keys(errors).length > 0 && Boolean(submitError);

  useEffect(
    () => () => {
      if (previewCover) {
        URL.revokeObjectURL(previewCover);
      }
    },
    [previewCover]
  );

  const updateField = <TKey extends keyof VacancyFormState>(key: TKey, value: VacancyFormState[TKey]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const buildPayload = (uploadedPhotos: UploadedPhoto[] = []): CreateVacancyPayload => ({
    title: form.title.trim(),
    companyName: form.companyName.trim(),
    city: form.city.trim(),
    address: emptyToUndefined(form.address),
    districtText: emptyToUndefined(form.districtText),
    categoryText: form.categoryText.trim(),
    schedule: form.schedule.trim(),
    workPeriods: cleanTextArray(form.workPeriods),
    workPeriodDescription: emptyToUndefined(form.workPeriodDescription),
    experience: form.experience.trim(),
    salaryText: emptyToUndefined(form.salaryText),
    salaryFrom: toNumber(form.salaryFrom),
    salaryTo: toNumber(form.salaryTo),
    salaryPeriod: form.salaryPeriod || undefined,
    isSalaryNegotiable: form.isSalaryNegotiable,
    description: form.description.trim(),
    requirements: cleanTextArray(form.requirements),
    responsibilities: cleanTextArray(form.responsibilities),
    benefits: cleanTextArray(form.benefits),
    metroStations: form.metroStations
      .filter((station) => station.name.trim())
      .map((station) => ({
        name: station.name.trim(),
        lineName: emptyToUndefined(station.lineName),
        walkingMinutes: toNumber(station.walkingMinutes)
      })),
    contacts: form.contacts
      .filter((contact) => contact.value.trim())
      .map((contact, index) => ({
        type: contact.type,
        label: emptyToUndefined(contact.label),
        value: contact.value.trim(),
        isPreferred: index === 0 || contact.isPreferred
      })),
    photos: uploadedPhotos.map((photo) => ({
      storageKey: photo.storageKey,
      url: photo.url,
      previewUrl: photo.previewUrl ?? undefined,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      altText: photo.altText ?? undefined
    }))
  });

  const validate = (): CreateVacancyPayload | null => {
    const result = createVacancyPayloadSchema.safeParse(buildPayload());

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors as FieldErrors);
      setSubmitError('Заполните обязательные поля и попробуйте ещё раз.');
      setMode('form');
      return null;
    }

    setErrors({});
    setSubmitError(null);
    return result.data;
  };

  const openPreview = () => {
    if (validate()) {
      setMode('preview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submit = async () => {
    const validPayload = validate();

    if (!validPayload) {
      return;
    }

    if (!accessToken) {
      setSubmitError('Чтобы отправить вакансию, откройте mini app заново из MAX.');
      setMode('form');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const uploadedPhotos = await uploadVacancyPhotos(photos, validPayload.title);
      await apiClient.createVacancy(buildPayload(uploadedPhotos));

      window.localStorage.removeItem(DRAFT_KEY);
      setMode('success');
    } catch (error) {
      setSubmitError(getUserFacingError(error, 'vacancy_submit'));
      setMode('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title="Вакансия отправлена"
          description="Мы проверим объявление и подготовим его к публикации. Его можно найти в разделе «Мои объявления»."
          action={
            <div className="grid w-full gap-2">
              <Link
                to="/my-ads"
                className="inline-flex min-h-12 items-center justify-center rounded-panel bg-accent-green px-4 text-base font-semibold text-surface-950 shadow-glow"
              >
                Перейти к моим объявлениям
              </Link>
            </div>
          }
        />
      </AppPage>
    );
  }

  if (mode === 'preview') {
    const payload = buildPayload();

    return (
      <AppPage>
        <div className="space-y-2 app-fade-up">
          <p className="text-sm font-semibold uppercase text-accent-green">Предпросмотр</p>
          <h1 className="text-3xl font-black text-text-primary">{payload.title}</h1>
          <p className="text-base leading-6 text-text-secondary">
            Так вакансия будет выглядеть для соискателей. Проверьте текст, условия и контакты перед отправкой.
          </p>
        </div>

        <AdCard
          to="#"
          typeLabel="Вакансия"
          title={payload.title}
          subtitle={payload.companyName}
          coverImageUrl={previewCover}
          location={payload.address ?? payload.districtText ?? payload.city}
          price={payload.salaryText || formatSalaryPreview(payload)}
          category={payload.categoryText}
          description={payload.description}
          chips={[
            { key: 'schedule', value: payload.schedule },
            { key: 'experience', value: payload.experience }
          ]}
        />

        <SectionCard title="Главное" description="Короткая сводка по вакансии.">
          <PreviewFacts payload={payload} />
        </SectionCard>

        <PreviewList title="Что важно от кандидата" items={payload.requirements} />
        <PreviewList title="Что нужно делать" items={payload.responsibilities} />
        <PreviewList title="Что получит кандидат" items={payload.benefits} />

        <SectionCard title="Контакты">
          <div className="grid gap-2">
            {payload.contacts.map((contact) => (
              <div key={`${contact.type}-${contact.value}`} className="rounded-panel border border-white/8 bg-surface-900/90 p-3">
                <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type}</p>
                <p className="text-sm text-text-secondary">{contact.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="sticky bottom-20 z-10 grid grid-cols-[auto_1fr] gap-2">
          <ActionButton type="button" variant="secondary" onClick={() => setMode('form')}>
            Вернуться к форме
          </ActionButton>
          <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? 'Отправляем...' : 'Отправить'}
          </ActionButton>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <div className="space-y-2 app-fade-up">
        <p className="text-sm font-semibold uppercase text-accent-green">Создание</p>
        <h1 className="text-3xl font-black text-text-primary">Новая вакансия</h1>
        <p className="text-base leading-6 text-text-secondary">
          Соберите понятную карточку вакансии, проверьте предпросмотр и отправьте объявление без лишних шагов.
        </p>
      </div>

      {submitError ? (
        <div
          className={`rounded-panel border px-4 py-3 text-sm ${
            hasValidationErrors
              ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
              : 'border-red-400/25 bg-red-500/10 text-red-100'
          }`}
        >
          {submitError}
        </div>
      ) : null}

      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <FormSection title="Фотографии" description="До 8 изображений. Первое фото станет обложкой карточки.">
          <PhotoUploader files={photos} maxFiles={8} onFilesChange={setPhotos} />
          {!photos.length ? (
            <div className="flex items-center gap-2 rounded-panel border border-white/8 bg-white/[0.02] px-3 py-3 text-sm text-text-secondary">
              <ImagePlus size={18} className="text-accent-green" />
              Добавьте фото, если хотите сделать карточку заметнее.
            </div>
          ) : null}
        </FormSection>

        <FormSection title="Основное">
          <Input
            label="Название вакансии"
            placeholder="Сварщик НАКС"
            value={form.title}
            error={firstError(errors.title)}
            onChange={(event) => updateField('title', event.target.value)}
          />
          <Input
            label="Компания или контактное лицо"
            placeholder="Компания или имя для связи"
            value={form.companyName}
            error={firstError(errors.companyName)}
            onChange={(event) => updateField('companyName', event.target.value)}
          />
          <SuggestionInput
            label="Категория"
            placeholder="Строительство, водитель, производство"
            value={form.categoryText}
            error={firstError(errors.categoryText)}
            loadSuggestions={loadCategorySuggestions}
            onChange={(event) => updateField('categoryText', event.target.value)}
          />
        </FormSection>

        <FormSection title="Локация">
          <Input
            label="Город"
            placeholder="Москва"
            value={form.city}
            error={firstError(errors.city)}
            onChange={(event) => updateField('city', event.target.value)}
          />
          <SuggestionInput
            label="Район"
            placeholder="ЮВАО, Подольск, центр"
            value={form.districtText}
            loadSuggestions={loadDistrictSuggestions}
            onChange={(event) => updateField('districtText', event.target.value)}
          />
          <Input
            label="Адрес или ориентир"
            placeholder="Улица, дом или место встречи"
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
          />
          <MetroEditor value={form.metroStations} onChange={(metroStations) => updateField('metroStations', metroStations)} />
        </FormSection>

        <FormSection title="Условия работы">
          <Input
            label="График"
            placeholder="5/2, 2/2, вахта 30/30"
            value={form.schedule}
            error={firstError(errors.schedule)}
            onChange={(event) => updateField('schedule', event.target.value)}
          />
          <ArrayEditor
            label="Рабочие периоды"
            placeholder="Например: смена 08:00-20:00"
            value={form.workPeriods}
            onChange={(workPeriods) => updateField('workPeriods', workPeriods)}
          />
          <Textarea
            label="Пояснение по графику"
            placeholder="Если режим работы нестандартный, коротко опишите его здесь."
            value={form.workPeriodDescription}
            onChange={(event) => updateField('workPeriodDescription', event.target.value)}
          />
          <Input
            label="Опыт"
            placeholder="Без опыта, от 1 года, НАКС обязательно"
            value={form.experience}
            error={firstError(errors.experience)}
            onChange={(event) => updateField('experience', event.target.value)}
          />
        </FormSection>

        <FormSection title="Зарплата">
          <Input
            label="Короткий текст по оплате"
            placeholder="от 160 000 ₽, выплаты два раза в месяц"
            value={form.salaryText}
            onChange={(event) => updateField('salaryText', event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="От"
              placeholder="160000"
              inputMode="numeric"
              value={form.salaryFrom}
              onChange={(event) => updateField('salaryFrom', event.target.value)}
            />
            <Input
              label="До"
              placeholder="220000"
              inputMode="numeric"
              value={form.salaryTo}
              onChange={(event) => updateField('salaryTo', event.target.value)}
            />
          </div>
          <Select
            label="Период"
            value={form.salaryPeriod}
            options={salaryPeriodOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => updateField('salaryPeriod', event.target.value as VacancyFormState['salaryPeriod'])}
          />
          <label className="flex items-center gap-3 rounded-panel border border-white/8 bg-surface-900/90 p-3 text-sm font-semibold text-text-secondary">
            <input
              type="checkbox"
              checked={form.isSalaryNegotiable}
              onChange={(event) => updateField('isSalaryNegotiable', event.target.checked)}
            />
            Уровень оплаты можно обсудить
          </label>
        </FormSection>

        <FormSection title="Описание">
          <Textarea
            label="О вакансии"
            placeholder="Коротко расскажите про объект, задачи, условия и кого вы ищете."
            value={form.description}
            error={firstError(errors.description)}
            onChange={(event) => updateField('description', event.target.value)}
          />
          <ArrayEditor
            label="Требования"
            placeholder="Опыт сварки от 1 года"
            value={form.requirements}
            onChange={(requirements) => updateField('requirements', requirements)}
          />
          <ArrayEditor
            label="Обязанности"
            placeholder="Сварка металлоконструкций"
            value={form.responsibilities}
            onChange={(responsibilities) => updateField('responsibilities', responsibilities)}
          />
          <ArrayEditor
            label="Плюсы для кандидата"
            placeholder="Проживание предоставляется"
            value={form.benefits}
            onChange={(benefits) => updateField('benefits', benefits)}
          />
        </FormSection>

        <FormSection title="Контакты">
          <ContactsEditor value={form.contacts} onChange={(contacts) => updateField('contacts', contacts)} />
          {firstError(errors.contacts) ? <p className="text-sm text-red-200">{firstError(errors.contacts)}</p> : null}
        </FormSection>

        <SectionCard title="Черновик" description="Данные сохраняются на этом устройстве автоматически.">
          <div className="flex flex-wrap gap-2">
            <StatChip label="Автосохранение" tone="green" icon={<Save size={15} />} />
            <StatChip label={`${photos.length}/8 фото`} />
          </div>
        </SectionCard>

        <div className="sticky bottom-20 z-10 grid grid-cols-[auto_1fr] gap-2">
          <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} onClick={openPreview}>
            Предпросмотр
          </ActionButton>
          <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? 'Отправляем...' : 'Отправить'}
          </ActionButton>
        </div>
      </form>
    </AppPage>
  );
}

function ArrayEditor({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold text-text-secondary">{label}</span>
      {value.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            aria-label={`${label} ${index + 1}`}
            label={`${index + 1}`}
            placeholder={placeholder}
            value={item}
            onChange={(event) => onChange(value.map((current, itemIndex) => (itemIndex === index ? event.target.value : current)))}
          />
          <ActionButton
            type="button"
            variant="secondary"
            aria-label="Удалить"
            icon={<Trash2 size={17} />}
            onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <ActionButton type="button" variant="secondary" icon={<Plus size={18} />} onClick={() => onChange([...value, ''])}>
        Добавить пункт
      </ActionButton>
    </div>
  );
}

function MetroEditor({
  value,
  onChange
}: {
  value: VacancyFormState['metroStations'];
  onChange: (value: VacancyFormState['metroStations']) => void;
}) {
  return (
    <div className="grid gap-3">
      <span className="text-sm font-semibold text-text-secondary">Ближайшее метро</span>
      {value.map((station, index) => (
        <div key={index} className="grid gap-2 rounded-panel border border-white/8 bg-surface-900/90 p-3">
          <Input
            label="Станция"
            placeholder="Павелецкая"
            value={station.name}
            onChange={(event) => updateArrayItem(value, onChange, index, { name: event.target.value })}
          />
          <Input
            label="Линия"
            placeholder="Замоскворецкая"
            value={station.lineName}
            onChange={(event) => updateArrayItem(value, onChange, index, { lineName: event.target.value })}
          />
          <Input
            label="Минут пешком"
            placeholder="7"
            inputMode="numeric"
            value={station.walkingMinutes}
            onChange={(event) => updateArrayItem(value, onChange, index, { walkingMinutes: event.target.value })}
          />
          <ActionButton type="button" variant="secondary" icon={<Trash2 size={17} />} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
            Удалить станцию
          </ActionButton>
        </div>
      ))}
      <ActionButton
        type="button"
        variant="secondary"
        icon={<Plus size={18} />}
        onClick={() => onChange([...value, { name: '', lineName: '', walkingMinutes: '' }])}
      >
        Добавить метро
      </ActionButton>
    </div>
  );
}

function ContactsEditor({
  value,
  onChange
}: {
  value: VacancyFormState['contacts'];
  onChange: (value: VacancyFormState['contacts']) => void;
}) {
  return (
    <div className="grid gap-3">
      {value.map((contact, index) => (
        <div key={index} className="grid gap-3 rounded-panel border border-white/8 bg-surface-900/90 p-3">
          <Select
            label="Тип"
            value={contact.type}
            options={contactTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => updateArrayItem(value, onChange, index, { type: event.target.value as VacancyFormState['contacts'][number]['type'] })}
          />
          <Input
            label="Подпись"
            placeholder="HR, диспетчер, сайт"
            value={contact.label}
            onChange={(event) => updateArrayItem(value, onChange, index, { label: event.target.value })}
          />
          <Input
            label="Контакт"
            placeholder="@username, телефон или email"
            value={contact.value}
            onChange={(event) => updateArrayItem(value, onChange, index, { value: event.target.value })}
          />
          <ActionButton type="button" variant="secondary" icon={<Trash2 size={17} />} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
            Удалить контакт
          </ActionButton>
        </div>
      ))}
      <ActionButton
        type="button"
        variant="secondary"
        icon={<Plus size={18} />}
        onClick={() => onChange([...value, { type: 'PHONE', label: '', value: '', isPreferred: false }])}
      >
        Добавить контакт
      </ActionButton>
    </div>
  );
}

function PreviewFacts({ payload }: { payload: CreateVacancyPayload }) {
  const facts = [
    ['Город', payload.city],
    ['Адрес', payload.address],
    ['График', payload.schedule],
    ['Опыт', payload.experience],
    ['Категория', payload.categoryText],
    ['Рабочие периоды', payload.workPeriods.join(', ')],
    ['Метро', payload.metroStations.map((station) => station.name).join(', ')]
  ].filter(([, value]) => value);

  return (
    <div className="grid gap-2">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-panel border border-white/8 bg-surface-900/90 p-3">
          <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <SectionCard title={title}>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-text-secondary">
            <CheckCircle2 size={17} className="mt-1 shrink-0 text-accent-green" />
            {item}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function firstError(errors?: string[]) {
  return errors?.[0];
}

function updateArrayItem<TItem>(
  value: TItem[],
  onChange: (value: TItem[]) => void,
  index: number,
  patch: Partial<TItem>
): void {
  onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function cleanTextArray(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const number = Number(trimmed.replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function formatSalaryPreview(payload: CreateVacancyPayload): string | undefined {
  if (payload.salaryFrom && payload.salaryTo) {
    return `${payload.salaryFrom}-${payload.salaryTo} ₽`;
  }

  if (payload.salaryFrom) {
    return `от ${payload.salaryFrom} ₽`;
  }

  if (payload.salaryTo) {
    return `до ${payload.salaryTo} ₽`;
  }

  return payload.isSalaryNegotiable ? 'по договорённости' : undefined;
}

function loadDraft(): VacancyFormState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);

    if (!raw) {
      return initialForm;
    }

    return {
      ...initialForm,
      ...JSON.parse(raw)
    } as VacancyFormState;
  } catch {
    return initialForm;
  }
}
