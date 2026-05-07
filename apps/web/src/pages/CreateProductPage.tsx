import { useEffect, useMemo, useState } from 'react';
import { Eye, Package, Plus, Save, Send, Trash2, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../app/store/app-store.js';
import { contactTypeOptions } from '../features/vacancies/create-vacancy.types.js';
import {
  createProductPayloadSchema,
  type CreateProductPayload,
  type ProductType
} from '../features/products/create-product.types.js';
import { uploadAdPhotos } from '../features/uploads/upload-flow.js';
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

const loadCategorySuggestions = async (q?: string) => (await apiClient.listCategorySuggestions(q)).data;
const loadDistrictSuggestions = async (q?: string) => (await apiClient.listDistrictSuggestions(q)).data;

interface ProductFormState {
  title: string;
  categoryText: string;
  description: string;
  priceAmount: string;
  districtText: string;
  address: string;
  contacts: Array<{
    type: 'MAX' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'OTHER';
    label: string;
    value: string;
    isPreferred: boolean;
  }>;
}

type FieldErrors = Partial<Record<keyof CreateProductPayload | 'form', string[]>>;

const initialForm: ProductFormState = {
  title: '',
  categoryText: '',
  description: '',
  priceAmount: '',
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

const productCopy = {
  material: {
    title: 'Строительные материалы',
    single: 'Материал',
    createTitle: 'Новые материалы',
    description: 'Добавьте название, цену, адрес и контакт. После проверки объявление появится в разделе материалов.',
    successTitle: 'Материалы отправлены',
    successDescription: 'Мы проверим объявление и аккуратно покажем его покупателям.',
    placeholder: 'Например: кирпич облицовочный, 1200 шт.',
    route: '/materials',
    icon: Package,
    submit: apiClient.createMaterial
  },
  tool: {
    title: 'Инструменты',
    single: 'Инструмент',
    createTitle: 'Новый инструмент',
    description: 'Разместите инструмент с фото, ценой и понятным контактом. После проверки он появится в ленте.',
    successTitle: 'Инструмент отправлен',
    successDescription: 'Объявление ушло на проверку и скоро будет готово к публикации.',
    placeholder: 'Например: перфоратор Bosch SDS-plus',
    route: '/tools',
    icon: Wrench,
    submit: apiClient.createTool
  }
} satisfies Record<
  ProductType,
  {
    title: string;
    single: string;
    createTitle: string;
    description: string;
    successTitle: string;
    successDescription: string;
    placeholder: string;
    route: string;
    icon: typeof Package;
    submit: (payload: CreateProductPayload) => Promise<unknown>;
  }
>;

export function CreateProductPage({ type }: { type: ProductType }) {
  const copy = productCopy[type];
  const Icon = copy.icon;
  const accessToken = useAppStore((state) => state.accessToken);
  const draftKey = `rabst24:create-${type}:draft`;
  const [mode, setMode] = useState<'form' | 'preview' | 'success'>('form');
  const [form, setForm] = useState<ProductFormState>(() => loadDraft(draftKey));
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form]);

  const previewCover = useMemo(() => (photos[0] ? URL.createObjectURL(photos[0]) : null), [photos]);

  useEffect(
    () => () => {
      if (previewCover) {
        URL.revokeObjectURL(previewCover);
      }
    },
    [previewCover]
  );

  const updateField = <TKey extends keyof ProductFormState>(key: TKey, value: ProductFormState[TKey]) => {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const buildPayload = (uploadedPhotos: CreateProductPayload['photos'] = []): CreateProductPayload => ({
    title: form.title.trim(),
    categoryText: emptyToUndefined(form.categoryText),
    description: form.description.trim(),
    priceAmount: toNumber(form.priceAmount),
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

  const validate = (): CreateProductPayload | null => {
    const result = createProductPayloadSchema.safeParse(buildPayload());

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors as FieldErrors);
      setSubmitError('Проверьте обязательные поля и попробуйте ещё раз.');
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
      setSubmitError('Откройте приложение из MAX, чтобы отправить объявление.');
      setMode('form');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const uploadedPhotos = await uploadAdPhotos(photos, validPayload.title, 8);
      await copy.submit(
        buildPayload(
          uploadedPhotos.map((photo) => ({
            storageKey: photo.storageKey,
            url: photo.url,
            previewUrl: photo.previewUrl ?? undefined,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            altText: photo.altText ?? undefined
          }))
        )
      );

      window.localStorage.removeItem(draftKey);
      setMode('success');
    } catch (error) {
      setSubmitError(getUserFacingError(error, 'product_submit'));
      setMode('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mode === 'success') {
    return (
      <AppPage>
        <EmptyState
          title={copy.successTitle}
          description={copy.successDescription}
          action={
            <div className="grid w-full gap-2">
              <Link
                to="/my-ads"
                className="inline-flex min-h-12 items-center justify-center rounded-panel bg-accent-green px-4 text-base font-semibold text-surface-950 shadow-glow"
              >
                Мои объявления
              </Link>
              <Link
                to={copy.route}
                className="inline-flex min-h-12 items-center justify-center rounded-panel border border-white/8 bg-surface-850 px-4 text-base font-semibold text-text-secondary"
              >
                Открыть раздел
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
            Проверьте карточку перед отправкой. Так объявление будет выглядеть в ленте.
          </p>
        </div>

        <AdCard
          to="#"
          typeLabel={copy.single}
          title={payload.title}
          coverImageUrl={previewCover}
          location={payload.address ?? payload.districtText}
          price={payload.priceAmount ? `${payload.priceAmount} ₽` : undefined}
          category={payload.categoryText}
          description={payload.description}
        />

        <SectionCard title="Описание">
          <p className="whitespace-pre-line text-base leading-7 text-text-secondary">{payload.description}</p>
        </SectionCard>

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
            Править
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
        <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-accent-greenSoft text-accent-green">
          <Icon size={24} />
        </div>
        <h1 className="text-3xl font-black text-text-primary">{copy.createTitle}</h1>
        <p className="text-base leading-6 text-text-secondary">{copy.description}</p>
      </div>

      {submitError ? (
        <div className="rounded-panel border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {submitError}
        </div>
      ) : null}

      <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <FormSection title="Объявление">
          <Input
            label="Название"
            placeholder={copy.placeholder}
            value={form.title}
            error={firstError(errors.title)}
            onChange={(event) => updateField('title', event.target.value)}
          />
          <SuggestionInput
            label="Категория"
            placeholder="Например: кирпич, сухие смеси, электроинструмент"
            value={form.categoryText}
            loadSuggestions={loadCategorySuggestions}
            onChange={(event) => updateField('categoryText', event.target.value)}
          />
          <Input
            label="Цена"
            placeholder="Например: 15000"
            inputMode="numeric"
            value={form.priceAmount}
            error={firstError(errors.priceAmount)}
            onChange={(event) => updateField('priceAmount', event.target.value)}
          />
          <Textarea
            label="Описание"
            placeholder="Состояние, количество, условия передачи и важные детали."
            value={form.description}
            error={firstError(errors.description)}
            onChange={(event) => updateField('description', event.target.value)}
          />
        </FormSection>

        <FormSection title="Фото" description="До 8 изображений. Первое фото станет обложкой.">
          <PhotoUploader files={photos} maxFiles={8} onFilesChange={setPhotos} />
        </FormSection>

        <FormSection title="Адрес">
          <SuggestionInput
            label="Район"
            placeholder="ЮВАО, Подольск, центр"
            value={form.districtText}
            loadSuggestions={loadDistrictSuggestions}
            onChange={(event) => updateField('districtText', event.target.value)}
          />
          <Input
            label="Адрес или ориентир"
            placeholder="Где можно посмотреть или забрать"
            value={form.address}
            onChange={(event) => updateField('address', event.target.value)}
          />
        </FormSection>

        <FormSection title="Контакты">
          <ContactsEditor value={form.contacts} onChange={(contacts) => updateField('contacts', contacts)} />
          {firstError(errors.contacts) ? <p className="text-sm text-red-200">{firstError(errors.contacts)}</p> : null}
        </FormSection>

        <SectionCard title="Черновик" description="Форма сохраняется на этом устройстве автоматически.">
          <div className="flex flex-wrap gap-2">
            <StatChip label="автосохранение" tone="green" icon={<Save size={15} />} />
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

function ContactsEditor({
  value,
  onChange
}: {
  value: ProductFormState['contacts'];
  onChange: (value: ProductFormState['contacts']) => void;
}) {
  return (
    <div className="grid gap-3">
      {value.map((contact, index) => (
        <div key={index} className="grid gap-3 rounded-panel border border-white/8 bg-surface-900/90 p-3">
          <Select
            label="Тип"
            value={contact.type}
            options={contactTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) =>
              updateArrayItem(value, onChange, index, {
                type: event.target.value as ProductFormState['contacts'][number]['type']
              })
            }
          />
          <Input
            label="Подпись"
            placeholder="Продавец, склад, MAX"
            value={contact.label}
            onChange={(event) => updateArrayItem(value, onChange, index, { label: event.target.value })}
          />
          <Input
            label="Телефон или контакт"
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

function loadDraft(draftKey: string): ProductFormState {
  try {
    const raw = window.localStorage.getItem(draftKey);

    if (!raw) {
      return initialForm;
    }

    return {
      ...initialForm,
      ...JSON.parse(raw)
    } as ProductFormState;
  } catch {
    return initialForm;
  }
}
