import { Loader2 } from 'lucide-react';
import { Button } from './Button.js';

interface FullscreenStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FullscreenState({ title, description, actionLabel, onAction }: FullscreenStateProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-950 px-5 text-text-primary">
      <section className="flex w-full max-w-sm flex-col items-center gap-5 text-center app-fade-in">
        {!actionLabel ? <Loader2 className="animate-spin text-accent-green" size={28} /> : null}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
        </div>
        {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      </section>
    </main>
  );
}
