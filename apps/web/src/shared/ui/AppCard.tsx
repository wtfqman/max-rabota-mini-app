import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export function AppCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(17,25,22,0.96),rgba(11,16,14,0.96))] p-4 shadow-panel app-fade-up',
        className
      )}
      {...props}
    />
  );
}
