import { UserRound } from 'lucide-react';
import { StatChip } from './StatChip.js';

interface ProfileHeaderProps {
  name: string;
  subtitle: string;
  avatarUrl?: string;
  stats: Array<{ label: string; value: string }>;
}

export function ProfileHeader({ name, subtitle, avatarUrl, stats }: ProfileHeaderProps) {
  return (
    <section className="app-surface app-topline rounded-panel p-4 text-center app-fade-up">
      <div className="flex flex-col items-center gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-accent-green object-cover p-1" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-accent-green bg-accent-greenSoft p-1 text-accent-green shadow-[0_0_32px_rgba(52,211,153,0.18)]">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-900">
              <UserRound size={28} />
            </span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-text-primary">{name}</h1>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {stats.map((stat) => (
          <StatChip key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </div>
    </section>
  );
}
