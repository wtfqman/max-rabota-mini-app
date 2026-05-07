import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { AppCard } from './AppCard.js';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <AppCard className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent-green/20 bg-accent-greenSoft text-accent-green shadow-[0_0_24px_rgba(52,211,153,0.12)]">
        <Inbox size={24} />
      </div>
      <div className="max-w-xs space-y-1.5">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </AppCard>
  );
}
