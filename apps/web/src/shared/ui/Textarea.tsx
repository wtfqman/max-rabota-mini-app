import { useId, type TextareaHTMLAttributes } from 'react';

import type { FocusEvent } from 'react';
import clsx from 'clsx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ id, label, hint, error, className, onFocus, ...props }: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    onFocus?.(event);
    scrollFocusedControlIntoView(target);
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </label>
      <textarea
        id={inputId}
        className={clsx(
          'scroll-mb-44 scroll-mt-24 min-h-28 rounded-panel border bg-surface-900/92 px-3 py-2.5 text-[15px] font-semibold leading-5 text-text-primary outline-none placeholder:font-normal placeholder:text-text-muted transition focus:border-accent-green focus:bg-surface-850 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)]',
          error ? 'border-red-400/50 bg-red-500/5' : 'border-white/10',
          className
        )}
        onFocus={handleFocus}
        {...props}
      />
      {error ? <p className="text-sm leading-5 text-red-200">{error}</p> : null}
      {!error && hint ? <p className="text-sm leading-5 text-text-muted">{hint}</p> : null}
    </div>
  );
}

function scrollFocusedControlIntoView(target: HTMLElement) {
  window.setTimeout(() => {
    if (document.activeElement === target) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }, 320);
}
