import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface TileCardProps {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: 'green' | 'cyan' | 'amber' | 'violet';
}

export function TileCard({ to, title, description, icon, tone = 'green' }: TileCardProps) {
  return (
    <Link
      to={to}
      className="group flex min-h-28 flex-col justify-between rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,21,0.96),rgba(10,15,13,0.96))] p-4 shadow-panel transition duration-200 hover:translate-y-[-1px] hover:border-accent-green/28 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green active:scale-[0.985]"
    >
      <div
        className={clsx(
          'flex h-11 w-11 items-center justify-center rounded-panel',
          tone === 'green' && 'bg-accent-greenSoft text-accent-green',
          tone === 'cyan' && 'bg-accent-cyan/10 text-accent-cyan',
          tone === 'amber' && 'bg-accent-amber/10 text-accent-amber',
          tone === 'violet' && 'bg-accent-violet/10 text-accent-violet'
        )}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        <p className="text-sm leading-5 text-text-secondary">{description}</p>
      </div>
    </Link>
  );
}
