import type { ReactNode } from 'react';
import clsx from 'clsx';

interface StatChipProps {
  label: string;
  value?: string;
  tone?: 'green' | 'cyan' | 'amber' | 'violet' | 'neutral';
  icon?: ReactNode;
}

export function StatChip({ label, value, tone = 'neutral', icon }: StatChipProps) {
  return (
    <span
      className={clsx(
        'inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold backdrop-blur-sm',
        tone === 'green' && 'border-accent-green/25 bg-accent-greenSoft text-accent-green',
        tone === 'cyan' && 'border-accent-cyan/25 bg-accent-cyan/10 text-accent-cyan',
        tone === 'amber' && 'border-accent-amber/25 bg-accent-amber/10 text-accent-amber',
        tone === 'violet' && 'border-accent-violet/25 bg-accent-violet/10 text-accent-violet',
        tone === 'neutral' && 'border-white/8 bg-white/[0.03] text-text-secondary'
      )}
    >
      {icon}
      <span>
        {value ? `${value} ` : null}
        {label}
      </span>
    </span>
  );
}
