import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: ReactNode;
}

export function ActionButton({
  className,
  variant = 'primary',
  icon,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-panel px-4 text-base font-semibold transition duration-200 will-change-transform',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
        'active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-accent-green text-surface-950 shadow-glow hover:bg-accent-green/90 hover:shadow-[0_0_26px_rgba(52,211,153,0.18)]',
        variant === 'secondary' &&
          'border border-white/10 bg-surface-800/92 text-text-primary hover:border-accent-green/35 hover:bg-surface-800',
        variant === 'quiet' && 'bg-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary',
        variant === 'danger' && 'border border-red-400/30 bg-red-500/10 text-red-200 hover:border-red-300/60',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
