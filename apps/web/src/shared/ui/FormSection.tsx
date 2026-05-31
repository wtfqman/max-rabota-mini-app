import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="app-surface app-topline space-y-3 rounded-panel p-3 app-fade-up">
      <legend className="px-1 text-base font-extrabold text-text-primary">{title}</legend>
      {description ? <p className="text-sm leading-5 text-text-secondary">{description}</p> : null}
      <div className="grid gap-3">{children}</div>
    </fieldset>
  );
}
