import { useEffect, useId, useState, type InputHTMLAttributes } from 'react';

interface SuggestionInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  loadSuggestions: (query?: string) => Promise<Array<{ value: string }>>;
}

export function SuggestionInput({
  id,
  label,
  hint,
  error,
  loadSuggestions,
  value,
  onChange,
  ...props
}: SuggestionInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;
  const [suggestions, setSuggestions] = useState<Array<{ value: string }>>([]);

  useEffect(() => {
    let active = true;
    const query = typeof value === 'string' ? value : undefined;

    loadSuggestions(query)
      .then((items) => {
        if (active) {
          setSuggestions(items.slice(0, 8));
        }
      })
      .catch(() => {
        if (active) {
          setSuggestions([]);
        }
      });

    return () => {
      active = false;
    };
  }, [loadSuggestions, value]);

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs font-extrabold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        list={listId}
        value={value}
        onChange={onChange}
        className={`min-h-[52px] rounded-panel border bg-surface-900/92 px-4 text-base font-semibold text-text-primary outline-none placeholder:font-normal placeholder:text-text-muted transition focus:border-accent-green focus:bg-surface-850 focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12)] ${
          error ? 'border-red-400/50 bg-red-500/5' : 'border-white/10'
        }`}
        {...props}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion.value} value={suggestion.value} />
        ))}
      </datalist>
      {error ? <p className="text-sm leading-5 text-red-200">{error}</p> : null}
      {!error && hint ? <p className="text-sm leading-5 text-text-muted">{hint}</p> : null}
    </div>
  );
}
