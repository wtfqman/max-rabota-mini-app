import { useId, type InputHTMLAttributes } from 'react';

import type { FocusEvent } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ id, label, hint, error, className, onFocus, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    onFocus?.(event);
    scrollFocusedControlIntoView(target);
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        className={clsx(
          'scroll-mb-44 scroll-mt-24 min-h-11 rounded-panel border bg-surface-900/92 px-3 text-[15px] font-semibold text-text-primary outline-none placeholder:font-normal placeholder:text-text-muted transition focus:border-accent-green focus:bg-surface-850 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)]',
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
