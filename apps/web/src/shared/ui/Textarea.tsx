import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ id, label, hint, error, ...props }: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold text-text-secondary">
        {label}
      </label>
      <textarea
        id={inputId}
        className={`min-h-28 rounded-panel border bg-surface-900/92 px-3 py-3 text-base text-text-primary outline-none placeholder:text-text-muted transition focus:border-accent-green ${
          error ? 'border-red-400/50 bg-red-500/5' : 'border-white/8'
        }`}
        {...props}
      />
      {error ? <p className="text-sm leading-5 text-red-200">{error}</p> : null}
      {!error && hint ? <p className="text-sm leading-5 text-text-muted">{hint}</p> : null}
    </div>
  );
}
