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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.12),transparent_34%),linear-gradient(180deg,#11110f,#070807)] px-4 text-text-primary">
      <section className="app-surface app-topline flex w-full max-w-sm flex-col items-center gap-4 rounded-panel p-4 text-center app-fade-in">
        {!actionLabel ? <Loader2 className="animate-spin text-accent-green" size={30} /> : null}
        <div className="space-y-2">
          <h1 className="text-2xl font-black leading-tight">{title}</h1>
          {description ? <p className="text-sm leading-5 text-text-secondary">{description}</p> : null}
        </div>
        {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      </section>
    </main>
  );
}
