import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface SectionCardProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function SectionCard({ title, description, action, className, children, ...props }: SectionCardProps) {
  return (
    <section
      className={clsx(
        'rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.96),rgba(10,15,13,0.96))] p-4 shadow-panel app-fade-up',
        className
      )}
      {...props}
    >
      {title || description || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-lg font-bold text-text-primary">{title}</h2> : null}
            {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
