import { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import {
  contactTypeOptions,
  createResumePayloadSchema,
  type CreateResumePayload
} from '../features/resumes/create-resume.types.js';
import { uploadAdPhotos } from '../features/uploads/upload-flow.js';
import { apiClient } from '../shared/api/client.js';
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

const DRAFT_KEY = 'rabst24:create-resume:draft';
const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

interface ResumeFormState {
  name: string;
  profession: string;
  description: string;
  experienceText: string;
  districtText: string;
  address: string;
  categoryText: string;
  contacts: Array<{
    type: 'MAX' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'OTHER';
    label: string;
    value: string;
    isPreferred: boolean;
  }>;
}

type FieldErrors = Partial<Record<keyof CreateResumePayload | 'form', string[]>>;

const initialForm: ResumeFormState = {
  name: '',
  profession: '',
  description: '',
  experienceText: '',
  districtText: '',
  address: '',
  categoryText: '',
  contacts: [
    {
      type: 'PHONE',
      label: 'Телефон',
      value: '',
      isPreferred: true
    }
  ]
};

export function CreateResumePage() {
  const accessToken = useAppStore((state) => state.accessToken);
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<ResumeFormState>(() => loadDraft());
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdAdId, setCreatedAdId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const previewCover = useMemo(() => (photos[0] ? URL.createObjectURL(photos[0]) : null), [photos]);

  useEffect(
    () => () => {
      if (previewCover) {
        URL.revokeObjectURL(previewCover);
      }
    },
    [previewCover]
  );

  const updateField = <TKey extends keyof ResumeFormState>(key: TKey, value: ResumeFormState[TKey]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const buildPayload = (uploadedPhotos: CreateResumePayload['photos'] = []): CreateResumePayload => ({
    name: form.name.trim(),
    profession: form.profession.trim(),
    description: form.description.trim(),
    experienceText: form.experienceText.trim(),
    districtText: emptyToUndefined(form.districtText),
    address: emptyToUndefined(form.address),
    categoryText: emptyToUndefined(form.categoryText),
    contacts: form.contacts
      .filter((contact) => contact.value.trim())
      .map((contact, index) => ({
        type: contact.type,
        label: emptyToUndefined(contact.label),
        value: contact.value.trim(),
        isPreferred: index === 0 || contact.isPreferred
      })),
    photos: uploadedPhotos
  });

  const validate = (): CreateResumePayload | null => {
    const result = createResumePayloadSchema.safeParse(buildPayload());

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors as FieldErrors);
      setSubmitError('Проверьте обязательные поля и попробуйте еще раз.');
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
      setSubmitError('Откройте mini app из MAX, чтобы отправить резюме на модерацию.');
      setMode('form');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const uploadedPhotos = await uploadAdPhotos(photos, validPayload.name, 1);
      const response = await apiClient.createResume(buildPayload(uploadedPhotos.map((photo) => ({
        storageKey: photo.storageKey,
        url: photo.url,
        previewUrl: photo.previewUrl ?? undefined,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        altText: photo.altText ?? undefined
      }))));

      window.localStorage.removeItem(DRAFT_KEY);
      setCreatedAdId(response.data.id);
      setMode('success');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось отправить резюме');
      setMode('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title="Резюме отправлено на модерацию"
          description="После одобрения оно появится в приложении для работодателей и заказчиков."
          action={
            <div className="grid w-full gap-2">
              <Link
                to="/my-ads"
                className="inline-flex min-h-12 items-center justify-center rounded-panel bg-accent-green px-4 text-base font-semibold text-surface-950 shadow-glow"
              >
                Мои объявления
              </Link>
              {createdAdId ? <p className="text-xs text-text-muted">ID объявления: {createdAdId}</p> : null}
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
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase text-accent-green">Предпросмотр</p>
          <h1 className="text-3xl font-black text-text-primary">{payload.name}</h1>
          <p className="text-base leading-6 text-text-secondary">
            Проверьте, как резюме будет выглядеть после модерации.
          </p>
        </div>

        <AdCard
          to="#"
          typeLabel="Резюме"
          title={payload.name}
          subtitle={payload.profession}
          coverImageUrl={previewCover}
          location={payload.address ?? payload.districtText}
          category={payload.categoryText}
          description={payload.description}
          chips={[{ key: 'experience', value: payload.experienceText }]}
        />

        <SectionCard title="О себе">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{payload.description}</p>
        </SectionCard>

        <SectionCard title="Опыт">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{payload.experienceText}</p>
        </SectionCard>

        <SectionCard title="Контакты">
          <div className="grid gap-2">
            {payload.contacts.map((contact) => (
              <div key={`${contact.type}-${contact.value}`} className="rounded-panel bg-surface-900 p-3">
                <p className="text-sm font-semibold text-text-primary">{contact.label ?? contact.type}</p>
                <p className="text-sm text-text-secondary">{contact.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="sticky bottom-20 z-10 grid grid-cols-[auto_1fr] gap-2">
          <ActionButton type="button" variant="secondary" onClick={() => setMode('form')}>
            Править
          </ActionButton>
          <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? 'Отправляем...' : 'На модерацию'}
          </ActionButton>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage>
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase text-accent-green">Создание</p>
        <h1 className="text-3xl font-black text-text-primary">Новое резюме</h1>
        <p className="text-base leading-6 text-text-secondary">
          Расскажите о себе, опыте и способах связи. Резюме станет видимым после модерации.
        </p>
      </div>

      {submitError ? (
        <div className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {submitError}
        </div>
      ) : null}

      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <FormSection title="Фото" description="Одно фото для карточки резюме. Можно оставить пустым.">
          <PhotoUploader files={photos} maxFiles={1} onFilesChange={setPhotos} />
        </FormSection>

        <FormSection title="Профиль">
          <Input label="Имя" placeholder="Иван Иванов" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
          <FieldError errors={errors.name} />
          <Input label="Профессия" placeholder="Водитель погрузчика" value={form.profession} onChange={(event) => updateField('profession', event.target.value)} />
          <FieldError errors={errors.profession} />
          <Textarea
            label="Описание о себе"
            placeholder="Кратко расскажите о себе, сильных сторонах и желаемой работе."
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
          />
          <FieldError errors={errors.description} />
        </FormSection>

        <FormSection title="Опыт и направление">
          <Textarea
            label="Опыт / короткое описание опыта"
            placeholder="3 года на складе, права категории B/C, опыт с техникой..."
            value={form.experienceText}
            onChange={(event) => updateField('experienceText', event.target.value)}
          />
          <FieldError errors={errors.experienceText} />
          <SuggestionInput label="Категория / направление" placeholder="Склад, стройка, логистика" value={form.categoryText} loadSuggestions={loadCategorySuggestions} onChange={(event) => updateField('categoryText', event.target.value)} />
        </FormSection>

        <FormSection title="Локация">
          <SuggestionInput label="Район" placeholder="ЮВАО, Подольск, рядом с метро" value={form.districtText} loadSuggestions={loadDistrictSuggestions} onChange={(event) => updateField('districtText', event.target.value)} />
          <Input label="Адрес / ориентир" placeholder="Опционально" value={form.address} onChange={(event) => updateField('address', event.target.value)} />
        </FormSection>

        <FormSection title="Контакты">
          <ContactsEditor value={form.contacts} onChange={(contacts) => updateField('contacts', contacts)} />
          <FieldError errors={errors.contacts} />
        </FormSection>

        <SectionCard title="Черновик" description="Форма сохраняется на этом устройстве автоматически.">
          <div className="flex flex-wrap gap-2">
            <StatChip label="автосохранение" tone="green" icon={<Save size={15} />} />
            <StatChip label={photos.length ? 'фото добавлено' : 'без фото'} />
          </div>
        </SectionCard>

        <div className="sticky bottom-20 z-10 grid grid-cols-[auto_1fr] gap-2">
          <ActionButton type="button" variant="secondary" icon={<Eye size={18} />} onClick={openPreview}>
            Предпросмотр
          </ActionButton>
          <ActionButton type="button" icon={<Send size={18} />} disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? 'Отправляем...' : 'На модерацию'}
          </ActionButton>
        </div>
      </form>
    </AppPage>
  );
}

function ContactsEditor({
  value,
  onChange
}: {
  value: ResumeFormState['contacts'];
  onChange: (value: ResumeFormState['contacts']) => void;
}) {
  return (
    <div className="grid gap-3">
      {value.map((contact, index) => (
        <div key={index} className="grid gap-3 rounded-panel border border-line bg-surface-900 p-3">
          <Select
            label="Тип"
            value={contact.type}
            options={contactTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) =>
              updateArrayItem(value, onChange, index, {
                type: event.target.value as ResumeFormState['contacts'][number]['type']
              })
            }
          />
          <Input
            label="Подпись"
            placeholder="HR, личный номер, MAX"
            value={contact.label}
            onChange={(event) => updateArrayItem(value, onChange, index, { label: event.target.value })}
          />
          <Input
            label="Значение"
            placeholder="@username или телефон"
            value={contact.value}
            onChange={(event) => updateArrayItem(value, onChange, index, { value: event.target.value })}
          />
          <ActionButton
            type="button"
            variant="secondary"
            icon={<Trash2 size={17} />}
            onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
          >
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

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) {
    return null;
  }

  return <p className="-mt-2 text-sm font-semibold text-red-200">{errors[0]}</p>;
}

function updateArrayItem<TItem>(
  value: TItem[],
  onChange: (value: TItem[]) => void,
  index: number,
  patch: Partial<TItem>
): void {
  onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function loadDraft(): ResumeFormState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);

    if (!raw) {
      return initialForm;
    }

    return {
      ...initialForm,
      ...JSON.parse(raw)
    } as ResumeFormState;
  } catch {
    return initialForm;
  }
}
