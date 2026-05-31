import type { ReactNode } from 'react';

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent-green/25 bg-accent-greenSoft px-3 py-1 text-xs font-semibold text-accent-green">
      {children}
    </span>
  );
}
