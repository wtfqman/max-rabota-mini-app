import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

export function SearchBar({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={clsx('relative block', className)}>
      <span className="sr-only">Поиск</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-green" size={18} />
      <input
        className="min-h-11 w-full rounded-panel border border-white/10 bg-surface-900/92 py-2.5 pl-10 pr-3 text-sm font-semibold text-text-primary outline-none placeholder:font-normal placeholder:text-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition focus:border-accent-green focus:bg-surface-850 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)]"
        placeholder="Поиск"
        {...props}
      />
    </label>
  );
}
