import type { ReactNode } from 'react';
import clsx from 'clsx';

interface AppPageProps {
  children: ReactNode;
  className?: string;
}

export function AppPage({ children, className }: AppPageProps) {
  return <section className={clsx('space-y-4', className)}>{children}</section>;
}
