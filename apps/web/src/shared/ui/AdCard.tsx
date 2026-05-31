import { BriefcaseBusiness, FileUser, Heart, MapPin, Package, Tag, Truck, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MediaPreview } from './MediaPreview.js';
import { StatChip } from './StatChip.js';

export interface AdCardProps {
  to: string;
  title: string;
  typeLabel: string;
  variant?: 'default' | 'compact' | 'grid';
  location?: string | null;
  price?: string;
  description?: string | null;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  coverMimeType?: string | null;
  category?: string | null;
  chips?: Array<{ key: string; value: string }>;
  isFavorite?: boolean;
  onFavoriteClick?: () => void;
}

export function AdCard({
  to,
  title,
  typeLabel,
  variant = 'default',
  location,
  price,
  description,
  subtitle,
  coverImageUrl,
  coverMimeType,
  category,
  chips = [],
  isFavorite,
  onFavoriteClick
}: AdCardProps) {
  const Icon = getTypeIcon(typeLabel);
  const gridMeta = getGridMeta({ typeLabel, subtitle, location, category, chips });
  const gridPrice = price ?? 'По договоренности';

  if (variant === 'grid') {
    return (
      <Link
        to={to}
        className="group block h-full overflow-hidden rounded-panel border border-white/8 bg-surface-900/95 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition duration-200 hover:border-accent-green/35 hover:bg-surface-850 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
      >
        <article className="flex h-full flex-col">
          <div className="relative aspect-[4/3] overflow-hidden bg-surface-800">
            {coverImageUrl ? (
              <MediaPreview src={coverImageUrl} mimeType={coverMimeType} className="h-full w-full object-cover" controls={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(52,211,153,0.2),rgba(18,58,42,0.14)_46%,transparent),linear-gradient(180deg,#101815,#050807)] text-accent-green">
                <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/25 bg-accent-greenSoft/80">
                  <Icon size={26} />
                </div>
              </div>
            )}

            {onFavoriteClick ? (
              <button
                type="button"
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-surface-950/84 text-white shadow-[0_8px_20px_rgba(0,0,0,0.32)] backdrop-blur transition hover:border-accent-green/40 hover:text-accent-green active:scale-95"
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                onClick={(event) => {
                  event.preventDefault();
                  onFavoriteClick();
                }}
              >
                <Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={17} />
              </button>
            ) : null}
          </div>

          <div className="flex min-h-[112px] flex-1 flex-col gap-1.5 px-2.5 py-2.5">
            <h2 className="line-clamp-2 min-h-[2.35rem] break-words text-[13px] font-extrabold leading-[1.18] text-text-primary">
              {title}
            </h2>
            <p className="line-clamp-1 min-h-5 text-[13px] font-black leading-5 text-text-primary">{gridPrice}</p>
            <p className="line-clamp-2 min-h-8 text-xs font-medium leading-4 text-text-secondary">
              {gridMeta || typeLabel}
            </p>
          </div>
        </article>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link
        to={to}
        className="app-surface app-topline block overflow-hidden rounded-panel p-4 transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
      >
        <article className="space-y-4">
          <div className="flex items-start gap-3">
            {coverImageUrl ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-panel border border-white/10 bg-surface-800">
                <MediaPreview src={coverImageUrl} mimeType={coverMimeType} className="h-full w-full object-cover" controls={false} />
              </div>
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-panel border border-accent-green/20 bg-accent-greenSoft text-accent-green">
                <Icon size={24} />
              </div>
            )}

            <div className="min-w-0 flex-1 pt-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-accent-green">{typeLabel}</p>
              <h2 className="mt-1 line-clamp-2 text-xl font-black leading-tight text-text-primary">{title}</h2>
              {subtitle ? <p className="mt-1 line-clamp-1 text-sm font-semibold text-text-secondary">{subtitle}</p> : null}
            </div>

            {onFavoriteClick ? (
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface-900/92 text-white transition hover:border-accent-green/40 active:scale-95"
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                onClick={(event) => {
                  event.preventDefault();
                  onFavoriteClick();
                }}
              >
                <Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={20} />
              </button>
            ) : null}
          </div>

          {description ? <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{description}</p> : null}

          <div className="flex flex-wrap gap-2">
            {location ? <StatChip label={location} icon={<MapPin size={15} />} /> : null}
            {price ? <StatChip label={price} tone="green" /> : null}
            {category ? <StatChip label={category} tone="green" icon={<Tag size={15} />} /> : null}
            {chips.map((chip) => (
              <StatChip key={chip.key} label={chip.value} />
            ))}
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className="app-surface block overflow-hidden rounded-panel transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
    >
      <article className="space-y-4">
        {coverImageUrl ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-surface-800">
            <MediaPreview src={coverImageUrl} mimeType={coverMimeType} className="h-full w-full object-cover" controls={false} />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface-950/90 to-transparent" />
            <span className="absolute left-4 top-4 rounded-full border border-black/20 bg-surface-950/78 px-3 py-1 text-xs font-extrabold text-accent-green backdrop-blur">
              {typeLabel}
            </span>
          </div>
        ) : (
          <div className="relative flex aspect-[16/9] items-end overflow-hidden bg-[linear-gradient(135deg,rgba(52,211,153,0.18),transparent_42%),linear-gradient(180deg,#101815,#050807)] px-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel border border-accent-green/20 bg-accent-greenSoft text-accent-green">
              <Icon size={22} />
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel border border-accent-green/20 bg-accent-greenSoft text-accent-green">
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-accent-green">{typeLabel}</p>
              <h2 className="truncate text-xl font-black text-text-primary">{title}</h2>
              {subtitle ? <p className="truncate text-sm text-text-secondary">{subtitle}</p> : null}
            </div>
          </div>
          {onFavoriteClick ? (
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-surface-900/92 text-white transition hover:border-accent-green/40 hover:text-accent-green active:scale-95"
              aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              onClick={(event) => {
                event.preventDefault();
                onFavoriteClick();
              }}
            >
              <Heart className={isFavorite ? 'fill-accent-green text-accent-green' : ''} size={21} />
            </button>
          ) : null}
        </div>

        <div className="space-y-3 px-4 pb-4">
          {description ? <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{description}</p> : null}
          <div className="flex flex-wrap gap-2">
            {location ? <StatChip label={location} icon={<MapPin size={15} />} /> : null}
            {price ? <StatChip label={price} tone="green" /> : null}
            {category ? <StatChip label={category} tone="green" icon={<Tag size={15} />} /> : null}
            {chips.map((chip) => (
              <StatChip key={chip.key} label={chip.value} />
            ))}
          </div>
        </div>
      </article>
    </Link>
  );
}

function getTypeIcon(typeLabel: string) {
  const normalized = typeLabel.toLowerCase();

  if (normalized.includes('резюме')) {
    return FileUser;
  }

  if (normalized.includes('материал')) {
    return Package;
  }

  if (normalized.includes('инструмент')) {
    return Wrench;
  }

  if (
    normalized.includes('техник') ||
    normalized.includes('экскаватор') ||
    normalized.includes('кран') ||
    normalized.includes('груз')
  ) {
    return Truck;
  }

  return BriefcaseBusiness;
}

function getGridMeta({
  typeLabel,
  subtitle,
  location,
  category,
  chips
}: Pick<AdCardProps, 'typeLabel' | 'subtitle' | 'location' | 'category' | 'chips'>): string {
  const normalized = typeLabel.toLowerCase();
  const firstChip = chips?.[0]?.value ?? null;

  if (normalized.includes('резюме')) {
    return joinUnique([subtitle, location, firstChip]);
  }

  if (normalized.includes('вакан')) {
    return joinUnique([location, firstChip, subtitle]);
  }

  return joinUnique([location, category, subtitle, firstChip]);
}

function joinUnique(values: Array<string | null | undefined>): string {
  const unique: string[] = [];

  values.forEach((value) => {
    const trimmed = value?.trim();
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  });

  return unique.slice(0, 2).join(' / ');
}

export function AdCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'grid' } = {}) {
  if (variant === 'grid') {
    return (
      <div className="overflow-hidden rounded-panel border border-white/8 bg-surface-900/95">
        <div className="soft-shimmer aspect-[4/3] bg-surface-800" />
        <div className="min-h-[112px] space-y-2 px-2.5 py-2.5">
          <div className="soft-shimmer h-4 rounded bg-surface-700" />
          <div className="soft-shimmer h-4 w-4/5 rounded bg-surface-700" />
          <div className="soft-shimmer h-5 w-2/3 rounded bg-surface-700" />
          <div className="soft-shimmer mt-4 h-3 w-1/2 rounded bg-surface-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-white/8 bg-surface-850 shadow-panel">
      <div className="soft-shimmer aspect-[16/9] bg-surface-800" />
      <div className="space-y-4">
        <div className="flex gap-3 p-4">
          <div className="soft-shimmer h-11 w-11 rounded-panel bg-surface-700" />
          <div className="flex-1 space-y-2">
            <div className="soft-shimmer h-4 w-24 rounded bg-surface-700" />
            <div className="soft-shimmer h-5 w-3/4 rounded bg-surface-700" />
          </div>
        </div>
        <div className="space-y-2 px-4 pb-4">
          <div className="soft-shimmer h-4 rounded bg-surface-700" />
          <div className="soft-shimmer h-4 w-2/3 rounded bg-surface-700" />
        </div>
      </div>
    </div>
  );
}
