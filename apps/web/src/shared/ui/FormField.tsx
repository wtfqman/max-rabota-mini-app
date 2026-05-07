import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  children: ReactNode;
}

function FieldShell({ label, children }: FieldShellProps) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <FieldShell label={label}>
      <input
        className="min-h-12 rounded-panel border border-line bg-surface-900 px-3 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-green"
        {...props}
      />
    </FieldShell>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <FieldShell label={label}>
      <textarea
        className="min-h-28 rounded-panel border border-line bg-surface-900 px-3 py-3 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-green"
        {...props}
      />
    </FieldShell>
  );
}
