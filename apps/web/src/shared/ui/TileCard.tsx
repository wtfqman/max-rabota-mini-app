import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface TileCardProps {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: 'green' | 'neutral';
  className?: string;
}

export function TileCard({ to, title, description, icon, tone = 'green', className }: TileCardProps) {
  return (
    <Link
      to={to}
      className={clsx(
        'app-surface app-topline group flex min-h-28 flex-col justify-between rounded-panel p-3 transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]',
        className
      )}
    >
      <div
        className={clsx(
          'flex h-10 w-10 items-center justify-center rounded-panel border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
          tone === 'green' && 'border-accent-green/25 bg-accent-greenSoft text-accent-green',
          tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-text-secondary'
        )}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-text-primary">{title}</h2>
          <ArrowRight className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-green" size={17} />
        </div>
        <p className="text-xs leading-4 text-text-secondary">{description}</p>
      </div>
    </Link>
  );
}
