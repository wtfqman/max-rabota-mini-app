import { useId, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
}

export function Select({ id, label, options, error, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="grid gap-2">
      <label htmlFor={selectId} className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </label>
      <select
        id={selectId}
        className={`min-h-[52px] rounded-panel border bg-surface-900/92 px-4 text-base font-semibold text-text-primary outline-none transition focus:border-accent-green focus:bg-surface-850 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)] ${
          error ? 'border-red-400/50 bg-red-500/5' : 'border-white/10'
        }`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm leading-5 text-red-200">{error}</p> : null}
    </div>
  );
}
