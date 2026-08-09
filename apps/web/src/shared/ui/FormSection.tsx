import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="app-surface app-topline space-y-2 rounded-panel p-2.5 app-fade-up">
      <legend className="px-1 text-[15px] font-extrabold text-text-primary">{title}</legend>
      {description ? <p className="text-xs font-medium leading-4 text-text-secondary">{description}</p> : null}
      <div className="grid gap-2.5">{children}</div>
    </fieldset>
  );
}
