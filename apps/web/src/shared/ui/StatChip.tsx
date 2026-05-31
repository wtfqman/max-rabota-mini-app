import type { ReactNode } from 'react';
import clsx from 'clsx';

interface StatChipProps {
  label: string;
  value?: string;
  tone?: 'green' | 'neutral';
  icon?: ReactNode;
}

export function StatChip({ label, value, tone = 'neutral', icon }: StatChipProps) {
  return (
    <span
      className={clsx(
        'inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-xs font-bold backdrop-blur-sm',
        tone === 'green' && 'border-accent-green/25 bg-accent-greenSoft text-accent-green',
        tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-text-secondary'
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 truncate">
        {value ? `${value} ` : null}
        {label}
      </span>
    </span>
  );
}
