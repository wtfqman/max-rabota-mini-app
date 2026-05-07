import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

export function SearchBar({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={clsx('relative block', className)}>
      <span className="sr-only">Поиск</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
      <input
        className="min-h-[52px] w-full rounded-panel border border-white/8 bg-surface-850/92 py-3 pl-11 pr-3 text-base text-text-primary outline-none placeholder:text-text-muted transition focus:border-accent-green"
        placeholder="Поиск"
        {...props}
      />
    </label>
  );
}
