import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface HeroBannerProps {
  eyebrow?: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
  aside?: ReactNode;
  className?: string;
}

export function HeroBanner({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaTo,
  aside,
  className
}: HeroBannerProps) {
  return (
    <section
      className={clsx(
        'overflow-hidden rounded-panel border border-accent-green/20 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.14),transparent_42%),linear-gradient(180deg,rgba(18,29,24,0.98),rgba(9,14,12,0.98))] p-5 shadow-glow app-fade-up',
        className
      )}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-green">{eyebrow}</p> : null}
          <h1 className="text-4xl font-black leading-[1.04] text-text-primary sm:text-[2.6rem]">{title}</h1>
          <p className="max-w-md text-base leading-6 text-text-secondary">{description}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Link
            to={ctaTo}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-panel bg-accent-green px-4 text-base font-bold text-surface-950 shadow-glow transition hover:bg-accent-green/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
          >
            {ctaLabel}
            <ArrowUpRight size={19} />
          </Link>
          {aside}
        </div>
      </div>
    </section>
  );
}
