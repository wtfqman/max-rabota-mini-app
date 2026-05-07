import { useEffect, useMemo, useState } from 'react';
import { Eye, Plus, Save, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import {
  contactTypeOptions,
  createEquipmentPayloadSchema,
  type CreateEquipmentPayload
} from '../features/equipment/create-equipment.types.js';
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

const DRAFT_KEY = 'rabst24:create-equipment:draft';
const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

interface EquipmentFormState {
  title: string;
  categoryText: string;
  equipmentGroupText: string;
  description: string;
  districtText: string;
  address: string;
  contacts: Array<{
    type: 'MAX' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'OTHER';
    label: string;
    value: string;
    isPreferred: boolean;
  }>;
}

type FieldErrors = Partial<Record<keyof CreateEquipmentPayload | 'form', string[]>>;

const initialForm: EquipmentFormState = {
  title: '',
  categoryText: '',
  equipmentGroupText: '',
  description: '',
  districtText: '',
  address: '',
  contacts: [
    {
      type: 'PHONE',
      label: 'Телефон',
      value: '',
      isPreferred: true
    }
  ]
};

export function CreateEquipmentPage() {
  const accessToken = useAppStore((state) => state.accessToken);
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<EquipmentFormState>(() => loadDraft());
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

  const updateField = <TKey extends keyof EquipmentFormState>(key: TKey, value: EquipmentFormState[TKey]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const buildPayload = (uploadedPhotos: CreateEquipmentPayload['photos'] = []): CreateEquipmentPayload => ({
    title: form.title.trim(),
    categoryText: form.categoryText.trim(),
    equipmentGroupText: emptyToUndefined(form.equipmentGroupText),
    description: form.description.trim(),
    districtText: emptyToUndefined(form.districtText),
    address: emptyToUndefined(form.address),
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

  const validate = (): CreateEquipmentPayload | null => {
    const result = createEquipmentPayloadSchema.safeParse(buildPayload());

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
      setSubmitError('Откройте mini app из MAX, чтобы отправить технику на модерацию.');
      setMode('form');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const uploadedPhotos = await uploadAdPhotos(photos, validPayload.title, 8);
      const response = await apiClient.createEquipment(buildPayload(uploadedPhotos.map((photo) => ({
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
      setSubmitError(error instanceof Error ? error.message : 'Не удалось отправить технику');
      setMode('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title="Техника отправлена на модерацию"
          description="После одобрения объявление появится в разделе техники."
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
          <h1 className="text-3xl font-black text-text-primary">{payload.title}</h1>
          <p className="text-base leading-6 text-text-secondary">
            Проверьте карточку техники перед отправкой на модерацию.
          </p>
        </div>

        <AdCard
          to="#"
          typeLabel="Техника"
          title={payload.title}
          subtitle={payload.equipmentGroupText}
          coverImageUrl={previewCover}
          location={payload.address ?? payload.districtText}
          category={payload.categoryText}
          description={payload.description}
        />

        <SectionCard title="Описание">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{payload.description}</p>
        </SectionCard>

        <SectionCard title="Данные">
          <div className="grid gap-2">
            <PreviewFact label="Категория" value={payload.categoryText} />
            <PreviewFact label="Группа техники" value={payload.equipmentGroupText} />
            <PreviewFact label="Район / адрес" value={payload.address ?? payload.districtText} />
            <PreviewFact label="Фото" value={`${photos.length}/8`} />
          </div>
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
        <h1 className="text-3xl font-black text-text-primary">Новая техника</h1>
        <p className="text-base leading-6 text-text-secondary">
          Добавьте технику, контакты и район. Категории пока вводятся вручную, позже их можно заменить справочником.
        </p>
      </div>

      {submitError ? (
        <div className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {submitError}
        </div>
      ) : null}

      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <FormSection title="Техника">
          <Input
            label="Название"
            placeholder="Экскаватор-погрузчик JCB 3CX"
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
          />
          <FieldError errors={errors.title} />
          <SuggestionInput
            label="Категория техники"
            placeholder="Спецтехника, погрузчики, аренда"
            value={form.categoryText}
            loadSuggestions={loadCategorySuggestions}
            onChange={(event) => updateField('categoryText', event.target.value)}
          />
          <FieldError errors={errors.categoryText} />
          <Input
            label="Группа техники"
            placeholder="Опционально: земляные работы, складская техника"
            value={form.equipmentGroupText}
            onChange={(event) => updateField('equipmentGroupText', event.target.value)}
          />
          <Textarea
            label="Описание"
            placeholder="Состояние, комплектация, доступность, условия аренды или продажи."
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
          />
          <FieldError errors={errors.description} />
        </FormSection>

        <FormSection title="Фото" description="До 8 изображений. Первое фото станет обложкой.">
          <PhotoUploader files={photos} maxFiles={8} onFilesChange={setPhotos} />
        </FormSection>

        <FormSection title="Район / адрес">
          <SuggestionInput
            label="Район"
            placeholder="ЮВАО, Подольск, промзона"
            value={form.districtText}
            loadSuggestions={loadDistrictSuggestions}
            onChange={(event) => updateField('districtText', event.target.value)}
          />
          <Input
            label="Адрес / ориентир"
            placeholder="Опционально"
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
          />
        </FormSection>

        <FormSection title="Контакты">
          <ContactsEditor value={form.contacts} onChange={(contacts) => updateField('contacts', contacts)} />
          <FieldError errors={errors.contacts} />
        </FormSection>

        <SectionCard title="Черновик" description="Форма сохраняется на этом устройстве автоматически.">
          <div className="flex flex-wrap gap-2">
            <StatChip label="автосохранение" tone="green" icon={<Save size={15} />} />
            <StatChip label={`${photos.length}/8 фото`} />
            <StatChip label="ручные категории" tone="cyan" />
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
  value: EquipmentFormState['contacts'];
  onChange: (value: EquipmentFormState['contacts']) => void;
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
                type: event.target.value as EquipmentFormState['contacts'][number]['type']
              })
            }
          />
          <Input
            label="Подпись"
            placeholder="Диспетчер, владелец, сайт"
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

function PreviewFact({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-panel bg-surface-900 p-3">
      <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
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

function loadDraft(): EquipmentFormState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);

    if (!raw) {
      return initialForm;
    }

    return {
      ...initialForm,
      ...JSON.parse(raw)
    } as EquipmentFormState;
  } catch {
    return initialForm;
  }
}
