import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';

interface LinkButtonProps extends LinkProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: ReactNode;
}

export function LinkButton({ className, variant = 'primary', icon, children, ...props }: LinkButtonProps) {
  return (
    <Link
      className={clsx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-panel px-4 text-sm font-semibold transition duration-200 active:scale-[0.985]',
        variant === 'primary' && 'bg-accent-green text-surface-950 shadow-glow hover:bg-accent-green/90',
        variant === 'secondary' && 'border border-white/10 bg-surface-800/92 text-text-primary hover:border-accent-green/35',
        variant === 'ghost' && 'bg-transparent text-text-secondary hover:bg-white/[0.03] hover:text-text-primary',
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}
