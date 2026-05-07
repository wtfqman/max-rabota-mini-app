import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="space-y-4 rounded-panel border border-white/8 bg-[linear-gradient(180deg,rgba(16,23,20,0.96),rgba(10,15,13,0.96))] p-4 shadow-panel app-fade-up">
      <legend className="px-1 text-lg font-bold text-text-primary">{title}</legend>
      {description ? <p className="text-sm leading-5 text-text-secondary">{description}</p> : null}
      <div className="grid gap-4">{children}</div>
    </fieldset>
  );
}
