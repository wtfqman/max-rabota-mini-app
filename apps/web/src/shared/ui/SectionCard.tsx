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
        'app-surface app-topline rounded-panel p-3 app-fade-up',
        className
      )}
      {...props}
    >
      {title || description || action ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="text-base font-extrabold text-text-primary">{title}</h2> : null}
            {description ? <p className="text-sm leading-5 text-text-secondary">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
