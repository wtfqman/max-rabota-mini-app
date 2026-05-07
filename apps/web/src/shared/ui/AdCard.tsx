import { BriefcaseBusiness, Heart, MapPin, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatChip } from './StatChip.js';

export interface AdCardProps {
  to: string;
  title: string;
  typeLabel: string;
  location?: string | null;
  price?: string;
  description?: string | null;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  category?: string | null;
  chips?: Array<{ key: string; value: string }>;
  isFavorite?: boolean;
  onFavoriteClick?: () => void;
}

export function AdCard({
  to,
  title,
  typeLabel,
  location,
  price,
  description,
  subtitle,
  coverImageUrl,
  category,
  chips = [],
  isFavorite,
  onFavoriteClick
}: AdCardProps) {
  return (
    <Link
      to={to}
      className="block overflow-hidden rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.98),rgba(10,15,13,0.98))] shadow-panel transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/28 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
    >
      <article className="space-y-4">
        {coverImageUrl ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-surface-800">
            <img src={coverImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface-950/80 to-transparent" />
          </div>
        ) : (
          <div className="relative flex aspect-[16/9] items-end overflow-hidden bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.18),transparent_40%),linear-gradient(180deg,#101715,#0a0f0d)] px-4 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-accent-greenSoft text-accent-green">
              <BriefcaseBusiness size={22} />
            </div>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel bg-accent-greenSoft text-accent-green">
              <BriefcaseBusiness size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent-green">{typeLabel}</p>
              <h2 className="truncate text-lg font-bold text-text-primary">{title}</h2>
              {subtitle ? <p className="truncate text-sm text-text-secondary">{subtitle}</p> : null}
            </div>
          </div>
          {onFavoriteClick ? (
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-surface-900/92 text-text-muted transition hover:border-accent-green/30 hover:text-accent-green active:scale-95"
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

        <div className="space-y-3 px-4 pb-4">
          {description ? <p className="line-clamp-2 text-sm leading-5 text-text-secondary">{description}</p> : null}
          <div className="flex flex-wrap gap-2">
            {location ? <StatChip label={location} icon={<MapPin size={15} />} /> : null}
            {price ? <StatChip label={price} tone="green" /> : null}
            {category ? <StatChip label={category} tone="cyan" icon={<Tag size={15} />} /> : null}
            {chips.map((chip) => (
              <StatChip key={chip.key} label={chip.value} />
            ))}
          </div>
        </div>
      </article>
    </Link>
  );
}

export function AdCardSkeleton() {
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
